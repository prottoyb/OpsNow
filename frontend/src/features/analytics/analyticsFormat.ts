import { formatDurationMinutes } from '../../lib/format';

/**
 * "No data" is a different statement from zero. A null rate or duration means
 * nothing completed, so there is nothing to average — it must never be drawn
 * as 0% or "0m", which would read as total failure or instant resolution.
 */
export const NO_DATA_LABEL = 'No data';

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 1,
});

const COUNT_FORMAT = new Intl.NumberFormat(undefined);

/** A 0..1 rate as "83.3%"; null is "No data", never "0%". */
export function formatRate(rate: number | null): string {
  return rate === null ? NO_DATA_LABEL : PERCENT_FORMAT.format(rate);
}

/**
 * A mean/median duration in minutes. null is "No data". Unlike
 * `formatDurationMinutes`, a genuine 0 is "0m": that helper maps zero to
 * "Due now", which is an SLA-countdown word and wrong for an average.
 */
export function formatAverageMinutes(minutes: number | null): string {
  if (minutes === null) return NO_DATA_LABEL;
  if (minutes === 0) return '0m';
  return formatDurationMinutes(minutes);
}

export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}
