import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Ilanit set איידן a standing Sunday lesson of two hours, then his mother said
  two hours was too long. She changed it to one hour from 17:00 — and it moved
  only the 13th, leaving every other Sunday at two hours and, worse, leaving the
  13th billing ₪280 for a sixty-minute lesson.

  So a recurring lesson now asks what the change applies to. These tests pin the
  three answers, and the two rules that make the wide ones safe: the past is
  never rewritten, and an occurrence whose new slot is already taken is reported
  rather than silently dropped.
*/

const state = vi.hoisted(() => ({
  lesson: null as any,
  siblings: [] as any[],
  updates: [] as Array<{ table: string; set: any; }>,
  conflictAt: [] as string[],
  now: new Date('2026-09-02T09:00:00Z'),
  /** Lower bound the query asked for — the "never rewrite the past" floor. */
  floor: null as Date | null,
}));

vi.mock('@/lib/google-calendar', () => ({ patchEvent: vi.fn(async () => ({})) }));
vi.mock('@/lib/notifications/dispatch', () => ({ notifyStudent: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/availability', () => ({
  hasSlotConflict: vi.fn(async (startISO: string) => state.conflictAt.includes(startISO)),
}));
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => state.now };
});

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  // Recorded and then APPLIED by the db mock below, so the floor is genuinely
  // under test rather than assumed.
  gte: (_col: unknown, v: unknown) => {
    state.floor = v as Date;
    return {};
  },
  inArray: () => ({}),
}));

vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  recurrences: { __t: 'recurrences' },
  students: { __t: 'students' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: { __t?: string }) => {
        const chain: any = {
          where: () => chain,
          limit: async () => (t?.__t === 'lessons' ? [state.lesson] : []),
          then: (res: (v: unknown) => unknown) => {
            const rows =
              t?.__t === 'lessons'
                ? state.siblings.filter(
                    (x) => !state.floor || x.startsAt >= state.floor,
                  )
                : [];
            return Promise.resolve(rows).then(res);
          },
        };
        return chain;
      },
    }),
    update: (t: { __t?: string }) => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push({ table: t?.__t ?? '?', set: values });
        },
      }),
    }),
  },
}));

import { rescheduleLesson } from '@/lib/lessons/reschedule';
import { parseILDateTime } from '@/lib/time';

/** A Sunday occurrence at 16:15 Israel time, two hours long. */
function sunday(date: string, over: Record<string, unknown> = {}) {
  const startsAt = parseILDateTime(date, '16:15');
  return {
    id: `l-${date}`,
    recurrenceId: 'rec-1',
    status: 'confirmed',
    studentId: 'stu-aidan',
    googleEventId: null,
    price: 280,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 120 * 60_000),
    ...over,
  };
}

/** Every update written against the lessons table, newest last. */
const lessonMoves = () => state.updates.filter((u) => u.table === 'lessons' && u.set.startsAt);

beforeEach(() => {
  state.updates = [];
  state.conflictAt = [];
  state.floor = null;
  state.now = new Date('2026-09-02T09:00:00Z'); // Wed 2 Sep — all four Sundays still ahead
  state.lesson = sunday('2026-09-13');
  state.siblings = [
    sunday('2026-09-06'), // still ahead, but BEFORE the one she opened
    state.lesson,
    sunday('2026-09-20'),
    sunday('2026-09-27'),
  ];
});

describe('rescheduleLesson — recurring scope', () => {
  it('touches only the one occurrence by default', async () => {
    const res = await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
    });

    expect(res.ok).toBe(true);
    expect(res.movedCount).toBe(1);
    expect(lessonMoves()).toHaveLength(1);
    // The series definition is untouched.
    expect(state.updates.find((u) => u.table === 'recurrences')).toBeUndefined();
  });

  it('"following" moves this one and every later one, and updates the series', async () => {
    const res = await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
      scope: 'following',
    });

    // 13th (the anchor) + 20th + 27th. The 6th is BEFORE it and stays.
    expect(res.movedCount).toBe(3);

    const series = state.updates.find((u) => u.table === 'recurrences');
    expect(series!.set).toMatchObject({ weekday: 0, startTime: '17:00', durationMin: 60 });

    // Each later occurrence keeps its own week, at the new time.
    const moved = lessonMoves().map((u) => (u.set.startsAt as Date).toISOString());
    expect(moved).toContain(parseILDateTime('2026-09-20', '17:00').toISOString());
    expect(moved).toContain(parseILDateTime('2026-09-27', '17:00').toISOString());
    expect(moved).not.toContain(parseILDateTime('2026-09-06', '17:00').toISOString());
  });

  it('"all" also catches an occurrence earlier than the one she opened', async () => {
    const res = await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
      scope: 'all',
    });

    expect(res.movedCount).toBe(4);
    const moved = lessonMoves().map((u) => (u.set.startsAt as Date).toISOString());
    expect(moved).toContain(parseILDateTime('2026-09-06', '17:00').toISOString());
  });

  it('carries a new price across every occurrence it moves', async () => {
    // The whole point of איידן's change: two hours at ₪280 becoming one hour
    // must not keep billing ₪280.
    await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
      scope: 'following',
      price: 140,
    });

    const priced = state.updates.filter((u) => u.table === 'lessons' && u.set.price === 140);
    expect(priced.length).toBeGreaterThanOrEqual(3);
    expect(state.updates.find((u) => u.table === 'recurrences')!.set.price).toBe(140);
  });

  it('leaves prices alone when none was given', async () => {
    await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
      scope: 'following',
    });

    expect(state.updates.some((u) => 'price' in u.set)).toBe(false);
  });

  it('reports an occurrence it could not move instead of dropping it', async () => {
    // Somebody else already holds 17:00 on the 20th.
    state.conflictAt = [parseILDateTime('2026-09-20', '17:00').toISOString()];

    const res = await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-13', '17:00'),
      durationMin: 60,
      notifyParent: false,
      scope: 'following',
    });

    expect(res.skippedConflicts).toBe(1);
    expect(res.movedCount).toBe(2); // anchor + the 27th
  });

  it('moves the whole series to a new weekday, week by week', async () => {
    // Sunday → Monday: each week's lesson shifts a day, rather than the series
    // collapsing onto a single date.
    const res = await rescheduleLesson({
      lessonId: 'l-2026-09-13',
      startsAt: parseILDateTime('2026-09-14', '17:00'), // Monday
      durationMin: 60,
      notifyParent: false,
      scope: 'following',
    });

    expect(res.ok).toBe(true);
    expect(state.updates.find((u) => u.table === 'recurrences')!.set.weekday).toBe(1);
    const moved = lessonMoves().map((u) => (u.set.startsAt as Date).toISOString());
    expect(moved).toContain(parseILDateTime('2026-09-21', '17:00').toISOString());
    expect(moved).toContain(parseILDateTime('2026-09-28', '17:00').toISOString());
  });
});
