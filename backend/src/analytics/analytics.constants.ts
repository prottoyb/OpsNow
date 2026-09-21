import { Role } from '@prisma/client';

/**
 * Phase 10 — Dashboard & Analytics.
 *
 * Every figure served by this module is computed on demand from the live
 * tables: there is no materialized view, no summary table, no cache and no
 * scheduled job. That is an explicit decision rather than an omission — see
 * ADR-017 (repository and infrastructure simplicity) and ADR-020's Decision 8,
 * which already rejected a poller for SLA state on the same grounds. The cost
 * of that choice is that an analytics query is a real aggregate over the
 * ticket tables on every request, so the constants below exist to keep each
 * one bounded rather than to let it grow with the data.
 */

/**
 * Roles allowed to read the per-agent performance breakdown.
 *
 * Narrower than `STAFF_ROLES` on purpose: `GET /analytics/agents` names
 * individual members of staff and ranks them against one another, which is
 * line-management information rather than operational information. A
 * SupportAgent can see every other analytics route — including the ticket,
 * SLA and category aggregates their own work contributes to — but not a
 * league table of their colleagues.
 */
export const ANALYTICS_AGENT_ROLES: readonly Role[] = [
  Role.TeamLead,
  Role.Administrator,
];

export function isAnalyticsAgentRole(role: Role): boolean {
  return (ANALYTICS_AGENT_ROLES as Role[]).includes(role);
}

/** Window applied when the caller supplies neither `from` nor `to`. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * Longest window the API will accept. A request for a wider one is a 400
 * rather than a silently-truncated answer, because quietly narrowing a
 * caller's window would make the response a different question from the one
 * they asked.
 *
 * 366 days covers any full calendar year including a leap year, which is the
 * widest window a service-desk report realistically needs, while keeping the
 * scanned range bounded.
 */
export const MAX_WINDOW_DAYS = 366;

export const MINUTES_PER_DAY = 24 * 60;

/**
 * Cardinality cap for the two grouped endpoints (`/analytics/categories` and
 * `/analytics/agents`). Both group by a column whose distinct-value count is
 * bounded in practice by how many categories or staff accounts exist, but
 * neither is bounded by the schema, so the cap is applied in SQL — the rows
 * are ordered by volume first, so the cap drops the least significant groups
 * and the response says whether it did (`truncated`).
 */
export const MAX_GROUPS = 100;

/** Decimal places used for a rate in `0..1`. */
export const RATE_PRECISION = 4;

/** Decimal places used for a duration reported in minutes. */
export const MINUTES_PRECISION = 1;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * `met / (met + breached)` as a fraction in `0..1`, or `null` when nothing
 * completed in the window.
 *
 * `null` rather than `0` is load-bearing: a team with no completed clocks has
 * no compliance rate, and reporting that as 0% would read as total failure. A
 * client must render the two cases differently.
 */
export function complianceRate(met: number, breached: number): number | null {
  const total = met + breached;
  return total === 0 ? null : roundTo(met / total, RATE_PRECISION);
}

/** Rounds a minute figure for transport, preserving `null` ("not available"). */
export function roundMinutes(value: number | null): number | null {
  return value === null ? null : roundTo(value, MINUTES_PRECISION);
}
