import { ForbiddenException } from '@nestjs/common';
import { Role, TicketPriority, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SlaResolutionState, SlaResponseState } from './sla.constants';
import { SlaService } from './sla.service';

function authUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    role: Role.Employee,
    ...overrides,
  };
}

const staffUser = authUser({ id: 'agent-1', email: 'agent@opsnow.local', role: Role.SupportAgent });

function buildSla(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sla-1',
    ticketId: 'ticket-1',
    slaPolicyId: 'policy-1',
    responseTargetMinutes: 30,
    resolutionTargetMinutes: 240,
    responseDueAt: new Date('2026-01-01T00:30:00.000Z'),
    responseAt: null,
    responseBreached: false,
    resolutionDueAt: new Date('2026-01-01T04:00:00.000Z'),
    resolutionBreached: false,
    onHoldStartedAt: null,
    totalPausedMinutes: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SlaService', () => {
  let service: SlaService;
  let prisma: {
    slaPolicy: { findFirst: jest.Mock; findMany: jest.Mock };
    ticket: { count: jest.Mock };
  };
  let tx: {
    slaPolicy: { findFirst: jest.Mock };
    ticketSla: { create: jest.Mock };
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      slaPolicy: { findFirst: jest.fn(), findMany: jest.fn() },
      ticket: { count: jest.fn() },
    };
    tx = {
      slaPolicy: { findFirst: jest.fn() },
      ticketSla: { create: jest.fn() },
      $executeRaw: jest.fn(),
    };
    service = new SlaService(prisma as unknown as PrismaService);
  });

  describe('attachOnCreate', () => {
    it('selects the active policy by priority only and snapshots its targets', async () => {
      const policy = {
        id: 'policy-1',
        priority: TicketPriority.High,
        responseTimeMinutes: 30,
        resolutionTimeMinutes: 240,
        isActive: true,
      };
      tx.slaPolicy.findFirst.mockResolvedValue(policy);
      tx.ticketSla.create.mockResolvedValue({});

      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      await service.attachOnCreate(tx as never, 'ticket-1', TicketPriority.High, createdAt);

      expect(tx.slaPolicy.findFirst).toHaveBeenCalledWith({
        where: { priority: TicketPriority.High, isActive: true },
      });
      expect(tx.ticketSla.create).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-1',
          slaPolicyId: 'policy-1',
          responseTargetMinutes: 30,
          resolutionTargetMinutes: 240,
          responseDueAt: new Date('2026-01-01T00:30:00.000Z'),
          resolutionDueAt: new Date('2026-01-01T04:00:00.000Z'),
        },
      });
    });

    it('creates no row and only warns when no active policy exists for the priority', async () => {
      tx.slaPolicy.findFirst.mockResolvedValue(null);
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await expect(
        service.attachOnCreate(tx as never, 'ticket-1', TicketPriority.Low, new Date()),
      ).resolves.toBeUndefined();

      expect(tx.ticketSla.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('recordFirstResponse', () => {
    it('issues the guarded, exactly-once raw UPDATE', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      const respondedAt = new Date('2026-01-01T00:10:00.000Z');

      await service.recordFirstResponse(tx as never, 'ticket-1', respondedAt);

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = tx.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      const sql = strings.join('?');
      expect(sql).toContain('response_at = ');
      expect(sql).toContain('response_at IS NULL');
      expect(values).toContain('ticket-1');
      expect(values).toContain(respondedAt);
    });

    it('decides breach from the pause anchor (not the unshifted due date) while paused — H1 fix', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      const respondedAt = new Date('2026-01-01T00:10:00.000Z');

      await service.recordFirstResponse(tx as never, 'ticket-1', respondedAt);

      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      // The CASE must branch on the row's own on_hold_started_at, never
      // unconditionally comparing respondedAt to response_due_at — that
      // was the H1 bug (a paused ticket's due date is not yet shifted).
      expect(sql).toContain('WHEN on_hold_started_at IS NOT NULL THEN on_hold_started_at > response_due_at');
      expect(sql).toContain('ELSE ');
    });
  });

  describe('pauseForHold / resumeFromPause', () => {
    it('pauseForHold sets the anchor via a guarded raw UPDATE', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      await service.pauseForHold(tx as never, 'ticket-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      expect(sql).toContain('on_hold_started_at = now()');
      expect(sql).toContain('on_hold_started_at IS NULL');
    });

    it('resumeFromPause is guarded on on_hold_started_at IS NOT NULL (the shared resume/pause-credit statement)', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      await service.resumeFromPause(tx as never, 'ticket-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      expect(sql).toContain('on_hold_started_at IS NOT NULL');
      expect(sql).toContain('total_paused_minutes');
      expect(sql).toContain('response_due_at');
      expect(sql).toContain('resolution_due_at');
    });

    it('resumeFromPause also clears a stale resolution_breached flag — M1 fix', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      await service.resumeFromPause(tx as never, 'ticket-1');

      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      expect(sql).toContain('resolution_breached = false');
    });
  });

  describe('handlePriorityChange', () => {
    it('applies the commutative delta when an active policy exists for the new priority', async () => {
      tx.slaPolicy.findFirst.mockResolvedValue({
        id: 'policy-critical',
        responseTimeMinutes: 15,
        resolutionTimeMinutes: 120,
      });
      tx.$executeRaw.mockResolvedValue(1);

      await service.handlePriorityChange(tx as never, 'ticket-1', TicketPriority.Critical, null);

      expect(tx.slaPolicy.findFirst).toHaveBeenCalledWith({
        where: { priority: TicketPriority.Critical, isActive: true },
      });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('leaves the snapshot untouched, warns, and does not throw when no active policy exists for the new priority', async () => {
      tx.slaPolicy.findFirst.mockResolvedValue(null);
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await expect(
        service.handlePriorityChange(tx as never, 'ticket-1', TicketPriority.Low, null),
      ).resolves.toBeUndefined();

      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('skips the SLA delta entirely, without even looking up a policy, once the ticket has already resolved — M7 fix', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await expect(
        service.handlePriorityChange(
          tx as never,
          'ticket-1',
          TicketPriority.Critical,
          new Date('2026-01-01T00:15:00.000Z'),
        ),
      ).resolves.toBeUndefined();

      expect(tx.slaPolicy.findFirst).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('recordResolutionOutcome', () => {
    it('is guarded on s.on_hold_started_at IS NULL and reads resolved_at from the tickets join', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      await service.recordResolutionOutcome(tx as never, 'ticket-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      expect(sql).toContain('s.on_hold_started_at IS NULL');
      expect(sql).toContain('t.resolved_at');
      expect(sql).toContain('FROM tickets t');
    });

    it('anchors on_hold_started_at with the DB clock (now()), never the app-clock t.resolved_at — M2 fix', async () => {
      tx.$executeRaw.mockResolvedValue(1);
      await service.recordResolutionOutcome(tx as never, 'ticket-1');

      const [strings] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join('?');
      expect(sql).toMatch(/on_hold_started_at\s*=\s*now\(\)/);
      expect(sql).not.toMatch(/on_hold_started_at\s*=\s*t\.resolved_at/);
      // The breach decision itself still uses the real, app-recorded
      // resolution instant — only the pause-credit ANCHOR moves to now().
      expect(sql).toContain('resolution_breached = (t.resolved_at > s.resolution_due_at)');
    });
  });

  describe('toTicketSlaResponse (read model)', () => {
    const now = new Date('2026-01-01T00:20:00.000Z');

    it('returns null when there is no SLA row', () => {
      expect(
        service.toTicketSlaResponse(null, { status: TicketStatus.New, resolvedAt: null }, now),
      ).toBeNull();
    });

    it('maps a running, unpaused ticket', () => {
      const result = service.toTicketSlaResponse(
        buildSla(),
        { status: TicketStatus.Open, resolvedAt: null },
        now,
      );
      expect(result).not.toBeNull();
      expect(result!.isPaused).toBe(false);
      expect(result!.responseState).toBe(SlaResponseState.Running);
      expect(result!.resolutionState).toBe(SlaResolutionState.Running);
      expect(result!.responseMinutesRemaining).toBe(10);
    });

    it('derives isPaused from ticket.status, not from onHoldStartedAt — a Resolved ticket carrying a D4 anchor is NOT paused', () => {
      const result = service.toTicketSlaResponse(
        buildSla({
          responseAt: new Date('2026-01-01T00:05:00.000Z'),
          onHoldStartedAt: new Date('2026-01-01T00:15:00.000Z'), // D4 anchor
        }),
        { status: TicketStatus.Resolved, resolvedAt: new Date('2026-01-01T00:15:00.000Z') },
        now,
      );
      expect(result!.isPaused).toBe(false);
      expect(result!.resolutionState).toBe(SlaResolutionState.Met);
    });

    it('maps NoResponse when resolved without ever having responded', () => {
      const result = service.toTicketSlaResponse(
        buildSla(),
        { status: TicketStatus.Resolved, resolvedAt: new Date('2026-01-01T00:15:00.000Z') },
        now,
      );
      expect(result!.responseState).toBe(SlaResponseState.NoResponse);
    });
  });

  describe('findPolicies (staff-only, service-layer defense-in-depth)', () => {
    it('rejects a non-staff caller', async () => {
      await expect(service.findPolicies(authUser())).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.slaPolicy.findMany).not.toHaveBeenCalled();
    });

    it('returns the policy list for staff', async () => {
      prisma.slaPolicy.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Critical SLA',
          priority: TicketPriority.Critical,
          responseTimeMinutes: 15,
          resolutionTimeMinutes: 120,
          isActive: true,
        },
      ]);

      const result = await service.findPolicies(staffUser);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Critical SLA');
    });
  });

  describe('getMetrics (staff-only, service-layer defense-in-depth)', () => {
    it('rejects a non-staff caller', async () => {
      await expect(service.getMetrics(authUser())).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.count).not.toHaveBeenCalled();
    });

    it('issues exactly one typed count() per metric and returns the shape', async () => {
      prisma.ticket.count.mockResolvedValue(0);

      const result = await service.getMetrics(staffUser);

      expect(prisma.ticket.count).toHaveBeenCalledTimes(7);
      expect(result).toEqual({
        openWithSla: 0,
        resolutionBreachedInFlight: 0,
        resolutionBreachedCompleted: 0,
        respondedOnTime: 0,
        respondedLate: 0,
        responseOverdueOutstanding: 0,
        neverResponded: 0,
      });
    });

    it('builds every metric where from ticketVisibilityWhere (deletedAt: null, no requesterId for staff) so scoping travels if this route is ever loosened', async () => {
      prisma.ticket.count.mockResolvedValue(0);

      await service.getMetrics(staffUser);

      for (const call of prisma.ticket.count.mock.calls) {
        const where = call[0].where as { AND: Record<string, unknown>[] };
        expect(where.AND[0]).toEqual({ deletedAt: null });
      }
    });
  });
});
