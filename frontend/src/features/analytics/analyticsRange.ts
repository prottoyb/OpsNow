import { dayEndIso, dayStartIso, todayUtcDay } from '../../lib/utcDays';
import { ANALYTICS_MAX_WINDOW_DAYS } from '../../types/api';

/**
 * The dashboard's date range validation and request mapping. The whole-day
 * helpers (`parseDay`, `dayStartIso`, `dayEndIso`, `todayUtcDay`) live in
 * `lib/utcDays` because the audit-log page uses them too.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
