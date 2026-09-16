import type { UserSummary } from '../types/api';

/**
 * Timestamps arrive as ISO-8601 strings (see the header of `types/api.ts`),
 * so they are parsed explicitly here rather than assumed to be Dates.
 * Formatting is done with the platform's `Intl` — no date library.
 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return DATE_TIME_FORMAT.format(date);
}

/** A machine-readable value for <time dateTime>, or undefined if unparseable. */
export function toDateTimeAttribute(isoString: string): string | undefined {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * What `formatDurationMinutes` returns for a duration that has run out.
 *
 * Exported as a constant so callers can branch on it without string
 * matching. The word "overdue" deliberately never appears here: whether a
 * clock has actually breached is decided by the backend's own SLA state
 * string, never by this arithmetic (DECISIONS.md ADR-021).
 */
export const DUE_NOW_LABEL = 'Due now';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Formats a number of minutes as a short human duration ("45m", "1h",
 * "2h 14m", "1d 6h").
 *
 * Pure and total: a negative input clamps to `DUE_NOW_LABEL` rather than
 * rendering a negative number, and a non-finite input returns 'Unknown'.
 * Truncation (not rounding) is used below the next unit so 59.6 minutes
 * reads "59m" rather than an impossible "60m".
 */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) {
    return 'Unknown';
  }
  if (minutes <= 0) {
    return DUE_NOW_LABEL;
  }
  if (minutes < 1) {
    return 'Less than a minute';
  }

  const total = Math.floor(minutes);

  if (total < MINUTES_PER_HOUR) {
    return `${total}m`;
  }

  if (total < MINUTES_PER_DAY) {
    const hours = Math.floor(total / MINUTES_PER_HOUR);
    const rest = total % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  const days = Math.floor(total / MINUTES_PER_DAY);
  const hours = Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/**
 * A `UserSummary` carries id/firstName/lastName/role and deliberately NO
 * email, so a person is always identified here by name.
 */
export function fullName(user: UserSummary): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
