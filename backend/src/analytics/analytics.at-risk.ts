import { Prisma, TicketStatus } from '@prisma/client';
import {
  isAtRisk,
  isBreached,
  isPausedFromStatus,
  remainingMinutes,
} from '../sla/sla.calculations';
import { AT_RISK_FRACTION } from '../sla/sla.constants';

/**
 * Phase 10 — the at-risk aggregate that ADR-020 and
 * `sla-metrics-response.dto.ts` deliberately deferred to this phase.
 *
 * ## Why an aggregate was deferred at all
 *
 * "At risk" is not a fixed cutoff. A clock is at risk once its REMAINING time
 * has fallen to `AT_RISK_FRACTION` of THAT clock's own snapshotted target —
 * 3 minutes for a 15-minute Critical response, 288 minutes for a 24-hour Low
 * resolution — and the comparison is additionally pause-aware. No `where`
 * clause over a single column can express a per-row fraction of a per-row
 * target, which is exactly why Phase 7 shipped no such count and why the
 * Phase 7b dashboard says so in plain words instead of inventing one.
 *
 * ## How it is computed here
 *
 * Postgres can express it perfectly well — the comparison is just arithmetic
 * between two columns of the same row — so the aggregate is a single bounded
 * SQL `count(*) FILTER (...)` over `tickets JOIN ticket_sla`, with no
 * per-ticket round trip and no unbounded `findMany`.
 *
 * ## Why this is safe against drift
 *
 * The one real hazard is the SQL and the TypeScript read model disagreeing,
 * so that a dashboard total contradicts the badge on the tickets it counts.
 * Two things prevent that:
 *
 *  1. The TypeScript predicates below are not a second implementation. They
 *     are composed from the very primitives `SlaService.toTicketSlaResponse`
 *     uses — `isPausedFromStatus`, `isBreached`, `remainingMinutes`,
 *     `isAtRisk` — so they cannot drift from the per-ticket state by
 *     construction. `analytics.at-risk.spec.ts` pins them against
 *     `deriveResponseState`/`deriveResolutionState` over a scenario table.
 *  2. The SQL fragments sit here, immediately beside those predicates — the
 *     same adjacency rule `knowledge-article-visibility.ts` applies to its
 *     raw-SQL visibility twin — and `analytics.e2e-spec.ts` pins the SQL
 *     against the live per-ticket API: it creates a ticket, drives its SLA
 *     row to an at-risk position, asserts `GET /tickets/:id` reports
 *     `AtRisk`, and asserts the analytics total moved by exactly one.
 *
 * ## The pause simplification, stated explicitly
 *
 * `remainingMinutes` freezes at the pause anchor while a ticket is OnHold, so
 * a paused clock's remaining time is a different computation. Neither
 * predicate below has to implement it, and neither does the SQL: in BOTH
 * `deriveResponseState` and `deriveResolutionState`, `Paused` is returned
 * before `AtRisk` is ever considered, so a paused clock is never at risk in
 * the first place. Excluding `OnHold` up front is therefore not an
 * approximation of the pause arithmetic — it is the pause arithmetic's own
 * conclusion, reached one step earlier. The scenario table in the spec
 * includes paused rows precisely so this stays true if the ordering in
 * `sla.calculations.ts` ever changes.
 */

/** The columns an at-risk decision reads, from the ticket and its SLA row. */
export interface AtRiskRow {
  status: TicketStatus;
  resolvedAt: Date | null;
  responseAt: Date | null;
  responseDueAt: Date;
  responseTargetMinutes: number;
  resolutionDueAt: Date;
  resolutionTargetMinutes: number;
}

/**
 * True exactly when `deriveResponseState` would return `AtRisk` for this row.
 *
 * The guards mirror that function's branch order: a completed clock, a ticket
 * that concluded without a response, and a paused clock all resolve to some
 * other state before at-risk is reached.
 */
