import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the booking WEEK-view server action `loadBookingWeek`. We mock the
// foundation (`availableWeek`, `listOpenWeeks`, `weekStartOf`, `getSettings`)
// and freeze the clock so the horizon math and the nearest-open-week resolution
// are deterministic. `weekStartOf`/`parseILDateTime` stay REAL so the Sunday
// normalization is exercised end-to-end.

const calls = vi.hoisted(() => ({ availableWeekArgs: [] as string[] }));
const openWeeksValue = vi.hoisted(() => ({ list: [] as string[] }));

vi.mock('@/lib/availability', () => ({
  availableWeek: async (weekStartISO: string) => {
    calls.availableWeekArgs.push(weekStartISO);
    return {
      weekStartISO,
      isOpen: openWeeksValue.list.includes(weekStartISO),
      days: Array.from({ length: 7 }, (_, i) => ({
        dateISO: weekStartISO,
        weekday: i,
        slots: [],
      })),
    };
  },
}));

vi.mock('@/lib/open-weeks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/open-weeks')>('@/lib/open-weeks');
  return {
    ...actual,
    listOpenWeeks: async () => openWeeksValue.list,
  };
});

vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({ bookingHorizonDays: 14 }),
}));

// Freeze "now" to Wednesday 2026-06-10 (its week starts Sunday 2026-06-07).
// Horizon = +14 days → 2026-06-24 (Wed), whose week starts Sunday 2026-06-21.
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => new Date('2026-06-10T08:00:00.000Z') };
});

import { loadBookingWeek } from '@/app/book/[token]/actions';

const CURRENT_WEEK = '2026-06-07'; // Sunday of "now"
const NEXT_WEEK = '2026-06-14';
const LAST_WEEK = '2026-06-21'; // Sunday of (now + horizon)

beforeEach(() => {
  calls.availableWeekArgs = [];
  openWeeksValue.list = [];
});

describe('loadBookingWeek horizon bounds', () => {
  it('reports the current and last bookable Sunday from the horizon', async () => {
    const view = await loadBookingWeek(CURRENT_WEEK);
    expect(view.firstWeekStart).toBe(CURRENT_WEEK);
    expect(view.lastWeekStart).toBe(LAST_WEEK);
  });
});

describe('loadBookingWeek initial load', () => {
  it('always lands on the current week (no manual open-weeks step)', async () => {
    const view = await loadBookingWeek();
    expect(view.week.weekStartISO).toBe(CURRENT_WEEK);
  });

  it('reports every Sunday in the horizon as bookable', async () => {
    const view = await loadBookingWeek();
    expect(view.openWeeks).toEqual([CURRENT_WEEK, NEXT_WEEK, LAST_WEEK]);
  });
});

describe('loadBookingWeek explicit navigation', () => {
  it('normalizes a mid-week date to its Sunday', async () => {
    const view = await loadBookingWeek('2026-06-17'); // a Wednesday
    expect(view.week.weekStartISO).toBe(NEXT_WEEK);
  });

  it('clamps a date BEFORE the horizon up to the current week', async () => {
    const view = await loadBookingWeek('2026-05-01');
    expect(view.week.weekStartISO).toBe(CURRENT_WEEK);
  });

  it('clamps a date AFTER the horizon down to the last week', async () => {
    const view = await loadBookingWeek('2026-08-01');
    expect(view.week.weekStartISO).toBe(LAST_WEEK);
  });
});
