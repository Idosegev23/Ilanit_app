import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Cross-module mocks ───────────────────────────────────────────────────────
const notify = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: (...a: unknown[]) => notify(...a),
}));

const createActionToken = vi.fn((..._a: unknown[]) => Promise.resolve('RAWTOKEN'));
vi.mock('@/lib/tokens', () => ({
  createActionToken: (...a: unknown[]) => createActionToken(...a),
}));

const listEndedSince = vi.fn();
vi.mock('@/lib/google-calendar', () => ({
  listEndedSince: (...a: unknown[]) => listEndedSince(...a),
}));

const getSettings = vi.fn(async () => ({
  locationAddress: 'רחוב הדקל 5',
  defaultDurationMin: 60,
}));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

vi.mock('@/lib/env', () => ({
  env: () => ({ ILANIT_PHONE: '972545886779', NEXT_PUBLIC_APP_URL: 'https://ilanit.example/' }),
}));

vi.mock('drizzle-orm', () => ({
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
}));

vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  payments: { __t: 'payments' },
  students: { __t: 'students' },
}));

// ── Fake DB ──────────────────────────────────────────────────────────────────
const selectResults: Record<string, unknown[][]> = {};
function queueSelect(table: string, rows: unknown[]) {
  (selectResults[table] ||= []).push(rows);
}
function nextSelect(table: string): unknown[] {
  const q = selectResults[table];
  return q && q.length ? (q.shift() as unknown[]) : [];
}

const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const updates: Array<{ table: string; set: Record<string, unknown> }> = [];
let insertSeq = 0;

function makeSelectBuilder() {
  let table = '';
  const b: Record<string, unknown> = {};
  const chain = (fn?: (a: unknown) => void) => (a?: unknown) => {
    if (fn) fn(a);
    return b;
  };
  b.from = chain((t) => {
    table = (t as { __t: string }).__t;
  });
  b.where = chain();
  b.limit = chain();
  b.orderBy = chain();
  b.then = (resolve: (v: unknown[]) => unknown) => resolve(nextSelect(table));
  return b;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectBuilder(),
    insert: (t: { __t: string }) => ({
      values: (values: Record<string, unknown>) => {
        // Drizzle's .values() is itself awaitable AND exposes .returning().
        const record = () => {
          const id = `ins-${++insertSeq}`;
          inserts.push({ table: t.__t, values });
          return [{ id, ...values }];
        };
        return {
          returning: async () => record(),
          then: (resolve: (v: unknown) => unknown) => resolve(record()),
        };
      },
    }),
    update: (t: { __t: string }) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table: t.__t, set });
          return undefined;
        },
      }),
    }),
  },
}));

import { runCalendarScan } from '@/lib/jobs/calendar-scan';

beforeEach(() => {
  notify.mockClear();
  createActionToken.mockClear();
  listEndedSince.mockReset();
  getSettings.mockClear();
  for (const k of Object.keys(selectResults)) delete selectResults[k];
  inserts.length = 0;
  updates.length = 0;
  insertSeq = 0;
});

