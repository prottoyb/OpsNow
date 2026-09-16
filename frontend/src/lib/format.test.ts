import { describe, expect, it } from 'vitest';
import {
  DUE_NOW_LABEL,
  formatDateTime,
  formatDurationMinutes,
  toDateTimeAttribute,
} from './format';

describe('formatDurationMinutes', () => {
  it('renders minutes below an hour', () => {
    expect(formatDurationMinutes(1)).toBe('1m');
    expect(formatDurationMinutes(45)).toBe('45m');
    expect(formatDurationMinutes(59)).toBe('59m');
  });

  it('truncates rather than rounds up into the next unit', () => {
    // 59.6 minutes must not read "60m", which is not a duration anyone writes.
    expect(formatDurationMinutes(59.6)).toBe('59m');
  });

  it('renders exactly sixty minutes as one hour', () => {
    expect(formatDurationMinutes(60)).toBe('1h');
  });

  it('renders hours and minutes', () => {
    expect(formatDurationMinutes(134)).toBe('2h 14m');
    expect(formatDurationMinutes(120)).toBe('2h');
    expect(formatDurationMinutes(1439)).toBe('23h 59m');
  });

  it('renders more than a day in days and hours', () => {
    expect(formatDurationMinutes(1440)).toBe('1d');
    expect(formatDurationMinutes(1500)).toBe('1d 1h');
    expect(formatDurationMinutes(4320)).toBe('3d');
  });

  it('distinguishes zero from a sub-minute remainder', () => {
    expect(formatDurationMinutes(0)).toBe(DUE_NOW_LABEL);
    expect(formatDurationMinutes(0.4)).toBe('Less than a minute');
    expect(formatDurationMinutes(0.99)).toBe('Less than a minute');
  });

  /**
   * The countdown ages a figure locally between refetches, so it routinely
   * goes negative before the next refetch lands. It must clamp — never a
   * negative number, and never the word "overdue", which only ever comes
   * from the backend's own state string.
   */
  it('clamps a negative duration to "Due now" without implying a breach', () => {
    expect(formatDurationMinutes(-1)).toBe(DUE_NOW_LABEL);
    expect(formatDurationMinutes(-5000)).toBe(DUE_NOW_LABEL);
    expect(formatDurationMinutes(-5000)).not.toMatch(/overdue|breach|-/i);
  });

  it('does not throw on a non-finite input', () => {
    expect(formatDurationMinutes(Number.NaN)).toBe('Unknown');
    expect(formatDurationMinutes(Number.POSITIVE_INFINITY)).toBe('Unknown');
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO string and reports an unparseable one', () => {
    expect(formatDateTime('2026-01-05T09:00:00.000Z')).not.toBe('Unknown');
    expect(formatDateTime('not-a-date')).toBe('Unknown');
  });
});

describe('toDateTimeAttribute', () => {
  it('returns a machine-readable value, or undefined when unparseable', () => {
    expect(toDateTimeAttribute('2026-01-05T09:00:00.000Z')).toBe(
      '2026-01-05T09:00:00.000Z',
    );
    expect(toDateTimeAttribute('not-a-date')).toBeUndefined();
  });
});
