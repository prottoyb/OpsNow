import { CommentVisibility, TicketPriority, TicketStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignTicketDto } from './assign-ticket.dto';
import { CreateTicketCommentDto } from './create-ticket-comment.dto';
import { CreateTicketDto } from './create-ticket.dto';
import { ListTicketsQueryDto } from './list-tickets-query.dto';
import { UpdateTicketDto } from './update-ticket.dto';

/**
 * DTO-level validation is the first line that keeps unbounded or malformed
 * input away from the database. The control-character cases matter most:
 * Postgres rejects U+0000 in a text value (SQLSTATE 22021) and Prisma
 * surfaces that as a PrismaClientUnknownRequestError, which no service's
 * `mapPrismaError` recognises — so before Phase 13 a NUL byte in any of
 * these fields reached the client as a 500 rather than the 400 malformed
 * input deserves. These tests exist so that cannot regress.
 *
 * The characters are written as TypeScript escapes, matching the asset and
 * knowledge-base DTO specs, so that the source file itself stays plain
 * ASCII and git keeps diffing it as text rather than as a binary blob.
 */
const NUL = '\u0000';
const BELL = '\u0007';
const ESC = '\u001B';
const DEL = '\u007F';

function failedProperties(dto: object): string[] {
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (error) => error.property,
  );
}

function createDto(overrides: Record<string, unknown> = {}): CreateTicketDto {
  return plainToInstance(CreateTicketDto, {
    subject: 'Laptop will not boot',
    description: 'Nothing happens when the power button is pressed.',
    ...overrides,
  });
}

