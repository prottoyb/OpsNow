import { ANALYTICS_MAX_WINDOW_DAYS } from '../../types/api';

/**
 * The dashboard's date range is picked as whole calendar days and interpreted
 * as UTC days, which is also how `lib/format.formatDate` renders a window. A
 * start day becomes 00:00:00.000Z and an end day 23:59:59.999Z, so both ends
 * are inclusive and a single day is a legal one-day window.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export interface DayRange {
  from?: string;
  to?: string;
}

export const RANGE_ORDER_MESSAGE =
  'The start date must not be after the end date.';
export const RANGE_SPAN_MESSAGE = `Choose a range of at most ${ANALYTICS_MAX_WINDOW_DAYS} days.`;

/**
 * The range the request would carry, with the open ends resolved the way the
 * backend would: an open end date means "now", so it is today when only a
 * start date is set. An open start date is left to the backend's own default
 * (30 days before the end), which can never exceed the limit.
 */
function resolve(range: DayRange, now: Date): DayRange {
  if (range.from && !range.to) return { from: range.from, to: todayUtcDay(now) };
  return range;
}

/**
 * Returns guidance text when the range could only produce a 400, else null.
 * This mirrors — it does not replace — the backend's own check
 * (`resolveWindow` in `backend/src/analytics/analytics.filters.ts`): the
 * point is that the UI never originates the failed request.
 */
export function validateRange(range: DayRange, now: Date = new Date()): string | null {
  const { from, to } = resolve(range, now);
  if (!from || !to) return null;
  const start = Date.parse(dayStartIso(from));
  const end = Date.parse(dayEndIso(to));
  if (start > end) return RANGE_ORDER_MESSAGE;
  if ((end - start) / MS_PER_DAY > ANALYTICS_MAX_WINDOW_DAYS) {
    return RANGE_SPAN_MESSAGE;
  }
  return null;
}

/** ISO instants for the request; empty when no date is chosen. */
export function toRequestRange(
  range: DayRange,
  now: Date = new Date(),
): { from?: string; to?: string } {
  const { from, to } = resolve(range, now);
  return {
    from: from ? dayStartIso(from) : undefined,
    to: to ? dayEndIso(to) : undefined,
  };
}
