import { BadRequestException } from '@nestjs/common';
import { Role, TicketPriority } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS } from './analytics.constants';
import {
  analyticsTicketSql,
  analyticsTicketWhere,
  resolveWindow,
} from './analytics.filters';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function user(role: Role, id = 'user-1'): AuthenticatedUser {
  return { id, email: `${id}@opsnow.local`, role };
}

describe('resolveWindow', () => {
  it('defaults to the last DEFAULT_WINDOW_DAYS ending now', () => {
    const { from, to } = resolveWindow({}, NOW);
    expect(to).toEqual(NOW);
    expect(from.getTime()).toBe(NOW.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  });

  it('anchors a missing `from` to the supplied `to`', () => {
    const to = new Date('2026-03-01T00:00:00.000Z');
    const { from } = resolveWindow({ to }, NOW);
    expect(from.getTime()).toBe(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  });

  it('defaults a missing `to` to now', () => {
    const from = new Date('2026-06-01T00:00:00.000Z');
    expect(resolveWindow({ from }, NOW)).toEqual({ from, to: NOW });
  });

  it('accepts a window of exactly MAX_WINDOW_DAYS', () => {
    const from = new Date(NOW.getTime() - MAX_WINDOW_DAYS * DAY_MS);
    expect(() => resolveWindow({ from, to: NOW }, NOW)).not.toThrow();
  });

  it('rejects a window wider than MAX_WINDOW_DAYS rather than narrowing it', () => {
    const from = new Date(NOW.getTime() - (MAX_WINDOW_DAYS + 1) * DAY_MS);
    expect(() => resolveWindow({ from, to: NOW }, NOW)).toThrow(
      BadRequestException,
    );
  });

  it('rejects an inverted window', () => {
    const from = new Date('2026-06-10T00:00:00.000Z');
    const to = new Date('2026-06-01T00:00:00.000Z');
    expect(() => resolveWindow({ from, to }, NOW)).toThrow(BadRequestException);
  });

  it('accepts an empty (from === to) window', () => {
    expect(() => resolveWindow({ from: NOW, to: NOW }, NOW)).not.toThrow();
  });
});

describe('analyticsTicketWhere', () => {
  it('ANDs Employee visibility as its own clause', () => {
    const where = analyticsTicketWhere(user(Role.Employee, 'emp-1'), {});
    expect(where).toEqual({
      AND: [{ deletedAt: null, requesterId: 'emp-1' }, {}],
    });
  });

  it.each([Role.SupportAgent, Role.TeamLead, Role.Administrator])(
    'does not restrict %s to their own tickets',
    (role) => {
      const where = analyticsTicketWhere(user(role), {});
      expect(where).toEqual({ AND: [{ deletedAt: null }, {}] });
    },
  );

  it('keeps filters in a separate clause so they cannot displace visibility', () => {
    const where = analyticsTicketWhere(user(Role.Employee, 'emp-1'), {
      priority: TicketPriority.High,
      categoryId: UUID_A,
      assigneeId: UUID_B,
    });
    expect(where).toEqual({
      AND: [
        { deletedAt: null, requesterId: 'emp-1' },
        { priority: 'High', categoryId: UUID_A, assigneeId: UUID_B },
      ],
    });
  });
});

describe('analyticsTicketSql', () => {
  it('binds the requester id for an Employee and never inlines it', () => {
    const sql = analyticsTicketSql(user(Role.Employee, 'emp-1'), {});
    expect(sql.text).toContain('t.requester_id = $1::uuid');
    expect(sql.text).not.toContain('emp-1');
    expect(sql.values).toEqual(['emp-1']);
  });

  it('applies only the soft-delete guard for staff', () => {
    const sql = analyticsTicketSql(user(Role.SupportAgent), {});
    expect(sql.text).toBe('t.deleted_at IS NULL');
    expect(sql.values).toEqual([]);
  });

  it('ANDs each filter after visibility, all as bound parameters', () => {
    const sql = analyticsTicketSql(user(Role.Employee, 'emp-1'), {
      priority: TicketPriority.Critical,
      categoryId: UUID_A,
      assigneeId: UUID_B,
    });
    expect(sql.values).toEqual(['emp-1', 'Critical', UUID_A, UUID_B]);
    expect(sql.text.indexOf('requester_id')).toBeLessThan(
      sql.text.indexOf('priority'),
    );
    expect(sql.text).not.toContain(UUID_A);
    expect(sql.text).not.toContain('Critical');
  });
});

describe('AnalyticsQueryDto validation', () => {
  async function errorsFor(plain: Record<string, unknown>): Promise<string[]> {
    const errors = await validate(plainToInstance(AnalyticsQueryDto, plain));
    return errors.map((e) => e.property);
  }

  it('accepts an empty query', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts a fully populated query', async () => {
    expect(
      await errorsFor({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        priority: 'High',
        categoryId: UUID_A,
        assigneeId: UUID_B,
      }),
    ).toEqual([]);
  });

  it('rejects a malformed date, a bad enum and a non-uuid', async () => {
    const props = await errorsFor({
      from: 'yesterday',
      priority: 'Urgent',
      categoryId: 'nope',
      assigneeId: '123',
    });
    expect(props.sort()).toEqual(
      ['assigneeId', 'categoryId', 'from', 'priority'].sort(),
    );
  });

  it('rejects to < from on `to`', async () => {
    expect(
      await errorsFor({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual(['to']);
  });
});
