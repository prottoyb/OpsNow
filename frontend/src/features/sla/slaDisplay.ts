import type { BadgeTone } from '../../components/ui/Badge';
import { formatDurationMinutes } from '../../lib/format';
import type {
  SlaResolutionState,
  SlaResponseState,
  TicketSla,
} from '../../types/api';

/**
 * Pure presentation logic for a ticket's two SLA clocks.
 *
 * The one rule this whole module exists to enforce: the backend's
 * `responseState`/`resolutionState` strings are the ONLY source of
 * met/breached/at-risk meaning. Nothing here compares a due date to the
 * browser's clock to decide what a clock's state is — a skewed client clock
 * would otherwise contradict the badge the backend asked for, and a ticket
 * would read "breached" (or, worse, "on track") on the strength of the
 * viewer's system time. See DECISIONS.md ADR-021.
 *
 * Local arithmetic is used for exactly one thing: ageing the backend's own
 * `minutesRemaining` figure between refetches, which can only ever shrink a
 * countdown down to "Due now" (`formatRemaining` below), never turn a
 * running clock into a breached one.
 */

export type SlaClockKind = 'response' | 'resolution';

/**
 * How the remaining-time figure behaves:
 *
 * - `ticking` — a live clock; the figure is aged locally between refetches.
 * - `frozen` — a paused clock; the figure is shown exactly as received and
 *   never aged (while paused the due dates have NOT been shifted yet, so
 *   `minutesRemaining` is the only correct value there is).
 * - `static` — no figure at all: either the clock is finished
 *   (met/breached/no-response), where `minutesRemaining` keeps decaying
 *   against wall-clock time and is meaningless, or the clock is already
 *   breached in flight, where a countdown would be nonsense.
 */
export type SlaClockMode = 'ticking' | 'frozen' | 'static';

export interface SlaClockView {
  kind: SlaClockKind;
  /** The raw backend state this view was built from. */
  state: SlaResponseState | SlaResolutionState;
  /** Badge text. Always names WHICH clock — "Response breached" and
   * "Resolution breached" are operationally different for triage. */
  label: string;
  tone: BadgeTone;
  mode: SlaClockMode;
  /** The backend's own clamped figure; only meaningful when mode is not
   * `static`. */
  minutesRemaining: number;
  /** ISO-8601 due date for this clock. */
  dueAt: string;
  /** Label for the due date, e.g. "Due" / "Was due" / "Overdue since". */
  dueLabel: string;
  /** ISO-8601 instant the clock completed, when it has one. */
  completedAt: string | null;
  completedLabel: string | null;
  /** Plain-language explanation; empty when nothing needs explaining. */
  note: string;
  /** Used to pick the single badge shown on a ticket-list row. */
  severity: number;
}

/**
 * Breached > AtRisk > Paused > NoResponse > Running > Met. The resolution
 * states are a subset of the response states, so one table serves both.
 */
const SEVERITY: Record<SlaResponseState, number> = {
  Breached: 5,
  AtRisk: 4,
  Paused: 3,
  NoResponse: 2,
  Running: 1,
  Met: 0,
};

const PAUSED_NOTE =
  'The clock is on hold. The remaining time is frozen at the moment the ticket went On hold, and the due date moves by the length of the hold when it resumes.';

const PAUSED_PAST_DUE_NOTE =
  'The target had already passed when this ticket went On hold, so there is no time left to resume with.';

const AT_RISK_NOTE = 'Less than a fifth of the target time is left.';

function pausedView(
  kind: SlaClockKind,
  state: SlaResponseState | SlaResolutionState,
  noun: string,
  minutesRemaining: number,
  dueAt: string,
): SlaClockView {
  /*
   * `{ state: 'Paused', minutesRemaining: 0 }` is a real, reachable state: a
   * ticket that was already past its due date when it was put on hold. It
   * needs its own copy — showing "0m left before pause" would read as though
   * the clock were merely about to expire, when in fact resuming it buys
   * nothing at all.
   */
  const pastDue = minutesRemaining <= 0;
  return {
    kind,
    state,
    label: pastDue ? `${noun} paused — already past due` : `${noun} paused`,
    tone: pastDue ? 'warning' : 'neutral',
    mode: pastDue ? 'static' : 'frozen',
    minutesRemaining,
    dueAt,
    dueLabel: pastDue ? 'Was due' : 'Due before pause',
    completedAt: null,
    completedLabel: null,
    note: pastDue ? PAUSED_PAST_DUE_NOTE : PAUSED_NOTE,
    severity: SEVERITY.Paused,
  };
}

export function describeResponseClock(sla: TicketSla): SlaClockView {
  const base = {
    kind: 'response' as const,
    state: sla.responseState,
    minutesRemaining: sla.responseMinutesRemaining,
    dueAt: sla.responseDueAt,
    severity: SEVERITY[sla.responseState],
  };

  switch (sla.responseState) {
    case 'Met':
      return {
        ...base,
        label: 'Response met',
        tone: 'success',
        mode: 'static',
        dueLabel: 'Was due',
        completedAt: sla.responseAt,
        completedLabel: 'First response',
        note: 'A first response was recorded before the response target.',
      };

    case 'Breached':
      /*
       * Two different situations share one backend state: a response that
       * arrived late (a finished clock, `responseAt` set) and a response that
       * has still not arrived at all (a live clock already past its due
       * date). Both are breaches; only the second has no completion instant.
       */
      return sla.responseAt !== null
        ? {
            ...base,
            label: 'Response breached',
            tone: 'danger',
            mode: 'static',
            dueLabel: 'Was due',
            completedAt: sla.responseAt,
            completedLabel: 'First response',
            note: 'The first response was recorded after the response target.',
          }
        : {
            ...base,
            label: 'Response breached',
            tone: 'danger',
            mode: 'static',
            dueLabel: 'Overdue since',
            completedAt: null,
            completedLabel: null,
            note: 'No qualifying first response has been recorded yet.',
          };

    case 'NoResponse':
      return {
        ...base,
        label: 'No response recorded',
        tone: 'warning',
        mode: 'static',
        dueLabel: 'Was due',
        completedAt: null,
        completedLabel: null,
        note: 'This ticket was resolved without a qualifying first response.',
      };

    case 'Paused':
      return pausedView(
        'response',
        sla.responseState,
        'Response',
        sla.responseMinutesRemaining,
        sla.responseDueAt,
      );

    case 'AtRisk':
      return {
        ...base,
        label: 'Response at risk',
        tone: 'warning',
        mode: 'ticking',
        dueLabel: 'Due',
        completedAt: null,
        completedLabel: null,
        note: AT_RISK_NOTE,
      };

    case 'Running':
      return {
        ...base,
        label: 'Response on track',
        tone: 'success',
        mode: 'ticking',
        dueLabel: 'Due',
        completedAt: null,
        completedLabel: null,
        note: '',
      };
  }
}

