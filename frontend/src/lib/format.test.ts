import { describe, expect, it } from 'vitest';
import {
  DUE_NOW_LABEL,
  formatDate,
  formatDateTime,
  formatDurationMinutes,
  toDateAttribute,
  toDateInputValue,
  toDateTimeAttribute,
} from './format';

/*
 * `vitest.config.ts` pins TZ to America/New_York, a NEGATIVE-offset zone, so
 * these assertions are reproducible and — crucially — can actually fail.
 * Under a UTC-pinned run, a date-only value formatted in local time would be
 * indistinguishable from one formatted in UTC, and the day-shift bug these
 * cover would pass silently.
 */
/*
 * Asserted by PROPERTY rather than against an exact string: the formatter
 * uses the runtime's own locale, so "Sep 17, 2026" and "17 Sept 2026" are
 * both correct and neither should be hard-coded. What must hold in every
 * locale is the calendar day.
 */
describe('formatDate', () => {
  it('renders the stored calendar day, not the viewer-local one', () => {
    // Date-only columns (`Asset.purchaseDate`, `warrantyExpiresAt`) arrive as
    // midnight UTC. In a UTC-5 zone that instant is 7pm on the 16th locally,
    // so a date-time formatter would render the WRONG DAY here.
    const formatted = formatDate('2026-09-17T00:00:00.000Z');
    expect(formatted).toMatch(/\b17\b/);
    expect(formatted).not.toMatch(/\b16\b/);
    expect(formatted).toMatch(/2026/);
  });

  it('never appends a time to a date-only value', () => {
    expect(formatDate('2026-09-17T00:00:00.000Z')).not.toMatch(/\d:\d{2}/);
  });

  it('agrees with what the edit form shows for the same value', () => {
    // The read view and the date input must never disagree about the day —
    // the bug this guards is a read view saying "31 Dec 2025" over an input
    // showing "2026-01-01".
    const iso = '2026-01-01T00:00:00.000Z';
    expect(toDateInputValue(iso)).toBe('2026-01-01');
    const formatted = formatDate(iso);
    expect(formatted).toMatch(/\b1\b/);
    expect(formatted).toMatch(/2026/);
    expect(formatted).not.toMatch(/2025/);
  });

  it('returns Unknown for an unparseable value', () => {
    expect(formatDate('not-a-date')).toBe('Unknown');
  });
});

describe('toDateAttribute', () => {
  it('emits the date-only form HTML wants for a date-only value', () => {
    expect(toDateAttribute('2026-09-17T00:00:00.000Z')).toBe('2026-09-17');
  });

  it('returns undefined rather than an invalid attribute', () => {
    expect(toDateAttribute('not-a-date')).toBeUndefined();
  });
});

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
