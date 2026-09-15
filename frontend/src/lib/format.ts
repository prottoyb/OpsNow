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
 * A `UserSummary` carries id/firstName/lastName/role and deliberately NO
 * email, so a person is always identified here by name.
 */
export function fullName(user: UserSummary): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