export function isResponseAtRisk(row: AtRiskRow, now: Date): boolean {
  if (row.responseAt !== null) {
    return false;
  }
  if (row.resolvedAt !== null) {
    return false;
  }
  if (isPausedFromStatus(row.status)) {
    return false;
  }
  if (isBreached(row.responseDueAt, now)) {
    return false;
  }
  return isAtRisk(
    remainingMinutes(row.responseDueAt, now, false, null),
    row.responseTargetMinutes,
  );
}

/** True exactly when `deriveResolutionState` would return `AtRisk`. There is
 * no `responseAt` guard here: the resolution clock does not care whether
 * anyone has replied yet. */
export function isResolutionAtRisk(row: AtRiskRow, now: Date): boolean {
  if (row.resolvedAt !== null) {
    return false;
  }
  if (isPausedFromStatus(row.status)) {
    return false;
  }
  if (isBreached(row.resolutionDueAt, now)) {
    return false;
  }
  return isAtRisk(
    remainingMinutes(row.resolutionDueAt, now, false, null),
    row.resolutionTargetMinutes,
  );
}

/**
 * The outer scope both at-risk counts and both in-flight breach counts share:
 * a LIVE clock. A resolved ticket's clocks are complete, and a paused
 * ticket's are neither at risk nor derived-breaching (see the note above).
 *
 * Assumes `tickets` aliased `t`.
 */
export const liveClockSql = Prisma.sql`t.resolved_at IS NULL AND t.status <> ${TicketStatus.OnHold}::"TicketStatus"`;

/**
 * `remainingMinutes(dueAt, now, false, null)` in SQL.
 *
 * Cast to `numeric` before rounding on purpose. `round(double precision)`
 * breaks ties by the platform's rule — commonly half-to-even — whereas
 * `round(numeric)` breaks them away from zero, which for a non-negative
 * value is what `Math.round` does. Only a not-yet-breached clock ever reaches
 * this expression, so the value is never negative and `clampAtZero` has
 * nothing to do.
 *
 * Assumes `ticket_sla` aliased `s`.
 */
function remainingMinutesSql(dueAtColumn: Prisma.Sql, now: Date): Prisma.Sql {
  return Prisma.sql`round((extract(epoch from (${dueAtColumn} - ${now}::timestamptz)) / 60)::numeric)`;
}

/**
 * The SQL twin of `isResponseAtRisk`, for use inside a
 * `count(*) FILTER (WHERE ...)` whose surrounding query already applies
 * `liveClockSql` (which covers the `resolvedAt`/`OnHold` guards).
 *
 * `s.response_due_at >= now` is `!isBreached(dueAt, now)`: `isBreached` is
 * strictly `now > dueAt`, so equality is NOT a breach on either side.
 */
export function responseAtRiskSql(now: Date): Prisma.Sql {
  return Prisma.sql`
    s.response_at IS NULL
    AND s.response_due_at >= ${now}::timestamptz
    AND ${remainingMinutesSql(Prisma.sql`s.response_due_at`, now)}
        <= ${AT_RISK_FRACTION}::numeric * s.response_target_minutes
  `;
}

/** The SQL twin of `isResolutionAtRisk`, under the same assumptions. */
export function resolutionAtRiskSql(now: Date): Prisma.Sql {
  return Prisma.sql`
    s.resolution_due_at >= ${now}::timestamptz
    AND ${remainingMinutesSql(Prisma.sql`s.resolution_due_at`, now)}
        <= ${AT_RISK_FRACTION}::numeric * s.resolution_target_minutes
  `;
}

/**
 * Derived, not-yet-persisted breach of a live clock — the counterpart the
 * at-risk counts are read alongside, and the same rule
 * `SlaService.getMetrics` already applies for its in-flight figures. The
 * persisted `response_breached`/`resolution_breached` columns are NOT
 * consulted: ADR-020 makes them trustworthy only once their clock has
 * actually completed.
 */
export function responseInFlightBreachedSql(now: Date): Prisma.Sql {
  return Prisma.sql`s.response_at IS NULL AND s.response_due_at < ${now}::timestamptz`;
}

export function resolutionInFlightBreachedSql(now: Date): Prisma.Sql {
  return Prisma.sql`s.resolution_due_at < ${now}::timestamptz`;
}
