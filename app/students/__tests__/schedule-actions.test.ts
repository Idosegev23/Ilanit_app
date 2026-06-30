import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the ADMIN scheduling server actions in app/students/actions.ts:
//   scheduleStudentLesson  — one-off confirmed lesson + immediate calendar event
//   scheduleStudentSeries  — weekly confirmed series (delegates to createSeries)
//   checkSlotConflictAction — advisory double-booking warning (never blocks)
//
// All cross-module deps are mocked so we assert exactly WHAT the actions persist
// and call, not real DB/calendar behaviour. parseILDateTime stays REAL so the
// Asia/Jerusalem wall-clock → UTC conversion (and ends_at math) is exercised.

// ── In-memory lessons store + Drizzle chain mock ─────────────────────────────
type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ lessons: [] as Row[] }));
let idSeq = 0;

vi.mock('@/lib/db', () => ({
  db: {
    insert: (_t: unknown) => ({
      values: (vals: Row) => ({
        returning: () => {
          idSeq += 1;
          const row: Row = { id: `lesson-${idSeq}`, ...vals };
          store.lessons.push(row);
          return Promise.resolve([{ ...row }]);
        },
      }),
    }),
    update: (_t: unknown) => ({
      set: (patch: Row) => ({
        where: (pred: (r: Row) => boolean) => {
          for (const r of store.lessons.filter((r) => pred(r))) Object.assign(r, patch);
          return Promise.resolve([]);
        },
      }),
    }),
  },
}));

vi.mock('@/db/schema', () => {
  const col = (k: string) => ({ __k: k });
  return { lessons: { __t: 'lessons', id: col('id') } };
});

vi.mock('drizzle-orm', () => ({
  eq: (col: { __k: string }, val: unknown) => (r: Row) => r[col.__k] === val,
}));

// Owner gate — authenticated by default; flipped off in the auth test.
const authed = vi.hoisted(() => ({ value: true }));
vi.mock('@/auth', () => ({
  auth: async () => (authed.value ? { user: { email: 'ilanit@example.com' } } : null),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// Student lookup — returns the fixture student unless cleared.
const studentFixture = vi.hoisted(() => ({
  value: {
    id: 'stud-1',
    name: 'דנה',
    phone: '+972500000001',
    email: 'dana@example.com',
    defaultPrice: 150,
    defaultDurationMin: 60,
  } as Row | null,
}));
vi.mock('@/lib/students', () => ({
  getStudent: async (id: string) =>
    studentFixture.value && studentFixture.value.id === id ? studentFixture.value : null,
  // unused by these actions but imported by the module:
  createStudent: async () => ({}),
  updateStudent: async () => ({}),
  findStudentByPhone: async () => null,
}));

vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({
    locationAddress: 'רחוב הברוש 12, חיפה',
    defaultDurationMin: 60,
    defaultPrivatePrice: 120,
    bookingHorizonDays: 14,
  }),
}));

// Calendar insert — records the input so we can assert the event was created.
const insertEvent = vi.hoisted(() => vi.fn(async (_e: unknown) => ({ id: 'gcal-1' })));
vi.mock('@/lib/google-calendar', () => ({
  insertEvent: (e: unknown) => insertEvent(e),
}));

// Conflict helper + recurrence — controllable per test.
const hasSlotConflict = vi.hoisted(() => vi.fn(async (_s?: string, _e?: string) => false));
vi.mock('@/lib/availability', () => ({
  hasSlotConflict: (...a: unknown[]) => hasSlotConflict(...(a as [string, string])),
}));

const createSeries = vi.hoisted(() => vi.fn(async (_input?: unknown) => ({ count: 3 })));
vi.mock('@/lib/recurrence', () => ({
  createSeries: (input: unknown) => createSeries(input),
}));

// Schedule confirmations route through notifyStudent — stub it so no WhatsApp.
const notifyStudent = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ ok: true })));
vi.mock('@/lib/notifications/dispatch', () => ({
  notifyStudent: (...a: unknown[]) => notifyStudent(...a),
}));

