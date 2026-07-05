import { describe, it, expect, beforeEach, vi } from 'vitest';

// We mock the DB adapter at a high level by stubbing the query-builder chains
// the module uses, plus the cross-module libs (settings, google-calendar) and
// the clock. This verifies the index ↔ engine wiring (template, exceptions,
// lessons, freeBusy, lead-time) without a real database.

interface AvailRow {
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
}
interface ExcRow {
  date: string;
  type: 'blocked' | 'custom' | 'block_window' | 'force_open';
  startTime: string | null;
  endTime: string | null;
}
interface LessonRow {
  startsAt: Date;
  endsAt: Date;
}

const data = vi.hoisted(() => ({
  availability: [] as AvailRow[],
  exceptions: [] as ExcRow[],
  lessons: [] as LessonRow[],
}));

// Tables carry a `__t` discriminator so the fake db knows which slice to return.
vi.mock('@/db/schema', () => ({
  availability: { __t: 'availability' },
  availabilityExceptions: { __t: 'exceptions' },
  lessons: { __t: 'lessons' },
  groupMembers: { __t: 'group_members' },
}));

// drizzle operators are no-ops here; filtering is done in the fake db by table.
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  gte: () => ({}),
  lt: () => ({}),
  inArray: () => ({}),
  ne: () => ({}),
  or: (...a: unknown[]) => a,
  exists: () => ({}),
  isNull: () => ({}),
}));

vi.mock('@/lib/db', () => {
  function rowsFor(table: { __t: string }): unknown[] {
    if (table.__t === 'availability') return data.availability;
    if (table.__t === 'exceptions') return data.exceptions;
    if (table.__t === 'lessons') return data.lessons;
    return [];
  }
  return {
    db: {
      select: (_cols?: unknown) => ({
        from: (table: { __t: string }) => {
          const result = rowsFor(table);
          const chain = {
            where: () => Promise.resolve(result),
            then: (res: (v: unknown[]) => unknown) => Promise.resolve(result).then(res),
          };
          return chain;
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
vi.mock('@/lib/settings', () => ({
  getSettings: () => Promise.resolve(settingsValue),
}));

const freeBusyMock = vi.hoisted(() =>
  vi.fn(async () => [] as { start: string; end: string }[]),
);
vi.mock('@/lib/google-calendar', () => ({
  freeBusy: (...args: unknown[]) => freeBusyMock(...(args as [])),
}));

// Freeze the clock far in the past so lead-time never trims a 2026 date.
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => new Date('2020-01-01T00:00:00.000Z') };
});

// Open-weeks gate: default OPEN for these tests (which exercise template /
// exception / lesson / freeBusy logic). The dedicated gating tests live in
// week.test.ts. `weekStartOf` stays real.
const weekOpen = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/open-weeks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/open-weeks')>('@/lib/open-weeks');
  return { ...actual, isWeekOpen: async () => weekOpen.value };
});

import { availableSlots, occupancy, timeStrToMinutes } from '@/lib/availability';
import { parseILDateTime, ilWeekday } from '@/lib/time';

// 2026-06-08 is a Monday (weekday 1) in Asia/Jerusalem.
const DATE = '2026-06-08';
const weekday = ilWeekday(parseILDateTime(DATE, '00:00'));

function resetData() {
  data.availability = [];
  data.exceptions = [];
  data.lessons = [];
  settingsValue.defaultDurationMin = 60;
  settingsValue.bufferMin = 0;
  settingsValue.leadTimeMin = 0;
  weekOpen.value = true;
  freeBusyMock.mockReset();
  freeBusyMock.mockResolvedValue([]);
}

describe('timeStrToMinutes', () => {
  it('parses HH:mm and HH:mm:ss', () => {
    expect(timeStrToMinutes('09:00')).toBe(540);
    expect(timeStrToMinutes('09:30:00')).toBe(570);
  });
});

describe('availableSlots (adapter)', () => {
  beforeEach(resetData);

  it('produces slots from the weekly template for the matching weekday', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    const slots = await availableSlots(DATE);
    expect(slots).toHaveLength(3);
    expect(slots[0].label).toBe('09:00–10:00');
    expect(slots[2].label).toBe('11:00–12:00');
  });

  it('returns nothing on a blocked exception day', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    data.exceptions = [{ date: DATE, type: 'blocked', startTime: null, endTime: null }];
    expect(await availableSlots(DATE)).toEqual([]);
  });

  it('uses a custom exception window instead of the template', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    data.exceptions = [
      { date: DATE, type: 'custom', startTime: '14:00:00', endTime: '16:00:00' },
    ];
    const slots = await availableSlots(DATE);
    expect(slots.map((s) => s.label)).toEqual(['14:00–15:00', '15:00–16:00']);
  });

  it('removes slots blocked by an existing lesson', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    data.lessons = [
      {
        startsAt: parseILDateTime(DATE, '10:00'),
        endsAt: parseILDateTime(DATE, '11:00'),
      },
    ];
    const slots = await availableSlots(DATE);
    expect(slots.map((s) => s.label)).toEqual(['09:00–10:00', '11:00–12:00']);
  });

  it('force_open does NOT reopen a booked slot to the public (double-booking disabled)', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    data.lessons = [
      { startsAt: parseILDateTime(DATE, '09:00'), endsAt: parseILDateTime(DATE, '10:00') },
    ];
    // Even with a force_open row, the booked 09:00 slot stays taken for the public.
    data.exceptions = [
      { date: DATE, type: 'force_open', startTime: '09:00:00', endTime: '10:00:00' },
    ];
    expect((await availableSlots(DATE)).map((s) => s.label)).toEqual([
      '10:00–11:00',
      '11:00–12:00',
    ]);
  });

  it('removes slots blocked by calendar freeBusy', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    freeBusyMock.mockResolvedValue([
      {
        start: parseILDateTime(DATE, '09:00').toISOString(),
        end: parseILDateTime(DATE, '10:00').toISOString(),
      },
    ]);
    const slots = await availableSlots(DATE);
    expect(slots.map((s) => s.label)).toEqual(['10:00–11:00', '11:00–12:00']);
  });

  it('degrades gracefully when freeBusy throws (lessons still respected)', async () => {
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '11:00:00', active: true },
    ];
    freeBusyMock.mockRejectedValue(new Error('calendar down'));
    const slots = await availableSlots(DATE);
    expect(slots.map((s) => s.label)).toEqual(['09:00–10:00', '10:00–11:00']);
  });
});

describe('occupancy (adapter)', () => {
  beforeEach(resetData);

  it('computes capacity, booked minutes and pct over a range', async () => {
    // One template window of 3h on DATE's weekday → 180 capacity min for a 1-day range.
    data.availability = [
      { weekday, startTime: '09:00:00', endTime: '12:00:00', active: true },
    ];
    data.lessons = [
      {
        startsAt: parseILDateTime(DATE, '09:00'),
        endsAt: parseILDateTime(DATE, '10:00'),
      },
    ];
    const res = await occupancy(DATE, '2026-06-09');
    expect(res.capacity).toBe(180);
    expect(res.booked).toBe(60);
    expect(res.pct).toBe(33);
  });
});
