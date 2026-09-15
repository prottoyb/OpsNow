import { TicketStatus } from '@prisma/client';
import { AT_RISK_FRACTION, SlaResolutionState, SlaResponseState } from './sla.constants';
import {
  addMinutes,
  applyMinutesDelta,
  clampAtZero,
  computeDueDates,
  deriveResolutionState,
  deriveResponseState,
  isAtRisk,
  isBreached,
  isPausedFromStatus,
  remainingMinutes,
} from './sla.calculations';

const BASE = new Date('2026-01-01T00:00:00.000Z');

describe('sla.calculations', () => {
  describe('addMinutes / applyMinutesDelta', () => {
    it('adds minutes to a date', () => {
      expect(addMinutes(BASE, 15).toISOString()).toBe('2026-01-01T00:15:00.000Z');
    });

    it('applyMinutesDelta accepts a negative delta (a shrinking target)', () => {
      expect(applyMinutesDelta(BASE, -30).toISOString()).toBe(
        '2025-12-31T23:30:00.000Z',
      );
    });
  });

  describe('clampAtZero', () => {
    it('clamps negative values to zero', () => {
      expect(clampAtZero(-5)).toBe(0);
    });

    it('leaves non-negative values untouched', () => {
      expect(clampAtZero(0)).toBe(0);
      expect(clampAtZero(42)).toBe(42);
    });
  });

  describe('computeDueDates', () => {
    it('computes both due dates from a single created-at anchor', () => {
      const { responseDueAt, resolutionDueAt } = computeDueDates(BASE, 15, 120);
      expect(responseDueAt.toISOString()).toBe('2026-01-01T00:15:00.000Z');
      expect(resolutionDueAt.toISOString()).toBe('2026-01-01T02:00:00.000Z');
    });
  });

  describe('isPausedFromStatus', () => {
    it('is true only for OnHold', () => {
      expect(isPausedFromStatus(TicketStatus.OnHold)).toBe(true);
    });

    it.each([
      TicketStatus.New,
      TicketStatus.Open,
      TicketStatus.InProgress,
      TicketStatus.Resolved,
      TicketStatus.Closed,
    ])('is false for %s, including Resolved (a ticket pending reopen must never present as on hold)', (status) => {
      expect(isPausedFromStatus(status)).toBe(false);
    });
  });

  describe('isBreached (strict boundary)', () => {
    it('is false exactly at the due date', () => {
      expect(isBreached(BASE, BASE)).toBe(false);
    });

    it('is false one millisecond before the due date', () => {
      expect(isBreached(BASE, new Date(BASE.getTime() - 1))).toBe(false);
    });

    it('is true one millisecond after the due date', () => {
      expect(isBreached(BASE, new Date(BASE.getTime() + 1))).toBe(true);
    });
  });

  describe('isAtRisk boundary — both extremes', () => {
    it('15-minute Critical response target: at-risk at exactly 3 minutes remaining (20%)', () => {
      const target = 15;
      expect(isAtRisk(3, target)).toBe(true);
      expect(isAtRisk(4, target)).toBe(false);
    });

    it('1440-minute Low resolution target: at-risk at exactly 288 minutes remaining (20%)', () => {
      const target = 1440;
      expect(isAtRisk(288, target)).toBe(true);
      expect(isAtRisk(289, target)).toBe(false);
    });

    it('AT_RISK_FRACTION is 0.2', () => {
      expect(AT_RISK_FRACTION).toBe(0.2);
    });
  });

  describe('remainingMinutes', () => {
    it('is dueAt - now when not paused', () => {
      const now = new Date(BASE.getTime() - 10 * 60_000);
      expect(remainingMinutes(BASE, now, false, null)).toBe(10);
    });

    it('clamps to 0 once past due', () => {
      const now = new Date(BASE.getTime() + 10 * 60_000);
      expect(remainingMinutes(BASE, now, false, null)).toBe(0);
    });

    it('while paused, remains frozen at dueAt - pauseAnchor regardless of how much later "now" is', () => {
      const dueAt = addMinutes(BASE, 60);
      const pauseAnchor = addMinutes(BASE, 50); // 10 minutes were left when paused
      const now = addMinutes(BASE, 500); // a long time later — must not matter
      expect(remainingMinutes(dueAt, now, true, pauseAnchor)).toBe(10);
    });

    it('after a resume shifts the due date forward, a second pause independently freezes at its own (later) anchor', () => {
      const dueAt = addMinutes(BASE, 100);
      // First pause: anchor at +40, 60 minutes remaining.
      expect(remainingMinutes(dueAt, addMinutes(BASE, 40), true, addMinutes(BASE, 40))).toBe(60);

      // Resume credits e.g. 20 minutes, shifting the due date forward.
      // `totalPausedMinutes` is display-only — this test does not read it —
      // only the shifted due date feeds later calculations.
      const shiftedDueAt = addMinutes(dueAt, 20); // now +120

      // Second pause starts at +110: 10 minutes remained when it paused.
      const secondPauseAnchor = addMinutes(BASE, 110);
      expect(
        remainingMinutes(shiftedDueAt, addMinutes(BASE, 900), true, secondPauseAnchor),
      ).toBe(10);
    });
  });

  describe('deriveResponseState', () => {
    const base = {
      responseDueAt: BASE,
      resolvedAt: null,
      isPaused: false,
      now: BASE,
      remainingMinutes: 10,
      targetMinutes: 15,
    };

    it('Met: responseAt set, not breached', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: new Date(),
          responseBreachedPersisted: false,
        }),
      ).toBe(SlaResponseState.Met);
    });

    it('Breached (completed clock): responseAt set, persisted breach true', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: new Date(),
          responseBreachedPersisted: true,
        }),
      ).toBe(SlaResponseState.Breached);
    });

    it('NoResponse: responseAt null, resolvedAt non-null', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: null,
          responseBreachedPersisted: false,
          resolvedAt: new Date(),
        }),
      ).toBe(SlaResponseState.NoResponse);
    });

    it('Paused: responseAt null, resolvedAt null, isPaused true — even if remaining would otherwise be breached', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: null,
          responseBreachedPersisted: false,
          isPaused: true,
          remainingMinutes: 0,
          now: addMinutes(BASE, 999),
        }),
      ).toBe(SlaResponseState.Paused);
    });

    it('Breached (derived, incomplete clock): responseAt null, now past due', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: null,
          responseBreachedPersisted: false,
          now: addMinutes(BASE, 1),
        }),
      ).toBe(SlaResponseState.Breached);
    });

    it('AtRisk: running, remaining <= 20% of target', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: null,
          responseBreachedPersisted: false,
          remainingMinutes: 3,
          targetMinutes: 15,
        }),
      ).toBe(SlaResponseState.AtRisk);
    });

    it('Running: none of the above', () => {
      expect(
        deriveResponseState({
          ...base,
          responseAt: null,
          responseBreachedPersisted: false,
          remainingMinutes: 10,
          targetMinutes: 15,
        }),
      ).toBe(SlaResponseState.Running);
    });
  });

  describe('deriveResolutionState', () => {
    const base = {
      resolutionDueAt: BASE,
      isPaused: false,
      now: BASE,
      remainingMinutes: 100,
      targetMinutes: 480,
    };

    it('Met: resolvedAt set, not breached', () => {
      expect(
        deriveResolutionState({ ...base, resolvedAt: new Date(), resolutionBreachedPersisted: false }),
      ).toBe(SlaResolutionState.Met);
    });

    it('Breached (completed clock): resolvedAt set, persisted breach true', () => {
      expect(
        deriveResolutionState({ ...base, resolvedAt: new Date(), resolutionBreachedPersisted: true }),
      ).toBe(SlaResolutionState.Breached);
    });

    it('Paused: unresolved, isPaused true', () => {
      expect(
        deriveResolutionState({
          ...base,
          resolvedAt: null,
          resolutionBreachedPersisted: false,
          isPaused: true,
        }),
      ).toBe(SlaResolutionState.Paused);
    });

    it('Breached (derived, incomplete clock): unresolved, now past due', () => {
      expect(
        deriveResolutionState({
          ...base,
          resolvedAt: null,
          resolutionBreachedPersisted: false,
          now: addMinutes(BASE, 1),
        }),
      ).toBe(SlaResolutionState.Breached);
    });

    it('AtRisk: running, remaining <= 20% of target', () => {
      expect(
        deriveResolutionState({
          ...base,
          resolvedAt: null,
          resolutionBreachedPersisted: false,
          remainingMinutes: 96,
          targetMinutes: 480,
        }),
      ).toBe(SlaResolutionState.AtRisk);
    });

    it('Running: none of the above', () => {
      expect(
        deriveResolutionState({
          ...base,
          resolvedAt: null,
          resolutionBreachedPersisted: false,
          remainingMinutes: 100,
          targetMinutes: 480,
        }),
      ).toBe(SlaResolutionState.Running);
    });

    it('a Resolved ticket carrying a D4 reopen-pending anchor never presents as Paused (isPausedFromStatus, not onHoldStartedAt, gates isPaused)', () => {
      // Simulates the caller computing isPaused from ticket.status rather
      // than from onHoldStartedAt: a Resolved ticket always passes
      // isPaused: false into this function even though its onHoldStartedAt
      // column is non-null under the D4 design.
      expect(isPausedFromStatus(TicketStatus.Resolved)).toBe(false);
      expect(
        deriveResolutionState({
          ...base,
          resolvedAt: new Date(),
          resolutionBreachedPersisted: false,
          isPaused: false,
        }),
      ).toBe(SlaResolutionState.Met);
    });
  });

  describe('commutativity of a priority delta and a pause credit (both orders reach the same due date)', () => {
    it('delta-then-credit equals credit-then-delta', () => {
      const dueAt = addMinutes(BASE, 240);
      const priorityDeltaMinutes = 120; // e.g. Medium -> High resolution target grows
      const pauseCreditMinutes = 45;

      const deltaThenCredit = applyMinutesDelta(
        applyMinutesDelta(dueAt, priorityDeltaMinutes),
        pauseCreditMinutes,
      );
      const creditThenDelta = applyMinutesDelta(
        applyMinutesDelta(dueAt, pauseCreditMinutes),
        priorityDeltaMinutes,
      );

      expect(deltaThenCredit.toISOString()).toBe(creditThenDelta.toISOString());
    });

    it('holds with a negative (shrinking) priority delta too', () => {
      const dueAt = addMinutes(BASE, 240);
      const priorityDeltaMinutes = -90;
      const pauseCreditMinutes = 45;

      const deltaThenCredit = applyMinutesDelta(
        applyMinutesDelta(dueAt, priorityDeltaMinutes),
        pauseCreditMinutes,
      );
      const creditThenDelta = applyMinutesDelta(
        applyMinutesDelta(dueAt, pauseCreditMinutes),
        priorityDeltaMinutes,
      );

      expect(deltaThenCredit.toISOString()).toBe(creditThenDelta.toISOString());
    });
  });
});
