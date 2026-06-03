import { describe, it, expect } from 'vitest';
import { toILMonthStr, toMonthKey } from '@/lib/groups/month';

describe('toILMonthStr', () => {
  it('formats yyyy-MM as MM/yyyy', () => {
    expect(toILMonthStr('2026-06')).toBe('06/2026');
  });

  it('formats a full date as MM/yyyy', () => {
    expect(toILMonthStr('2026-12-01')).toBe('12/2026');
  });

  it('trims surrounding whitespace', () => {
    expect(toILMonthStr('  2026-01  ')).toBe('01/2026');
  });

  it('throws on invalid input', () => {
    expect(() => toILMonthStr('June 2026')).toThrow(/invalid month/);
    expect(() => toILMonthStr('2026/06')).toThrow(/invalid month/);
  });
});

describe('toMonthKey', () => {
  it('produces a first-of-month key from yyyy-MM', () => {
    expect(toMonthKey('2026-06')).toBe('2026-06-01');
  });

  it('normalizes a full date to first-of-month', () => {
    expect(toMonthKey('2026-06-17')).toBe('2026-06-01');
  });

  it('throws on garbage', () => {
    expect(() => toMonthKey('nope')).toThrow(/invalid month/);
  });
});
