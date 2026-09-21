import { describe, expect, it } from 'vitest';
import {
  RANGE_ORDER_MESSAGE,
  RANGE_SPAN_MESSAGE,
  parseDay,
  toRequestRange,
  validateRange,
} from './analyticsRange';
import {
  NO_DATA_LABEL,
  formatAverageMinutes,
  formatRate,
} from './analyticsFormat';

const NOW = new Date('2026-09-21T12:00:00.000Z');

describe('parseDay', () => {
  it('accepts a real calendar day and rejects everything else', () => {
    expect(parseDay('2026-09-21')).toBe('2026-09-21');
    expect(parseDay('2026-02-31')).toBeUndefined();
    expect(parseDay('21/09/2026')).toBeUndefined();
    expect(parseDay('nonsense')).toBeUndefined();
    expect(parseDay('1969-12-31')).toBeUndefined();
    expect(parseDay('2200-01-01')).toBeUndefined();
    expect(parseDay('')).toBeUndefined();
    expect(parseDay(null)).toBeUndefined();
  });
});

describe('validateRange', () => {
  it('allows no dates, one date, and a one-day window', () => {
    expect(validateRange({}, NOW)).toBeNull();
    expect(validateRange({ to: '2026-09-01' }, NOW)).toBeNull();
    expect(validateRange({ from: '2026-09-21', to: '2026-09-21' }, NOW)).toBeNull();
  });

  it('allows exactly 366 days inclusive and rejects 367, matching the backend limit', () => {
    // 2025-09-21 .. 2026-09-21 is 366 inclusive days (a 365-day gap).
    expect(validateRange({ from: '2025-09-21', to: '2026-09-21' }, NOW)).toBeNull();
    expect(validateRange({ from: '2025-09-20', to: '2026-09-21' }, NOW)).toBe(
      RANGE_SPAN_MESSAGE,
    );
  });

  it('rejects an inverted range', () => {
    expect(validateRange({ from: '2026-09-21', to: '2026-09-01' }, NOW)).toBe(
      RANGE_ORDER_MESSAGE,
    );
  });

  it('treats a lone start date as running to today', () => {
    expect(validateRange({ from: '2024-01-01' }, NOW)).toBe(RANGE_SPAN_MESSAGE);
    expect(validateRange({ from: '2026-09-01' }, NOW)).toBeNull();
    expect(validateRange({ from: '2026-10-01' }, NOW)).toBe(RANGE_ORDER_MESSAGE);
  });
});

describe('toRequestRange', () => {
  it('sends whole UTC days, both ends inclusive', () => {
    expect(toRequestRange({ from: '2026-09-01', to: '2026-09-10' }, NOW)).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-10T23:59:59.999Z',
    });
  });

  it('sends nothing when no date is chosen, leaving the backend default', () => {
    expect(toRequestRange({}, NOW)).toEqual({ from: undefined, to: undefined });
  });
});

describe('null is not zero', () => {
  it('renders a null rate as no data, and a real 0 as 0%', () => {
    expect(formatRate(null)).toBe(NO_DATA_LABEL);
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.8333)).toBe('83.3%');
    expect(formatRate(1)).toBe('100%');
  });

  it('renders a null duration as no data, and a real 0 as 0m (never "Due now")', () => {
    expect(formatAverageMinutes(null)).toBe(NO_DATA_LABEL);
    expect(formatAverageMinutes(0)).toBe('0m');
    expect(formatAverageMinutes(95)).toBe('1h 35m');
  });
});
