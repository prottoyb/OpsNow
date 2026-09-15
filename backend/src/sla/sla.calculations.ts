import { TicketStatus } from '@prisma/client';
import { AT_RISK_FRACTION, SlaResolutionState, SlaResponseState } from './sla.constants';

/**
 * Pure SLA math and state derivation — no database access, no wall-clock
 * reads (every `Date` is a parameter). See DECISIONS.md ADR-020.
 *
 * Every date arithmetic operation here is a pure additive/commutative delta
 * (add minutes, subtract two dates) — never an absolute reconstruction —
 * matching the concurrency invariants the raw SQL in `sla.service.ts` also
 * follows.
 */

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

/** Mirrors the SQL `due_at + delta * interval '1 minute'` used by the
 * priority-change statement — a pure, commutative shift of a due date by a
 * (possibly negative) number of minutes. */
export function applyMinutesDelta(date: Date, deltaMinutes: number): Date {
  return addMinutes(date, deltaMinutes);
}

export function clampAtZero(value: number): number {
  return value < 0 ? 0 : value;
}

export function computeDueDates(
  createdAt: Date,
  responseTargetMinutes: number,
  resolutionTargetMinutes: number,
): { responseDueAt: Date; resolutionDueAt: Date } {
  return {
    responseDueAt: addMinutes(createdAt, responseTargetMinutes),
    resolutionDueAt: addMinutes(createdAt, resolutionTargetMinutes),
  };
}

/**
 * `isPaused` MUST derive from ticket status, never from `onHoldStartedAt`
 * being non-null: after the D4 pause-credit mechanism (ADR-020), a Resolved
 * ticket pending reopen also carries a non-null `onHoldStartedAt`, and must
 * NOT present as "on hold".
 */
export function isPausedFromStatus(status: TicketStatus): boolean {
  return status === TicketStatus.OnHold;
}

/**
 * Breach boundary is strictly `now > dueAt` (not `>=`).
 */
export function isBreached(dueAt: Date, now: Date): boolean {
  return now.getTime() > dueAt.getTime();
}

export function isAtRisk(remainingMinutesValue: number, targetMinutes: number): boolean {
  return remainingMinutesValue <= AT_RISK_FRACTION * targetMinutes;
}

/**
 * Minutes remaining on a clock, defined once and reused for both the
 * response and resolution clocks.
 *
 * While paused, the due dates have NOT yet been shifted (that only happens
 * when the clock resumes), so a naive `dueAt - now` would keep decaying
 * during the pause and falsely report the clock as breaching. Freezing the
 * reference point at `pauseAnchor` (the moment the pause started) instead
 * keeps the remaining time constant for the duration of the pause.
 */
export function remainingMinutes(
  dueAt: Date,
  now: Date,
  isPaused: boolean,
  pauseAnchor: Date | null,
): number {
  const reference = isPaused && pauseAnchor ? pauseAnchor : now;
  const diffMinutes = (dueAt.getTime() - reference.getTime()) / 60_000;
  return clampAtZero(Math.round(diffMinutes));
}

export interface ResponseStateInput {
  /** Set once, on the first qualifying staff reply; never overwritten. */
  responseAt: Date | null;
  /** Trustworthy only because it is only ever persisted once `responseAt`
   * is set (a completed clock) — see ADR-020's D3 decision. */
  responseBreachedPersisted: boolean;
  responseDueAt: Date;
  /** Non-null once the ticket has resolved at least once. */
  resolvedAt: Date | null;
  isPaused: boolean;
  now: Date;
  remainingMinutes: number;
  targetMinutes: number;
}

export function deriveResponseState(input: ResponseStateInput): SlaResponseState {
  const {
    responseAt,
    responseBreachedPersisted,
    responseDueAt,
    resolvedAt,
    isPaused,
    now,
    remainingMinutes: remaining,
    targetMinutes,
  } = input;

  // Completed clock: the persisted flag is authoritative.
  if (responseAt !== null) {
    return responseBreachedPersisted ? SlaResponseState.Breached : SlaResponseState.Met;
  }

  // Ticket concluded (resolved at least once) without ever receiving a
  // qualifying response — a first-class outcome, never fabricated.
  if (resolvedAt !== null) {
    return SlaResponseState.NoResponse;
  }

  if (isPaused) {
    return SlaResponseState.Paused;
  }

  // Still running, no response yet: breach is derived on read, never
  // persisted for an incomplete clock.
  if (isBreached(responseDueAt, now)) {
    return SlaResponseState.Breached;
  }

  if (isAtRisk(remaining, targetMinutes)) {
    return SlaResponseState.AtRisk;
  }

  return SlaResponseState.Running;
}

export interface ResolutionStateInput {
  resolvedAt: Date | null;
  /** Trustworthy only because it is only ever persisted once the ticket
   * has resolved (a completed clock) — see ADR-020. */
  resolutionBreachedPersisted: boolean;
  resolutionDueAt: Date;
  isPaused: boolean;
  now: Date;
  remainingMinutes: number;
  targetMinutes: number;
}

export function deriveResolutionState(input: ResolutionStateInput): SlaResolutionState {
  const {
    resolvedAt,
    resolutionBreachedPersisted,
    resolutionDueAt,
    isPaused,
    now,
    remainingMinutes: remaining,
    targetMinutes,
  } = input;

  if (resolvedAt !== null) {
    return resolutionBreachedPersisted
      ? SlaResolutionState.Breached
      : SlaResolutionState.Met;
  }

  if (isPaused) {
    return SlaResolutionState.Paused;
  }

  if (isBreached(resolutionDueAt, now)) {
    return SlaResolutionState.Breached;
  }

  if (isAtRisk(remaining, targetMinutes)) {
    return SlaResolutionState.AtRisk;
  }

  return SlaResolutionState.Running;
}