/**
 * `resolvedAt` comes from the ticket, not the SLA payload: it is what
 * separates "resolved late" from "still open and already over target", which
 * the backend reports as the same `Breached` state.
 */
export function describeResolutionClock(
  sla: TicketSla,
  resolvedAt: string | null,
): SlaClockView {
  const base = {
    kind: 'resolution' as const,
    state: sla.resolutionState,
    minutesRemaining: sla.resolutionMinutesRemaining,
    dueAt: sla.resolutionDueAt,
    severity: SEVERITY[sla.resolutionState],
  };

  switch (sla.resolutionState) {
    case 'Met':
      return {
        ...base,
        label: 'Resolution met',
        tone: 'success',
        mode: 'static',
        dueLabel: 'Was due',
        completedAt: resolvedAt,
        completedLabel: 'Resolved',
        note: 'This ticket was resolved before its resolution target.',
      };

    case 'Breached':
      return resolvedAt !== null
        ? {
            ...base,
            label: 'Resolution breached',
            tone: 'danger',
            mode: 'static',
            dueLabel: 'Was due',
            completedAt: resolvedAt,
            completedLabel: 'Resolved',
            note: 'This ticket was resolved after its resolution target.',
          }
        : {
            ...base,
            label: 'Resolution breached',
            tone: 'danger',
            mode: 'static',
            dueLabel: 'Overdue since',
            completedAt: null,
            completedLabel: null,
            note: 'This ticket is still open past its resolution target.',
          };

    case 'Paused':
      return pausedView(
        'resolution',
        sla.resolutionState,
        'Resolution',
        sla.resolutionMinutesRemaining,
        sla.resolutionDueAt,
      );

    case 'AtRisk':
      return {
        ...base,
        label: 'Resolution at risk',
        tone: 'warning',
        mode: 'ticking',
        dueLabel: 'Due',
        completedAt: null,
        completedLabel: null,
        note: AT_RISK_NOTE,
      };

    case 'Running':
      return {
        ...base,
        label: 'Resolution on track',
        tone: 'success',
        mode: 'ticking',
        dueLabel: 'Due',
        completedAt: null,
        completedLabel: null,
        note: '',
      };
  }
}

/**
 * The single clock a ticket-list row shows: whichever of the two is more
 * severe. A tie goes to the response clock — it is the earlier, more
 * actionable signal during triage.
 */
export function summariseSla(
  sla: TicketSla,
  resolvedAt: string | null,
): SlaClockView {
  const response = describeResponseClock(sla);
  const resolution = describeResolutionClock(sla, resolvedAt);
  return resolution.severity > response.severity ? resolution : response;
}

/**
 * Ages the backend's `minutesRemaining` by the time elapsed since this exact
 * payload was received in THIS browser.
 *
 * Anchoring on a locally captured receipt instant — rather than on a
 * server-supplied timestamp or on TanStack Query's `dataUpdatedAt` — is what
 * keeps the countdown immune to both client clock skew and to placeholder
 * data (a query rendering `keepPreviousData` reports `dataUpdatedAt: 0`, the
 * epoch, which would age every row by decades). Elapsed time is floored at
 * zero so a system clock that jumps backwards cannot inflate a countdown.
 */
export function ageMinutes(
  minutesRemaining: number,
  anchorInstant: number,
  now: number,
): number {
  const elapsedMinutes = Math.max(0, now - anchorInstant) / 60_000;
  return minutesRemaining - elapsedMinutes;
}

/**
 * Rounds to the nearest whole minute, mirroring the `Math.round` the backend
 * already applies to `minutesRemaining`.
 *
 * Without this, a figure aged by the handful of milliseconds between render
 * and the first tick (134 minutes becoming 133.998) would be truncated by
 * `formatDurationMinutes` and displayed as a minute less than the server
 * just said it was.
 */
function toWholeMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? Math.round(minutes) : minutes;
}

/** "2h 14m left", or just "Due now" once the local countdown runs out. */
export function formatRemaining(minutes: number): string {
  const whole = toWholeMinutes(minutes);
  if (!Number.isFinite(whole) || whole <= 0) {
    return formatDurationMinutes(whole);
  }
  return `${formatDurationMinutes(whole)} left`;
}

/** The frozen figure on a paused clock, explicitly labelled as frozen. */
export function formatFrozenRemaining(minutes: number): string {
  const whole = toWholeMinutes(minutes);
  if (!Number.isFinite(whole) || whole <= 0) {
    return formatDurationMinutes(whole);
  }
  return `${formatDurationMinutes(whole)} left before pause`;
}
