import { describe, it, expect } from 'vitest';
import {
  statusLabel,
  toBullets,
  lessonsByStatusSummary,
  formatILDayTime,
} from '@/app/dashboard/format';

describe('statusLabel', () => {
  it('maps known statuses to Hebrew', () => {
    expect(statusLabel('completed')).toBe('בוצעו');
    expect(statusLabel('pending')).toBe('ממתינים');
    expect(statusLabel('confirmed')).toBe('מאושרים');
  });
  it('falls back to the raw key', () => {
    expect(statusLabel('weird')).toBe('weird');
  });
});

describe('toBullets', () => {
  it('strips bullet/number markers and drops blanks', () => {
    const text = '• ראשון\n- שני\n2) שלישי\n\n   \n* רביעי';
    expect(toBullets(text)).toEqual(['ראשון', 'שני', 'שלישי', 'רביעי']);
  });
  it('passes through plain lines', () => {
    expect(toBullets('שורה אחת\nשורה שתיים')).toEqual(['שורה אחת', 'שורה שתיים']);
  });
  it('returns empty array for whitespace-only', () => {
    expect(toBullets('   \n  ')).toEqual([]);
  });
});

describe('lessonsByStatusSummary', () => {
  it('orders done → confirmed → pending and joins', () => {
    expect(
      lessonsByStatusSummary({ pending: 2, completed: 5, confirmed: 3 }),
    ).toBe('בוצעו 5 · מאושרים 3 · ממתינים 2');
  });
  it('omits zero/missing statuses', () => {
    expect(lessonsByStatusSummary({ completed: 4 })).toBe('בוצעו 4');
  });
  it('returns a placeholder when empty', () => {
    expect(lessonsByStatusSummary({})).toBe('אין שיעורים');
  });
});

describe('formatILDayTime', () => {
  it('formats a known instant in Asia/Jerusalem', () => {
    // 2026-06-03 16:00 IL (UTC+3) → Wednesday.
    const d = new Date('2026-06-03T13:00:00.000Z');
    const out = formatILDayTime(d);
    expect(out).toContain('רביעי');
    expect(out).toContain('16:00');
  });
});
