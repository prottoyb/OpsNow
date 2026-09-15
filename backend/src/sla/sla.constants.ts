/**
 * Phase 7 — SLA Management.
 *
 * A ticket is "at risk" once its remaining time on a running clock drops to
 * this fraction (or less) of that clock's original target. Expressed as a
 * fraction rather than a fixed number of minutes because targets span a wide
 * range (15 minutes for a Critical response up to 1440 minutes/24h for a Low
 * resolution) — see DECISIONS.md ADR-020.
 */
export const AT_RISK_FRACTION = 0.2;

/**
 * Derived (never persisted) state of a ticket's response clock.
 *
 * - Met: a qualifying first response was recorded before the due date.
 * - Breached: either a qualifying first response was recorded after the due
 *   date, or the clock is still running (no response yet) and is already
 *   past its due date.
 * - Running: clock active, not paused, not breached, not yet at risk.
 * - AtRisk: clock active, not paused, not breached, remaining time has
 *   dropped to AT_RISK_FRACTION of the target or below.
 * - Paused: the ticket is currently OnHold.
 * - NoResponse: the ticket was resolved without ever receiving a qualifying
 *   first response (see ADR-020's D3 decision) — a first-class outcome, not
 *   an error state.
 */
export enum SlaResponseState {
  Met = 'Met',
  Breached = 'Breached',
  Running = 'Running',
  AtRisk = 'AtRisk',
  Paused = 'Paused',
  NoResponse = 'NoResponse',
}

/**
 * Derived (never persisted) state of a ticket's resolution clock. There is
 * no resolution equivalent of "NoResponse" — a ticket is only ever resolved
 * or not.
 */
export enum SlaResolutionState {
  Met = 'Met',
  Breached = 'Breached',
  AtRisk = 'AtRisk',
  Running = 'Running',
  Paused = 'Paused',
}
