import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the open-weeks GATE on availableSlots / isSlotBookable, and for the
// availableWeek 7-day view. DB, settings, calendar and the clock are mocked, and
// `isWeekOpen` is mocked so we can toggle the gate deterministically.

interface AvailRow {
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

const data = vi.hoisted(() => ({
  availability: [] as AvailRow[],
}));

vi.mock('@/db/schema', () => ({
  availability: { __t: 'availability' },
  availabilityExceptions: { __t: 'exceptions' },
  lessons: { __t: 'lessons' },
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  gte: () => ({}),
  lt: () => ({}),
  inArray: () => ({}),
}));

vi.mock('@/lib/db', () => {
  function rowsFor(table: { __t: string }): unknown[] {
    if (table.__t === 'availability') return data.availability;
    return [];
  }
  return {
    db: {
      select: (_cols?: unknown) => ({
        from: (table: { __t: string }) => {
          const result = rowsFor(table);
          return {
            where: () => Promise.resolve(result),
            then: (res: (v: unknown[]) => unknown) => Promise.resolve(result).then(res),
          };
        },
      }),
    },
  };
});

const settingsValue = vi.hoisted(() => ({
  defaultDurationMin: 60,
  bufferMin: 0,
  leadTimeMin: 0,
}));
vi.mock('@/lib/settings', () => ({ getSettings: () => Promise.resolve(settingsValue) }));

vi.mock('@/lib/google-calendar', () => ({ freeBusy: async () => [] }));

// Clock frozen far in the past so lead-time never trims the 2026 dates.
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => new Date('2020-01-01T00:00:00.000Z') };
});

// Controllable open-weeks gate; weekStartOf stays real.
const gate = vi.hoisted(() => ({ open: true }));
vi.mock('@/lib/open-weeks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/open-weeks')>('@/lib/open-weeks');
  return { ...actual, isWeekOpen: async () => gate.open };
});

import { availableSlots, isSlotBookable, availableWeek } from '@/lib/availability';
import { parseILDateTime, ilWeekday } from '@/lib/time';

// 2026-06-08 is a Monday (weekday 1); its week starts Sunday 2026-06-07.
const DATE = '2026-06-08';
const WEEK_START = '2026-06-07';
const weekday = ilWeekday(parseILDateTime(DATE, '00:00'));

beforeEach(() => {
  data.availability = [{ weekday, startTime: '09:00:00', endTime: '12:00:00', active: true }];
  gate.open = true;
});

describe('availableSlots open-weeks gate', () => {
  it('returns slots when the week is open', async () => {
    gate.open = true;
    const slots = await availableSlots(DATE);
    expect(slots).toHaveLength(3);
  });

  it('returns nothing when the week is NOT open (even with a template)', async () => {
    gate.open = false;
    expect(await availableSlots(DATE)).toEqual([]);
  });
});

describe('isSlotBookable open-weeks gate', () => {
  const startISO = parseILDateTime(DATE, '09:00').toISOString();
  const endISO = parseILDateTime(DATE, '10:00').toISOString();

  it('is true when the week is open and the slot is inside a template window', async () => {
    gate.open = true;
    expect(await isSlotBookable(startISO, endISO)).toBe(true);
  });

  it('is false when the week is NOT open', async () => {
    gate.open = false;
    expect(await isSlotBookable(startISO, endISO)).toBe(false);
  });
});

describe('availableWeek', () => {
  it('normalizes to the Sunday and returns 7 days Sun→Sat', async () => {
    // Pass a mid-week day; it should normalize to the Sunday weekStart.
    const week = await availableWeek(DATE);
    expect(week.weekStartISO).toBe(WEEK_START);
    expect(week.isOpen).toBe(true);
    expect(week.days).toHaveLength(7);
    expect(week.days[0].dateISO).toBe('2026-06-07'); // Sunday
    expect(week.days[0].weekday).toBe(0);
    expect(week.days[6].dateISO).toBe('2026-06-13'); // Saturday
    expect(week.days[6].weekday).toBe(6);
  });

  it('exposes slots on the matching weekday when open', async () => {
    const week = await availableWeek(WEEK_START);
    const monday = week.days.find((d) => d.dateISO === DATE);
    expect(monday?.slots).toHaveLength(3);
  });

  it('reports isOpen=false and empty slots for every day when the week is closed', async () => {
    gate.open = false;
    const week = await availableWeek(WEEK_START);
    expect(week.isOpen).toBe(false);
    expect(week.days).toHaveLength(7);
    expect(week.days.every((d) => d.slots.length === 0)).toBe(true);
  });
});
