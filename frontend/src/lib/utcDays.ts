/**
 * Whole-calendar-day helpers shared by the analytics and audit-log date
 * pickers. A day is a `YYYY-MM-DD` string interpreted as a UTC day, which is
 * also how `lib/format.formatDate` renders a window. A start day becomes
 * 00:00:00.000Z and an end day 23:59:59.999Z, so both ends are inclusive and a
 * single day is a legal one-day window.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The backend accepts 1970-01-01 to 2200-01-01; stay well inside both. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2199;

/**
 * The URL is user-editable, so a day is only accepted when it is a real
 * calendar date in range ("2026-02-31" and "nonsense" are ignored, exactly as
 * the other list pages ignore a malformed enum or UUID).
 */
export function parseDay(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const match = DAY_PATTERN.exec(raw);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return isRealDate ? raw : undefined;
}

export function dayStartIso(day: string): string {
  return `${day}T00:00:00.000Z`;
}

export function dayEndIso(day: string): string {
  return `${day}T23:59:59.999Z`;
}

export function todayUtcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
