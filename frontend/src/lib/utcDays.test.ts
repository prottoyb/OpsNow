import { describe, expect, it } from 'vitest';
import { dayEndIso, dayStartIso, parseDay, todayUtcDay } from './utcDays';

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

describe('day boundaries', () => {
  it('maps a day to inclusive UTC instants', () => {
    expect(dayStartIso('2026-09-21')).toBe('2026-09-21T00:00:00.000Z');
    expect(dayEndIso('2026-09-21')).toBe('2026-09-21T23:59:59.999Z');
    expect(todayUtcDay(new Date('2026-09-21T23:30:00.000Z'))).toBe('2026-09-21');
  });
});
