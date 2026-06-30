import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the /lessons server actions added for the calendar-import refinement:
//   - assignStudentToLesson: owner-only bind of a needs_match lesson
//   - backfillImportedTitles: owner-only title backfill from Google Calendar
// The db, auth, students, google-calendar and next/cache are mocked.

const state = vi.hoisted(() => ({
  lesson: null as null | Record<string, unknown>,
  student: null as null | { id: string; defaultPrice: number | null },
  backfillRows: [] as Array<{ id: string; googleEventId: string | null }>,
  updates: [] as Array<{ id: unknown; patch: Record<string, unknown> }>,
}));

const mocks = vi.hoisted(() => ({
  authed: { value: true },
  getStudent: vi.fn(async () => state.student),
  getEvent: vi.fn(async (_id: string) => null as null | { summary: string }),
}));

vi.mock('@/auth', () => ({
  auth: async () => (mocks.authed.value ? { user: { email: 'ilanit@example.com' } } : null),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => ({ __eq: a }),
  isNull: (...a: unknown[]) => ({ __isNull: a }),
  isNotNull: (...a: unknown[]) => ({ __isNotNull: a }),
}));
vi.mock('@/db/schema', () => ({ lessons: { __t: 'lessons' } }));
vi.mock('@/lib/students', () => ({
  getStudent: mocks.getStudent,
  findStudentByPhone: vi.fn(),
  createStudent: vi.fn(),
}));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/recurrence', () => ({ cancelOne: vi.fn(), createSeries: vi.fn() }));
vi.mock('@/lib/google-calendar', () => ({
  insertEvent: vi.fn(),
  getEvent: (id: string) => mocks.getEvent(id),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      // The two actions issue different selects:
      //   assign:   select().from().where().limit()  → [lesson] | []
      //   backfill: select().from().where()  (awaited) → backfillRows
      // So .where() returns a thenable that ALSO exposes .limit().
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = () => ({
        limit: () => Promise.resolve(state.lesson ? [state.lesson] : []),
        then: (resolve: (v: unknown) => unknown) => resolve(state.backfillRows),
      });
      return builder;
    },
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          state.updates.push({ id: cond, patch });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

import { assignStudentToLesson, backfillImportedTitles } from '@/app/lessons/actions';

beforeEach(() => {
  mocks.authed.value = true;
  mocks.getStudent.mockClear();
  mocks.getEvent.mockReset();
  mocks.getEvent.mockResolvedValue(null);
  state.lesson = null;
  state.student = null;
  state.backfillRows = [];
  state.updates = [];
});

describe('assignStudentToLesson', () => {
  it('binds the student, clears needs_match, and snapshots the default price', async () => {
    state.lesson = { id: 'l1', needsMatch: true, price: null };
    state.student = { id: 's1', defaultPrice: 130 };

    const res = await assignStudentToLesson('l1', 's1');

    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({
      studentId: 's1',
      needsMatch: false,
      price: 130,
    });
  });

  it('keeps an existing lesson price (does not overwrite with the default)', async () => {
    state.lesson = { id: 'l1', needsMatch: true, price: 100 };
    state.student = { id: 's1', defaultPrice: 130 };

    await assignStudentToLesson('l1', 's1');

    expect(state.updates[0].patch).not.toHaveProperty('price');
  });

  it('rejects when the lesson is not in needs_match state', async () => {
    state.lesson = { id: 'l1', needsMatch: false, price: null };
    state.student = { id: 's1', defaultPrice: 130 };

    const res = await assignStudentToLesson('l1', 's1');
    expect(res).toEqual({ ok: false, error: 'השיעור כבר שויך' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when the student does not exist', async () => {
    state.lesson = { id: 'l1', needsMatch: true, price: null };
    state.student = null;

    const res = await assignStudentToLesson('l1', 'nope');
    expect(res.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('requires a studentId', async () => {
    const res = await assignStudentToLesson('l1', '');
    expect(res).toEqual({ ok: false, error: 'יש לבחור תלמיד/ה' });
  });

  it('rejects when not authenticated as owner', async () => {
    mocks.authed.value = false;
    const res = await assignStudentToLesson('l1', 's1');
    expect(res).toEqual({ ok: false, error: 'אין הרשאה' });
  });
});

describe('backfillImportedTitles', () => {
  it('fetches each untitled import and writes the event summary as the title', async () => {
    state.backfillRows = [
      { id: 'l1', googleEventId: 'evt-1' },
      { id: 'l2', googleEventId: 'evt-2' },
    ];
    mocks.getEvent.mockImplementation(async (id: string) =>
      id === 'evt-1' ? { summary: 'שיעור – דנה' } : { summary: '  שיעור – יוסי  ' },
    );

    const res = await backfillImportedTitles();

    expect(res.ok).toBe(true);
    expect(res.scanned).toBe(2);
    expect(res.updated).toBe(2);
    expect(state.updates).toHaveLength(2);
    expect(state.updates[0].patch).toEqual({ bookedByName: 'שיעור – דנה', notes: 'שיעור – דנה' });
    // trimmed
    expect(state.updates[1].patch).toEqual({ bookedByName: 'שיעור – יוסי', notes: 'שיעור – יוסי' });
  });

  it('skips events that are gone or have no title (idempotent/safe)', async () => {
    state.backfillRows = [
      { id: 'l1', googleEventId: 'gone' },
      { id: 'l2', googleEventId: 'blank' },
    ];
    mocks.getEvent.mockImplementation(async (id: string) =>
      id === 'gone' ? null : { summary: '   ' },
    );

    const res = await backfillImportedTitles();

    expect(res.ok).toBe(true);
    expect(res.scanned).toBe(2);
    expect(res.updated).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when not authenticated as owner', async () => {
    mocks.authed.value = false;
    const res = await backfillImportedTitles();
    expect(res).toEqual({ ok: false, error: 'אין הרשאה' });
    expect(mocks.getEvent).not.toHaveBeenCalled();
  });
});
