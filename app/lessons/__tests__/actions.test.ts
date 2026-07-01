import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the /lessons server actions added for the calendar-import refinement:
//   - assignStudentToLesson: owner-only bind of a needs_match lesson
//   - backfillImportedTitles: owner-only title backfill from Google Calendar
// The db, auth, students, google-calendar and next/cache are mocked.

const state = vi.hoisted(() => ({
  lesson: null as null | Record<string, unknown>,
  student: null as null | { id: string; defaultPrice: number | null },
  backfillRows: [] as Array<{ id: string; googleEventId: string | null }>,
  // Pending calendar_import needs_match lessons for aiResolveImports.
  pendingImports: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: unknown; patch: Record<string, unknown> }>,
}));

const mocks = vi.hoisted(() => ({
  authed: { value: true },
  getStudent: vi.fn(async () => state.student),
  getEvent: vi.fn(async (_id: string) => null as null | { summary: string }),
  parseLessonTitle: vi.fn(),
  findOrCreateStudentByName: vi.fn(),
  getSettings: vi.fn(async () => ({ defaultPrivatePrice: null as number | null })),
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
vi.mock('@/db/schema', () => ({
  lessons: {
    __t: 'lessons',
    id: { __c: 'id' },
    source: { __c: 'source' },
    needsMatch: { __c: 'needsMatch' },
    studentId: { __c: 'studentId' },
    bookedByName: { __c: 'bookedByName' },
    googleEventId: { __c: 'googleEventId' },
  },
}));
vi.mock('@/lib/students', () => ({
  getStudent: mocks.getStudent,
  findStudentByPhone: vi.fn(),
  createStudent: vi.fn(),
  findOrCreateStudentByName: (...a: unknown[]) => mocks.findOrCreateStudentByName(...a),
}));
vi.mock('@/lib/settings', () => ({ getSettings: () => mocks.getSettings() }));
vi.mock('@/lib/recurrence', () => ({ cancelOne: vi.fn(), createSeries: vi.fn() }));
vi.mock('@/lib/google-calendar', () => ({
  insertEvent: vi.fn(),
  getEvent: (id: string) => mocks.getEvent(id),
}));
vi.mock('@/lib/ai/parse-lesson', () => ({
  parseLessonTitle: (...a: unknown[]) => mocks.parseLessonTitle(...a),
}));
vi.mock('@/lib/notifications/dispatch', () => ({
  notifyStudent: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/availability/cancel', () => ({
  createCancelUrl: vi.fn(async () => 'https://ilanit.test/c/tok'),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      // The actions issue different selects:
      //   assign:      select().from().where().limit()  → [lesson] | []
      //   backfill:    select().from().where()  (awaited) → backfillRows
      //   aiResolve:   select().from().where()  (awaited) → pendingImports
      // So .where() returns a thenable that ALSO exposes .limit(). The awaited
      // path returns backfillRows ∪ pendingImports — each suite uses only one.
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = () => ({
        limit: () => Promise.resolve(state.lesson ? [state.lesson] : []),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            state.pendingImports.length > 0 ? state.pendingImports : state.backfillRows,
          ),
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

import {
  assignStudentToLesson,
  backfillImportedTitles,
  aiResolveImports,
  markLessonNotALesson,
} from '@/app/lessons/actions';

beforeEach(() => {
  mocks.authed.value = true;
  mocks.getStudent.mockClear();
  mocks.getEvent.mockReset();
  mocks.getEvent.mockResolvedValue(null);
  mocks.parseLessonTitle.mockReset();
  mocks.findOrCreateStudentByName.mockReset();
  mocks.getSettings.mockReset();
  mocks.getSettings.mockResolvedValue({ defaultPrivatePrice: null });
  state.lesson = null;
  state.student = null;
  state.backfillRows = [];
  state.pendingImports = [];
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

describe('aiResolveImports', () => {
  it('parses a title, creates a student, assigns the lesson and snapshots price', async () => {
    state.pendingImports = [
      { id: 'l1', bookedByName: 'אמילי אירנה אנגלית', price: null },
    ];
    mocks.parseLessonTitle.mockResolvedValue({
      isLesson: true,
      studentName: 'אמילי אירנה',
      subject: 'אנגלית',
    });
    mocks.findOrCreateStudentByName.mockResolvedValue({
      student: { id: 's-emily', defaultPrice: 150 },
      created: true,
    });

    const res = await aiResolveImports();

    expect(res).toMatchObject({
      ok: true,
      assigned: 1,
      createdStudents: 1,
      skippedNonLesson: 0,
      errors: 0,
    });
    expect(mocks.findOrCreateStudentByName).toHaveBeenCalledWith('אמילי אירנה', 'אנגלית');
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({
      studentId: 's-emily',
      needsMatch: false,
      notes: 'אנגלית',
      price: 150, // snapshot from student.defaultPrice
    });
  });

  it('falls back to settings.defaultPrivatePrice when the student has no default', async () => {
    state.pendingImports = [{ id: 'l1', bookedByName: 'רפאל כיתה ד', price: null }];
    mocks.getSettings.mockResolvedValue({ defaultPrivatePrice: 90 });
    mocks.parseLessonTitle.mockResolvedValue({
      isLesson: true,
      studentName: 'רפאל',
      subject: 'כיתה ד',
    });
    mocks.findOrCreateStudentByName.mockResolvedValue({
      student: { id: 's-rafa', defaultPrice: null },
      created: false,
    });

    const res = await aiResolveImports();

    expect(res.assigned).toBe(1);
    expect(res.createdStudents).toBe(0);
    expect(state.updates[0].patch).toMatchObject({ studentId: 's-rafa', price: 90 });
  });

  it('does not overwrite an existing lesson price', async () => {
    state.pendingImports = [{ id: 'l1', bookedByName: 'דנה מתמטיקה', price: 200 }];
    mocks.parseLessonTitle.mockResolvedValue({
      isLesson: true,
      studentName: 'דנה',
      subject: 'מתמטיקה',
    });
    mocks.findOrCreateStudentByName.mockResolvedValue({
      student: { id: 's-dana', defaultPrice: 130 },
      created: false,
    });

    await aiResolveImports();

    expect(state.updates[0].patch).not.toHaveProperty('price');
    expect(state.updates[0].patch).toMatchObject({ studentId: 's-dana', notes: 'מתמטיקה' });
  });

  it('cancels a Preply title without calling the parser', async () => {
    state.pendingImports = [
      { id: 'l1', bookedByName: 'Preply lesson - Alexa F.', price: null },
    ];

    const res = await aiResolveImports();

    expect(res).toMatchObject({ ok: true, assigned: 0, skippedNonLesson: 1 });
    expect(mocks.parseLessonTitle).not.toHaveBeenCalled();
    expect(state.updates[0].patch).toMatchObject({ status: 'cancelled', needsMatch: false });
  });

  it('cancels a non-lesson (personal event) parsed by the AI', async () => {
    state.pendingImports = [{ id: 'l1', bookedByName: 'מסיבת סיום', price: null }];
    mocks.parseLessonTitle.mockResolvedValue({
      isLesson: false,
      studentName: null,
      subject: null,
    });

    const res = await aiResolveImports();

    expect(res).toMatchObject({ ok: true, assigned: 0, skippedNonLesson: 1, createdStudents: 0 });
    expect(state.updates[0].patch).toMatchObject({ status: 'cancelled', needsMatch: false });
    expect(mocks.findOrCreateStudentByName).not.toHaveBeenCalled();
  });

  it('counts an error and continues the batch when one title throws', async () => {
    state.pendingImports = [
      { id: 'l1', bookedByName: 'שובר', price: null },
      { id: 'l2', bookedByName: 'נועה אנגלית', price: null },
    ];
    mocks.parseLessonTitle.mockImplementation(async (title: string) => {
      if (title === 'שובר') throw new Error('rate limit');
      return { isLesson: true, studentName: 'נועה', subject: 'אנגלית' };
    });
    mocks.findOrCreateStudentByName.mockResolvedValue({
      student: { id: 's-noa', defaultPrice: 110 },
      created: true,
    });

    const res = await aiResolveImports();

    expect(res.errors).toBe(1);
    expect(res.assigned).toBe(1);
    expect(res.createdStudents).toBe(1);
    // l2 still assigned despite l1's failure
    expect(state.updates.some((u) => u.patch.studentId === 's-noa')).toBe(true);
  });

  it('rejects when not authenticated as owner', async () => {
    mocks.authed.value = false;
    const res = await aiResolveImports();
    expect(res).toEqual({ ok: false, error: 'אין הרשאה' });
    expect(mocks.parseLessonTitle).not.toHaveBeenCalled();
  });
});

describe('markLessonNotALesson', () => {
  it('cancels the lesson and clears needs_match so it stops holding a slot', async () => {
    state.lesson = { id: 'l1', needsMatch: true, status: 'pending' };

    const res = await markLessonNotALesson('l1');

    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    // cancelled lessons are excluded from availability busyIntervals (only
    // pending/confirmed count), so this frees the slot. needsMatch is cleared.
    expect(state.updates[0].patch).toMatchObject({
      status: 'cancelled',
      needsMatch: false,
      cancelReason: 'not_a_lesson',
    });
    expect(state.updates[0].patch).toHaveProperty('cancelledAt');
  });

  it('works for an already-confirmed lesson too', async () => {
    state.lesson = { id: 'l2', needsMatch: false, status: 'confirmed' };
    const res = await markLessonNotALesson('l2');
    expect(res.ok).toBe(true);
    expect(state.updates[0].patch).toMatchObject({ status: 'cancelled', needsMatch: false });
  });

  it('returns an error when the lesson is missing (no update issued)', async () => {
    state.lesson = null;
    const res = await markLessonNotALesson('nope');
    expect(res).toEqual({ ok: false, error: 'שיעור לא נמצא' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when not authenticated as owner', async () => {
    mocks.authed.value = false;
    const res = await markLessonNotALesson('l1');
    expect(res).toEqual({ ok: false, error: 'אין הרשאה' });
    expect(state.updates).toHaveLength(0);
  });
});
