import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Moving a CONFIRMED lesson onto a slot that overlaps its own current time.

  Excluding the lesson's database row is not enough. The same lesson is also a
  block on Ilanit's calendar, and freeBusy reports blocks without ids — so it
  came back as an anonymous busy window and the lesson collided with itself.
  A 15:30 lesson could not be moved to 15:15, which is the ordinary case: you
  nearly always nudge a lesson within its own hour.
*/

const state = vi.hoisted(() => ({
  lessonRows: [] as Array<{ startsAt: Date; endsAt: Date }>,
  excluded: null as null | { googleEventId: string | null; startsAt: Date; endsAt: Date },
  busy: [] as Array<{ start: string; end: string }>,
  events: [] as Array<{ id: string; summary: string; startISO?: string; endISO?: string }>,
}));

const mocks = vi.hoisted(() => ({
  freeBusy: vi.fn(async () => state.busy),
  listEventsInRange: vi.fn(async () => state.events),
}));

vi.mock('@/lib/google-calendar', () => ({
  freeBusy: mocks.freeBusy,
  listEventsInRange: mocks.listEventsInRange,
}));
vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({ bufferMin: 0, leadTimeMin: 0, bookingHorizonDays: 30 }),
}));
vi.mock('@/lib/open-weeks', () => ({ weekStartOf: () => '2026-08-30' }));

/*
  Two different query shapes hit `lessons` here: the busy scan awaits straight
  after .where(), while the excluded-lesson lookup ends in .limit(1). The chain
  is therefore thenable AND has .limit().
*/
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => {
        const chain: Record<string, unknown> = {
          where: () => chain,
          limit: async () => (state.excluded ? [state.excluded] : []),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(state.lessonRows).then(resolve),
        };
        return chain;
      },
    }),
  },
}));

vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons', id: {}, startsAt: {}, endsAt: {}, status: {}, googleEventId: {} },
  availabilityExceptions: { __t: 'exceptions' },
  weeklyTemplate: { __t: 'template' },
  groupMembers: {},
  openWeeks: {},
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  ne: () => ({}),
  or: () => ({}),
  exists: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  isNull: () => ({}),
  inArray: () => ({}),
}));

import { hasSlotConflict } from '@/lib/availability';

// 15:30–16:30 Israel time on 2 Sep 2026 (UTC+3).
const OLD_START = '2026-09-02T12:30:00.000Z';
const OLD_END = '2026-09-02T13:30:00.000Z';
// The move: 15:15–16:15, overlapping the old slot.
const NEW_START = '2026-09-02T12:15:00.000Z';
const NEW_END = '2026-09-02T13:15:00.000Z';

beforeEach(() => {
  state.lessonRows = [];
  state.excluded = null;
  state.busy = [];
  state.events = [];
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('hasSlotConflict — a lesson must not block its own move', () => {
  it('reports no conflict when the only blocker is the lesson being moved', async () => {
    // Row excluded, but the calendar still carries its event.
    state.excluded = {
      googleEventId: 'gcal-1',
      startsAt: new Date(OLD_START),
      endsAt: new Date(OLD_END),
    };
    state.busy = [{ start: OLD_START, end: OLD_END }];
    state.events = [{ id: 'gcal-1', summary: 'שיעור', startISO: OLD_START, endISO: OLD_END }];

    const clash = await hasSlotConflict(NEW_START, NEW_END, 'lesson-1');

    expect(clash).toBe(false);
  });

  it('still reports a conflict when a DIFFERENT event occupies the new slot', async () => {
    // The exclusion must be surgical: removing the lesson's own block must not
    // blind the check to somebody else's.
    state.excluded = {
      googleEventId: 'gcal-1',
      startsAt: new Date(OLD_START),
      endsAt: new Date(OLD_END),
    };
    state.busy = [
      { start: OLD_START, end: OLD_END },
      { start: NEW_START, end: NEW_END },
    ];
    state.events = [
      { id: 'gcal-1', summary: 'שיעור', startISO: OLD_START, endISO: OLD_END },
      { id: 'gcal-other', summary: 'אחר', startISO: NEW_START, endISO: NEW_END },
    ];

    const clash = await hasSlotConflict(NEW_START, NEW_END, 'lesson-1');

    expect(clash).toBe(true);
  });

  it('conflicts normally when nothing is excluded', async () => {
    state.busy = [{ start: OLD_START, end: OLD_END }];

    const clash = await hasSlotConflict(NEW_START, NEW_END);

    expect(clash).toBe(true);
  });
});