describe('runCalendarScan', () => {
  it('completes a matched confirmed individual lesson, opens payment, mints token, asks Ilanit', async () => {
    listEndedSince.mockResolvedValue([
      { id: 'evt-1', summary: 'שיעור – דנה', endISO: '2026-06-02T15:00:00Z', type: 'individual' },
    ]);
    // existing lessons referencing these event ids
    queueSelect('lessons', [
      {
        id: 'l1',
        type: 'individual',
        status: 'confirmed',
        needsMatch: false,
        studentId: 's1',
        price: 120,
        startsAt: new Date('2026-06-02T14:00:00Z'),
        googleEventId: 'evt-1',
      },
    ]);
    // payment existence check (none yet)
    queueSelect('payments', []);
    // student name lookup
    queueSelect('students', [{ name: 'דנה' }]);

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.completed).toBe(1);
    expect(res.paymentPrompts).toBe(1);
    expect(res.needsMatchCreated).toBe(0);
    expect(res.groupSkipped).toBe(0);

    // lesson marked completed
    expect(updates.some((u) => u.table === 'lessons' && u.set.status === 'completed')).toBe(true);
    // due payment created with the snapshot price
    const pay = inserts.find((i) => i.table === 'payments');
    expect(pay?.values).toMatchObject({ lessonId: 'l1', status: 'due', amount: 120 });
    // payment token + Ilanit prompt
    expect(createActionToken).toHaveBeenCalledWith('payment', 'l1', expect.any(Number));
    const call = notify.mock.calls.find((c) => c[0] === 'payment_check_ilanit')!;
    expect(call[1]).toBe('972545886779');
    expect((call[2] as Record<string, unknown>).actionUrl).toBe('https://ilanit.example/p/RAWTOKEN');
    expect((call[2] as Record<string, unknown>).amount).toBe(120);
    expect(call[3]).toBe('payment_check:l1');
  });

  it('skips group sessions entirely', async () => {
    listEndedSince.mockResolvedValue([
      { id: 'evt-g', summary: 'קבוצה', endISO: '2026-06-02T15:00:00Z', type: 'group' },
    ]);
    queueSelect('lessons', []); // existing lookup

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.groupSkipped).toBe(1);
    expect(res.completed).toBe(0);
    expect(inserts).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('creates a needs_match lesson and asks Ilanit to assign when unmatched', async () => {
    listEndedSince.mockResolvedValue([
      { id: 'evt-x', summary: 'פגישה לא מזוהה', endISO: '2026-06-02T15:00:00Z' },
    ]);
    queueSelect('lessons', []); // no existing lesson references evt-x
    // resolveStudentByEmail: no email → not queried; createImportedLesson inserts

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.needsMatchCreated).toBe(1);
    expect(res.completed).toBe(0);

    const lessonInsert = inserts.find((i) => i.table === 'lessons');
    expect(lessonInsert?.values).toMatchObject({
      source: 'calendar_import',
      needsMatch: true,
      googleEventId: 'evt-x',
      // the event TITLE is stored so it renders in /lessons + powers the
      // in-app assign suggestion
      bookedByName: 'פגישה לא מזוהה',
      notes: 'פגישה לא מזוהה',
    });
    expect(createActionToken).toHaveBeenCalledWith('assign_student', expect.any(String), expect.any(Number));
    const call = notify.mock.calls.find((c) => c[0] === 'assign_student_ilanit')!;
    expect((call[2] as Record<string, unknown>).actionUrl).toBe('https://ilanit.example/m/RAWTOKEN');
  });

  it('stores the event title on a matched-by-email imported lesson', async () => {
    listEndedSince.mockResolvedValue([
      {
        id: 'evt-mail',
        summary: 'שיעור פסנתר – נועה',
        endISO: '2026-06-02T15:00:00Z',
        type: 'individual',
        attendeeEmail: 'noa@example.com',
      },
    ]);
    queueSelect('lessons', []); // no existing lesson references evt-mail
    // resolveStudentByEmail finds a student
    queueSelect('students', [{ id: 's-noa' }]);
    // completeAndPrompt: payment existence check (none) + student name lookup
    queueSelect('payments', []);
    queueSelect('students', [{ name: 'נועה' }]);

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.completed).toBe(1);
    const lessonInsert = inserts.find((i) => i.table === 'lessons');
    expect(lessonInsert?.values).toMatchObject({
      source: 'calendar_import',
      needsMatch: false,
      studentId: 's-noa',
      bookedByName: 'שיעור פסנתר – נועה',
      notes: 'שיעור פסנתר – נועה',
    });
  });

  it('does not re-complete a lesson already marked completed (idempotent)', async () => {
    listEndedSince.mockResolvedValue([
      { id: 'evt-1', summary: 'שיעור', endISO: '2026-06-02T15:00:00Z', type: 'individual' },
    ]);
    queueSelect('lessons', [
      {
        id: 'l1',
        type: 'individual',
        status: 'completed',
        needsMatch: false,
        studentId: 's1',
        price: 120,
        startsAt: new Date(),
        googleEventId: 'evt-1',
      },
    ]);

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.completed).toBe(0);
    expect(res.paymentPrompts).toBe(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns zeros when no events ended', async () => {
    listEndedSince.mockResolvedValue([]);
    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');
    expect(res).toEqual({
      completed: 0,
      paymentPrompts: 0,
      needsMatchCreated: 0,
      groupSkipped: 0,
      nonTeachingSkipped: 0,
    });
    expect(listEndedSince).toHaveBeenCalledWith('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');
  });

  it('skips Preply events without importing or prompting', async () => {
    listEndedSince.mockResolvedValue([
      {
        id: 'evt-preply',
        summary: 'Preply lesson - Alexa F.',
        endISO: '2026-06-02T15:00:00Z',
        type: 'individual',
      },
    ]);
    queueSelect('lessons', []); // no existing lesson references it

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.nonTeachingSkipped).toBe(1);
    expect(res.needsMatchCreated).toBe(0);
    expect(inserts).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips Preply detected via the location field', async () => {
    listEndedSince.mockResolvedValue([
      {
        id: 'evt-loc',
        summary: 'שיעור אונליין',
        location: 'Preply',
        endISO: '2026-06-02T15:00:00Z',
      },
    ]);
    queueSelect('lessons', []);

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.nonTeachingSkipped).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips all-day marker events', async () => {
    listEndedSince.mockResolvedValue([
      {
        id: 'evt-allday',
        summary: 'מסיבת סיום כיתה ו',
        endISO: '2026-06-02T15:00:00Z',
        allDay: true,
      },
    ]);
    queueSelect('lessons', []);

    const res = await runCalendarScan('2026-06-02T13:30:00Z', '2026-06-02T16:00:00Z');

    expect(res.nonTeachingSkipped).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