import {
  scheduleStudentLesson,
  scheduleStudentSeries,
  checkSlotConflictAction,
} from '@/app/students/actions';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  store.lessons = [];
  idSeq = 0;
  authed.value = true;
  studentFixture.value = {
    id: 'stud-1',
    name: 'דנה',
    phone: '+972500000001',
    email: 'dana@example.com',
    defaultPrice: 150,
    defaultDurationMin: 60,
  };
  insertEvent.mockClear();
  hasSlotConflict.mockReset();
  hasSlotConflict.mockResolvedValue(false);
  createSeries.mockReset();
  createSeries.mockResolvedValue({ count: 3 });
});

describe('scheduleStudentLesson — one-off admin lesson', () => {
  it('creates ONE confirmed lesson and inserts the calendar event immediately', async () => {
    const res = await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }),
    );
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(store.lessons).toHaveLength(1);

    const lesson = store.lessons[0];
    expect(lesson.status).toBe('confirmed');
    expect(lesson.source).toBe('manual');
    expect(lesson.type).toBe('individual');
    expect(lesson.needsMatch).toBe(false);
    expect(lesson.studentId).toBe('stud-1');
    expect(lesson.confirmedAt).toBeInstanceOf(Date);
    // 17:00 Asia/Jerusalem on 2026-06-10 (UTC+3) = 14:00Z.
    expect((lesson.startsAt as Date).toISOString()).toBe('2026-06-10T14:00:00.000Z');
    // default duration 60min → ends 15:00Z.
    expect((lesson.endsAt as Date).toISOString()).toBe('2026-06-10T15:00:00.000Z');

    expect(insertEvent).toHaveBeenCalledTimes(1);
    const evt = insertEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(evt.summary).toBe('שיעור – דנה');
    expect(evt.attendeeEmail).toBe('dana@example.com');
    expect(evt.location).toBe('רחוב הברוש 12, חיפה');
    // Lesson is patched with the returned google event id.
    expect(lesson.googleEventId).toBe('gcal-1');
  });

  it('snapshots the student default price when no override is given', async () => {
    await scheduleStudentLesson(fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }));
    expect(store.lessons[0].price).toBe(150);
  });

  it('honours an explicit integer-shekel price override', async () => {
    await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00', price: '200' }),
    );
    expect(store.lessons[0].price).toBe(200);
  });

  it('falls back to the settings default price when the student has none', async () => {
    studentFixture.value = {
      id: 'stud-1',
      name: 'דנה',
      phone: '+972500000001',
      email: null,
      defaultPrice: null,
      defaultDurationMin: 45,
    };
    await scheduleStudentLesson(fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }));
    expect(store.lessons[0].price).toBe(120); // settings.defaultPrivatePrice
    // student's own duration wins → 45min.
    const l = store.lessons[0];
    const diff = (l.endsAt as Date).getTime() - (l.startsAt as Date).getTime();
    expect(diff).toBe(45 * 60 * 1000);
  });

  it('rejects a negative price override', async () => {
    const res = await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00', price: '-10' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/מחיר/);
    expect(store.lessons).toHaveLength(0);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it('coerces a decimal price to an integer shekel amount', async () => {
    // The shared optionalIntShekels parser sanitizes a typed decimal to digits
    // (the field is step=1, so true fractions cannot realistically arrive).
    await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00', price: '200.0' }),
    );
    expect(Number.isInteger(store.lessons[0].price)).toBe(true);
  });

  it('creates the lesson even when the slot conflicts (admin override)', async () => {
    hasSlotConflict.mockResolvedValue(true);
    const res = await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }),
    );
    // The action itself does not gate on conflicts — the warning is advisory in
    // checkSlotConflictAction. So the lesson is still created.
    expect(res.ok).toBe(true);
    expect(store.lessons).toHaveLength(1);
  });

  it('requires date and time', async () => {
    const noDate = await scheduleStudentLesson(fd({ studentId: 'stud-1', time: '17:00' }));
    expect(noDate.ok).toBe(false);
    const noTime = await scheduleStudentLesson(fd({ studentId: 'stud-1', date: '2026-06-10' }));
    expect(noTime.ok).toBe(false);
    expect(store.lessons).toHaveLength(0);
  });

  it('fails when the student is not found', async () => {
    studentFixture.value = null;
    const res = await scheduleStudentLesson(
      fd({ studentId: 'ghost', date: '2026-06-10', time: '17:00' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/לא נמצא/);
  });

  it('rejects when not authenticated as owner', async () => {
    authed.value = false;
    const res = await scheduleStudentLesson(
      fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/הרשאה/);
    expect(store.lessons).toHaveLength(0);
  });
});