describe('CreateTicketDto', () => {
  it('accepts a valid payload', () => {
    expect(failedProperties(createDto())).toEqual([]);
  });

  it.each([
    ['subject', { subject: 'x'.repeat(256) }],
    ['description', { description: 'x'.repeat(10001) }],
  ])('rejects an oversized %s', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([
    ['subject', { subject: '   ' }],
    ['description', { description: '   ' }],
  ])('rejects a whitespace-only %s (trimmed before validation)', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([
    ['subject', 'NUL', { subject: `Printer${NUL}jam` }],
    ['subject', 'BELL', { subject: `Printer${BELL}jam` }],
    ['subject', 'ESC', { subject: `Printer${ESC}[31mjam` }],
    ['subject', 'DEL', { subject: `Printer${DEL}jam` }],
    ['description', 'NUL', { description: `It${NUL}broke` }],
    ['description', 'ESC', { description: `It${ESC}[31mbroke` }],
  ])('rejects a %s containing a %s control character', (property, _name, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([
    ['tab', '\t'],
    ['line feed', '\n'],
    ['carriage return', '\r'],
  ])('still accepts a description containing a %s', (_name, character) => {
    expect(
      failedProperties(createDto({ description: `line one${character}line two` })),
    ).toEqual([]);
  });

  it('rejects a non-uuid categoryId', () => {
    expect(failedProperties(createDto({ categoryId: 'not-a-uuid' }))).toContain(
      'categoryId',
    );
  });

  it('rejects an unknown priority', () => {
    expect(failedProperties(createDto({ priority: 'Whenever' }))).toContain(
      'priority',
    );
  });

  it('accepts every known priority', () => {
    for (const priority of Object.values(TicketPriority)) {
      expect(failedProperties(createDto({ priority }))).toEqual([]);
    }
  });
});

describe('UpdateTicketDto', () => {
  function updateDto(overrides: Record<string, unknown>): UpdateTicketDto {
    return plainToInstance(UpdateTicketDto, overrides);
  }

  it('accepts an empty payload (every field is optional)', () => {
    expect(failedProperties(updateDto({}))).toEqual([]);
  });

  it.each([
    ['subject', { subject: `Printer${NUL}jam` }],
    ['description', { description: `It${NUL}broke` }],
  ])('rejects a %s containing a control character', (property, overrides) => {
    expect(failedProperties(updateDto(overrides))).toContain(property);
  });

  it.each([
    ['subject', { subject: '   ' }],
    ['description', { description: '   ' }],
  ])('rejects a whitespace-only %s', (property, overrides) => {
    expect(failedProperties(updateDto(overrides))).toContain(property);
  });

  /*
   * Pins down where the "a category cannot be cleared" limitation actually
   * lives, since it is easy to misattribute to the wrong mechanism.
   * `@IsOptional()` treats null as absent, so the DTO itself
   * accepts `categoryId: null` and it is NOT stripped by `whitelist`
   * (the property is decorated, so it survives). The 400 comes one layer
   * later, from TicketsService.assertActiveCategory, which runs whenever
   * `categoryId !== undefined` and finds no active category with id null.
   *
   * That distinction matters: if a future change ever makes
   * assertActiveCategory tolerate null, `categoryId: null` would silently
   * start clearing the column with no DTO change and no review of it. If
   * clearing is ever wanted deliberately, do it the way AssignTicketDto
   * does — `@ValidateIf` plus an explicit null branch in the service.
   */
  it('accepts a null categoryId at the DTO layer (the service rejects it)', () => {
    const dto = updateDto({ categoryId: null });
    expect(failedProperties(dto)).toEqual([]);
    expect(dto.categoryId).toBeNull();
  });
});

describe('CreateTicketCommentDto', () => {
  function commentDto(overrides: Record<string, unknown> = {}): CreateTicketCommentDto {
    return plainToInstance(CreateTicketCommentDto, {
      body: 'Restarting the print spooler cleared it.',
      ...overrides,
    });
  }

  it('accepts a valid payload', () => {
    expect(failedProperties(commentDto())).toEqual([]);
  });

  it('rejects an oversized body', () => {
    expect(failedProperties(commentDto({ body: 'x'.repeat(5001) }))).toContain('body');
  });

  it('rejects a whitespace-only body', () => {
    expect(failedProperties(commentDto({ body: '   ' }))).toContain('body');
  });

  it('rejects a body containing a control character', () => {
    expect(failedProperties(commentDto({ body: `done${NUL}` }))).toContain('body');
  });

  it('accepts a multi-line body', () => {
    expect(failedProperties(commentDto({ body: 'first\nsecond' }))).toEqual([]);
  });

  it('accepts every known visibility', () => {
    for (const visibility of Object.values(CommentVisibility)) {
      expect(failedProperties(commentDto({ visibility }))).toEqual([]);
    }
  });
});

describe('AssignTicketDto', () => {
  it('accepts null — the unassign case', () => {
    expect(
      failedProperties(plainToInstance(AssignTicketDto, { assigneeId: null })),
    ).toEqual([]);
  });

  it('rejects a non-uuid assigneeId', () => {
    expect(
      failedProperties(plainToInstance(AssignTicketDto, { assigneeId: 'me' })),
    ).toContain('assigneeId');
  });
});

describe('ListTicketsQueryDto', () => {
  function queryDto(overrides: Record<string, unknown> = {}): ListTicketsQueryDto {
    return plainToInstance(ListTicketsQueryDto, overrides);
  }

  it('defaults limit and offset', () => {
    const dto = queryDto();
    expect(failedProperties(dto)).toEqual([]);
    expect(dto.limit).toBe(20);
    expect(dto.offset).toBe(0);
  });

  /*
   * The bounded `offset` is the fix for a Phase 6a gap: an integer-typed
   * but absurd offset (1e20) passed `@IsInt` and reached Prisma, which
   * failed with a 500 instead of a 400.
   */
  it.each([
    ['limit', { limit: 0 }],
    ['limit', { limit: 101 }],
    ['offset', { offset: -1 }],
    ['offset', { offset: 99999999999999999999 }],
  ])('rejects an out-of-range %s', (property, overrides) => {
    expect(failedProperties(queryDto(overrides))).toContain(property);
  });

  it.each([
    ['status', { status: 'Pending' }],
    ['priority', { priority: 'Urgent' }],
    ['categoryId', { categoryId: 'all' }],
    ['assigneeId', { assigneeId: 'unassigned' }],
  ])('rejects an invalid %s', (property, overrides) => {
    expect(failedProperties(queryDto(overrides))).toContain(property);
  });

  it('accepts every known status', () => {
    for (const status of Object.values(TicketStatus)) {
      expect(failedProperties(queryDto({ status }))).toEqual([]);
    }
  });
});
