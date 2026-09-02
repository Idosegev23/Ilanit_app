import { describe, it, expect } from 'vitest';
import { mayAskToday } from '@/lib/payments/collect-window';

/*
  דריה טפר pays on the 15th. Asking her on the 2nd is not a reminder, it is a
  fortnight of nagging — so the charge is recorded on time and the asking waits.
*/

// 09:00 Asia/Jerusalem on the given September day.
const sep = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T06:00:00Z`);

describe('mayAskToday', () => {
  it('asks any day when the family has no fixed pay-day', () => {
    expect(mayAskToday({ collectFromDay: null }, sep(2))).toBe(true);
    expect(mayAskToday({ collectFromDay: null }, sep(28))).toBe(true);
  });

  it('stays quiet before the day', () => {
    expect(mayAskToday({ collectFromDay: 15 }, sep(2))).toBe(false);
    expect(mayAskToday({ collectFromDay: 15 }, sep(14))).toBe(false);
  });

  it('asks on the day itself', () => {
    expect(mayAskToday({ collectFromDay: 15 }, sep(15))).toBe(true);
  });

  it('keeps asking after the day, so a missed hour is not a missed month', () => {
    expect(mayAskToday({ collectFromDay: 15 }, sep(16))).toBe(true);
    expect(mayAskToday({ collectFromDay: 15 }, sep(30))).toBe(true);
  });

  it('reads the day in Jerusalem, not UTC', () => {
    /*
      22:00 UTC on the 14th is already the 15th in Israel. Comparing in UTC
      would hold the request back for another day for anyone whose evening
      crosses midnight locally.
    */
    const lateOnThe14thUTC = new Date('2026-09-14T22:00:00Z');
    expect(mayAskToday({ collectFromDay: 15 }, lateOnThe14thUTC)).toBe(true);
  });
});