describe('scheduleStudentSeries — weekly admin series', () => {
  it('delegates to createSeries with the right input and reports the count', async () => {
    const res = await scheduleStudentSeries(
      fd({ studentId: 'stud-1', weekday: '3', time: '17:00', durationMin: '45', horizonDays: '21' }),
    );
    expect(res.ok).toBe(true);
    expect(res.count).toBe(3);
    expect(createSeries).toHaveBeenCalledTimes(1);
    const input = createSeries.mock.calls[0][0] as Record<string, unknown>;
    expect(input.kind).toBe('individual');
    expect(input.studentId).toBe('stud-1');
    expect(input.weekday).toBe(3);
    expect(input.startTime).toBe('17:00');
    expect(input.durationMin).toBe(45);
    expect(input.horizonDays).toBe(21);
  });

  it('derives the weekday from a chosen start date when no weekday field is sent', async () => {
    // 2026-06-10 is a Wednesday → weekday 3.
    await scheduleStudentSeries(fd({ studentId: 'stud-1', date: '2026-06-10', time: '17:00' }));
    const input = createSeries.mock.calls[0][0] as Record<string, unknown>;
    expect(input.weekday).toBe(3);
  });

  it('passes a price override through and omits it otherwise', async () => {
    await scheduleStudentSeries(
      fd({ studentId: 'stud-1', weekday: '3', time: '17:00', price: '200' }),
    );
    expect((createSeries.mock.calls[0][0] as Record<string, unknown>).price).toBe(200);

    createSeries.mockClear();
    await scheduleStudentSeries(fd({ studentId: 'stud-1', weekday: '3', time: '17:00' }));
    expect((createSeries.mock.calls[0][0] as Record<string, unknown>).price).toBeUndefined();
  });

  it('reports a soft notice (ok, count 0) when the horizon yields nothing', async () => {
    createSeries.mockResolvedValue({ count: 0 });
    const res = await scheduleStudentSeries(
      fd({ studentId: 'stud-1', weekday: '3', time: '17:00' }),
    );
    expect(res.ok).toBe(true);
    expect(res.count).toBe(0);
    expect(res.error).toBeTruthy();
  });

  it('requires a time', async () => {
    const res = await scheduleStudentSeries(fd({ studentId: 'stud-1', weekday: '3' }));
    expect(res.ok).toBe(false);
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('rejects when not authenticated as owner', async () => {
    authed.value = false;
    const res = await scheduleStudentSeries(fd({ studentId: 'stud-1', weekday: '3', time: '17:00' }));
    expect(res.ok).toBe(false);
    expect(createSeries).not.toHaveBeenCalled();
  });
});

describe('checkSlotConflictAction — advisory warning', () => {
  it('reports a conflict when the slot overlaps', async () => {
    hasSlotConflict.mockResolvedValue(true);
    const res = await checkSlotConflictAction('2026-06-10', '17:00', 60);
    expect(res.conflict).toBe(true);
    // The slot end is computed from the duration: 17:00→18:00 IL.
    const [startISO, endISO] = hasSlotConflict.mock.calls[0] as [string, string];
    expect(startISO).toBe('2026-06-10T14:00:00.000Z');
    expect(endISO).toBe('2026-06-10T15:00:00.000Z');
  });

  it('reports no conflict for a free slot', async () => {
    hasSlotConflict.mockResolvedValue(false);
    const res = await checkSlotConflictAction('2026-06-10', '17:00', 60);
    expect(res.conflict).toBe(false);
  });

  it('returns no-conflict (and does not throw) when date/time are blank', async () => {
    const res = await checkSlotConflictAction('', '', 60);
    expect(res.conflict).toBe(false);
    expect(hasSlotConflict).not.toHaveBeenCalled();
  });
});
