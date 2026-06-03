import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake DB modelling the exact Drizzle chains lib/recurrence uses:
//   select().from(table).where(pred?).limit(n?)
//   insert(table).values(vals).returning()
//   update(table).set(patch).where(pred)
// Tables are identified by a tag object; predicates are plain row functions
// produced by the mocked drizzle-orm operators below.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Table = { __t: string };

const store: Record<string, Row[]> = {
  recurrences: [],
  lessons: [],
  groups: [],
};

let idSeq = 0;
function genId(prefix: string) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

vi.mock('@/lib/db', () => {
  function tableName(t: Table) {
    return t.__t;
  }
  return {
    db: {
      select: (_proj?: unknown) => ({
        from: (t: Table) => {
          const name = tableName(t);
          const build = (pred: ((r: Row) => boolean) | null) => ({
            where: (p: (r: Row) => boolean) => build(p),
            limit: (_n: number) =>
              Promise.resolve(
                store[name].filter((r) => (pred ? pred(r) : true)).slice(0, _n),
              ),
            then: (resolve: (rows: Row[]) => unknown) =>
              resolve(store[name].filter((r) => (pred ? pred(r) : true))),
          });
          return build(null);
        },
      }),
      insert: (t: Table) => {
        const name = tableName(t);
        return {
          values: (vals: Row | Row[]) => {
            const arr = Array.isArray(vals) ? vals : [vals];
            const inserted = arr.map((v) => {
              const idPrefix = name === 'recurrences' ? 'rec' : name.slice(0, 3);
              const row: Row = { id: v.id ?? genId(idPrefix), ...v };
              store[name].push(row);
              return row;
            });
            return {
              returning: () => Promise.resolve(inserted.map((r) => ({ ...r }))),
              then: (resolve: (v: unknown) => unknown) => resolve(undefined),
            };
          },
        };
      },
      update: (t: Table) => {
        const name = tableName(t);
        return {
          set: (patch: Row) => ({
            where: (pred: (r: Row) => boolean) => {
              const matched = store[name].filter((r) => pred(r));
              for (const r of matched) Object.assign(r, patch);
              return Promise.resolve(matched.map((r) => ({ ...r })));
            },
          }),
        };
      },
    },
  };
});

vi.mock('@/db/schema', () => {
  const col = (k: string) => ({ __k: k });
  return {
    recurrences: {
      __t: 'recurrences',
      id: col('id'),
      active: col('active'),
    },
    lessons: {
      __t: 'lessons',
      id: col('id'),
      recurrenceId: col('recurrenceId'),
      startsAt: col('startsAt'),
      status: col('status'),
      googleEventId: col('googleEventId'),
    },
    groups: {
      __t: 'groups',
      id: col('id'),
    },
  };
});

vi.mock('drizzle-orm', () => {
  const and =
    (...preds: Array<(r: Row) => boolean>) =>
    (r: Row) =>
      preds.every((p) => p(r));
  const eq = (col: { __k: string }, val: unknown) => (r: Row) => r[col.__k] === val;
  const gte = (col: { __k: string }, val: Date) => (r: Row) =>
    (r[col.__k] as Date).getTime() >= val.getTime();
  const inArray = (col: { __k: string }, vals: unknown[]) => (r: Row) =>
    vals.includes(r[col.__k]);
  return { and, eq, gte, inArray };
});

// Cross-module libs: mocked.
interface EventInputLike {
  summary: string;
  attendeeEmail?: string;
  extendedPrivate?: Record<string, string>;
}
const insertRecurringEvent = vi.fn(
  async (_e: EventInputLike, _rrule: string) => ({ id: 'gcal-recurring-1' }),
);
const cancelEvent = vi.fn(async (_eventId: string) => {});
vi.mock('@/lib/google-calendar', () => ({
  insertRecurringEvent: (e: EventInputLike, rrule: string) => insertRecurringEvent(e, rrule),
  cancelEvent: (eventId: string) => cancelEvent(eventId),
}));

const getStudent = vi.fn();
vi.mock('@/lib/students', () => ({
  getStudent: (...a: unknown[]) => getStudent(...a),
}));

const getSettings = vi.fn();
vi.mock('@/lib/settings', () => ({
  getSettings: () => getSettings(),
}));

// Use a fixed "now" so occurrence generation is deterministic.
// Reference instant: Mon 2026-06-01 09:00 Asia/Jerusalem (UTC+3) = 06:00Z.
const FIXED_NOW = new Date('2026-06-01T06:00:00.000Z');
// Mutable so individual tests (e.g. the DST regression below) can move "now"
// across a DST transition; reset to FIXED_NOW in the top-level beforeEach.
let mockNow: Date = FIXED_NOW;
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => mockNow };
});

import { createSeries, cancelSeries, cancelOne } from '@/lib/recurrence';

beforeEach(() => {
  store.recurrences = [];
  store.lessons = [];
  store.groups = [];
  mockNow = FIXED_NOW;
  idSeq = 0;
  insertRecurringEvent.mockClear();
  cancelEvent.mockClear();
  getStudent.mockReset();
  getSettings.mockReset();
  getSettings.mockResolvedValue({
    locationAddress: 'רחוב הברוש 12, חיפה',
    defaultDurationMin: 60,
  });
});

describe('createSeries — individual', () => {
  beforeEach(() => {
    getStudent.mockResolvedValue({
      id: 'stud-1',
      name: 'דנה',
      email: 'dana@example.com',
      defaultPrice: 150,
    });
  });

  it('persists the recurrence template with the right kind/weekday/time', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3, // Wednesday
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 21,
    });
    expect(store.recurrences).toHaveLength(1);
    const rec = store.recurrences[0];
    expect(rec.kind).toBe('individual');
    expect(rec.studentId).toBe('stud-1');
    expect(rec.groupId).toBeNull();
    expect(rec.weekday).toBe(3);
    expect(rec.startTime).toBe('17:00');
    expect(rec.active).toBe(true);
  });

  it('generates one confirmed lesson per matching weekday inside the horizon', async () => {
    // From 2026-06-01 (Mon) forward 21 days, Wednesdays: 06-03, 06-10, 06-17.
    const res = await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 21,
    });
    expect(res.count).toBe(3);
    expect(store.lessons).toHaveLength(3);
    for (const l of store.lessons) {
      expect(l.type).toBe('individual');
      expect(l.source).toBe('recurrence');
      expect(l.status).toBe('confirmed');
      expect(l.needsMatch).toBe(false);
      expect(l.studentId).toBe('stud-1');
      expect(l.recurrenceId).toBe(store.recurrences[0].id);
      expect(l.googleEventId).toBe('gcal-recurring-1');
    }
  });

  it('snapshots the student default price when no override is given', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 7,
    });
    expect(store.lessons.every((l) => l.price === 150)).toBe(true);
  });

  it('honours an explicit price override', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 7,
      price: 200,
    });
    expect(store.lessons.every((l) => l.price === 200)).toBe(true);
  });

  it('sets ends_at = starts_at + durationMin', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 45,
      horizonDays: 7,
    });
    const l = store.lessons[0];
    const diff =
      (l.endsAt as Date).getTime() - (l.startsAt as Date).getTime();
    expect(diff).toBe(45 * 60 * 1000);
  });

  it('registers exactly one Google recurring event with a weekly RRULE + COUNT', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 21,
    });
    expect(insertRecurringEvent).toHaveBeenCalledTimes(1);
    const [eventInput, rrule] = insertRecurringEvent.mock.calls[0];
    expect(eventInput.summary).toContain('דנה');
    expect(eventInput.attendeeEmail).toBe('dana@example.com');
    expect(eventInput.extendedPrivate?.type).toBe('individual');
    expect(rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3');
  });

  it('skips an occurrence that already started earlier today', async () => {
    // Monday 2026-06-01: now is 09:00 IL. A 08:00 Monday slot is in the past.
    const res = await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 1, // Monday
      startTime: '08:00',
      durationMin: 60,
      horizonDays: 7,
    });
    // Mondays in window: 06-01 (skipped, past), 06-08 → 1 lesson.
    expect(res.count).toBe(1);
    expect((store.lessons[0].startsAt as Date).toISOString()).toBe(
      '2026-06-08T05:00:00.000Z',
    );
  });

  it('throws when studentId is missing for an individual series', async () => {
    await expect(
      createSeries({
        kind: 'individual',
        weekday: 3,
        startTime: '17:00',
        durationMin: 60,
        horizonDays: 7,
      }),
    ).rejects.toThrow(/studentId/);
  });

  it('throws on an invalid weekday', async () => {
    await expect(
      createSeries({
        kind: 'individual',
        studentId: 'stud-1',
        weekday: 9,
        startTime: '17:00',
        durationMin: 60,
        horizonDays: 7,
      }),
    ).rejects.toThrow(/weekday/);
  });

  it('throws on an invalid startTime', async () => {
    await expect(
      createSeries({
        kind: 'individual',
        studentId: 'stud-1',
        weekday: 3,
        startTime: '25:99',
        durationMin: 60,
        horizonDays: 7,
      }),
    ).rejects.toThrow(/startTime/);
  });
});

describe('createSeries — group', () => {
  beforeEach(() => {
    store.groups.push({
      id: 'grp-1',
      name: 'אנגלית מתחילים',
      monthlyPrice: 400,
      location: 'מרכז קהילתי, תל אביב',
    });
  });

  it('generates group_session lessons linked to the group', async () => {
    const res = await createSeries({
      kind: 'group',
      groupId: 'grp-1',
      weekday: 4, // Thursday
      startTime: '18:30',
      durationMin: 90,
      horizonDays: 21,
    });
    // Thursdays from 2026-06-01 forward 21 days: 06-04, 06-11, 06-18.
    expect(res.count).toBe(3);
    for (const l of store.lessons) {
      expect(l.type).toBe('group_session');
      expect(l.groupId).toBe('grp-1');
      expect(l.studentId).toBeNull();
      expect(l.location).toBe('מרכז קהילתי, תל אביב');
    }
  });

  it('marks the recurring event extendedPrivate.type as group', async () => {
    await createSeries({
      kind: 'group',
      groupId: 'grp-1',
      weekday: 4,
      startTime: '18:30',
      durationMin: 90,
      horizonDays: 7,
    });
    const [eventInput] = insertRecurringEvent.mock.calls[0];
    expect(eventInput.extendedPrivate?.type).toBe('group');
    expect(eventInput.extendedPrivate?.groupId).toBe('grp-1');
  });

  it('throws when groupId is missing for a group series', async () => {
    await expect(
      createSeries({
        kind: 'group',
        weekday: 4,
        startTime: '18:30',
        durationMin: 90,
        horizonDays: 7,
      }),
    ).rejects.toThrow(/groupId/);
  });
});

describe('createSeries — DST boundary (Asia/Jerusalem fall-back 2026-10-25)', () => {
  beforeEach(() => {
    // now = Mon 2026-10-12 ~09:00 IL (UTC+3), well before the late-October
    // fall-back so the horizon spans the 2026-10-25 transition (UTC+3 → UTC+2).
    mockNow = new Date('2026-10-12T06:00:00.000Z');
    getStudent.mockResolvedValue({
      id: 'stud-1',
      name: 'דנה',
      email: 'dana@example.com',
      defaultPrice: 150,
    });
  });

  it('enumerates each Sunday exactly once across the DST transition (no duplicate 2026-10-25)', async () => {
    // Sundays in [2026-10-12 .. +28d]: 10-18, 10-25, 11-01, 11-08.
    // The pre-transition wall-clock offset is +3 (10-18 → 07:00Z); from 10-25
    // onward it is +2 (08:00Z). A fixed-24h day cursor would land on 10-25
    // twice and emit a duplicate 10-25T08:00Z lesson + inflated RRULE COUNT.
    const res = await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 0, // Sunday
      startTime: '10:00',
      durationMin: 60,
      horizonDays: 28,
    });

    expect(res.count).toBe(4);
    expect(store.lessons).toHaveLength(4);

    const isos = store.lessons
      .map((l) => (l.startsAt as Date).toISOString())
      .sort();
    expect(isos).toEqual([
      '2026-10-18T07:00:00.000Z', // pre fall-back (UTC+3)
      '2026-10-25T08:00:00.000Z', // transition day (now UTC+2) — exactly once
      '2026-11-01T08:00:00.000Z',
      '2026-11-08T08:00:00.000Z',
    ]);

    // No two lessons share the same start instant.
    expect(new Set(isos).size).toBe(isos.length);
  });

  it('RRULE COUNT matches the distinct occurrence count (not inflated by DST)', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 0,
      startTime: '10:00',
      durationMin: 60,
      horizonDays: 28,
    });
    const [, rrule] = insertRecurringEvent.mock.calls[0];
    expect(rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=4');
  });
});

describe('createSeries — integer-shekel price guard', () => {
  beforeEach(() => {
    getStudent.mockResolvedValue({
      id: 'stud-1',
      name: 'דנה',
      email: null,
      defaultPrice: 150,
    });
  });

  it('rejects a fractional price override', async () => {
    await expect(
      createSeries({
        kind: 'individual',
        studentId: 'stud-1',
        weekday: 3,
        startTime: '17:00',
        durationMin: 60,
        horizonDays: 7,
        price: 120.5,
      }),
    ).rejects.toThrow(/price/);
  });

  it('rejects a negative price override', async () => {
    await expect(
      createSeries({
        kind: 'individual',
        studentId: 'stud-1',
        weekday: 3,
        startTime: '17:00',
        durationMin: 60,
        horizonDays: 7,
        price: -10,
      }),
    ).rejects.toThrow(/price/);
  });
});

describe('cancelSeries', () => {
  beforeEach(() => {
    getStudent.mockResolvedValue({
      id: 'stud-1',
      name: 'דנה',
      email: null,
      defaultPrice: 150,
    });
  });

  it('deactivates the recurrence and cancels all future lessons in the series', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 21,
    });
    const recId = store.recurrences[0].id as string;

    await cancelSeries(recId);

    expect(store.recurrences[0].active).toBe(false);
    for (const l of store.lessons) {
      expect(l.status).toBe('cancelled');
      expect(l.cancelReason).toBe('series_cancelled');
      expect(l.cancelledAt).toBeInstanceOf(Date);
    }
  });

  it('cancels the Google recurring event once', async () => {
    await createSeries({
      kind: 'individual',
      studentId: 'stud-1',
      weekday: 3,
      startTime: '17:00',
      durationMin: 60,
      horizonDays: 21,
    });
    const recId = store.recurrences[0].id as string;

    await cancelSeries(recId);

    expect(cancelEvent).toHaveBeenCalledTimes(1);
    expect(cancelEvent).toHaveBeenCalledWith('gcal-recurring-1');
  });

  it('leaves completed/past lessons untouched', async () => {
    // Seed a completed past lesson on the same recurrence.
    store.recurrences.push({ id: 'rec-x', active: true });
    store.lessons.push({
      id: 'lesson-past',
      recurrenceId: 'rec-x',
      startsAt: new Date('2026-05-01T14:00:00.000Z'),
      status: 'completed',
      googleEventId: 'gcal-x',
    });

    await cancelSeries('rec-x');

    expect(store.lessons[0].status).toBe('completed');
    // No future pending/confirmed lessons → no Google cancellation.
    expect(cancelEvent).not.toHaveBeenCalled();
  });
});

describe('cancelOne', () => {
  it('cancels a standalone lesson and removes its Google event', async () => {
    store.lessons.push({
      id: 'lesson-solo',
      recurrenceId: null,
      startsAt: new Date('2026-06-10T14:00:00.000Z'),
      status: 'confirmed',
      googleEventId: 'gcal-solo',
    });

    await cancelOne('lesson-solo');

    expect(store.lessons[0].status).toBe('cancelled');
    expect(store.lessons[0].cancelReason).toBe('cancelled');
    expect(cancelEvent).toHaveBeenCalledWith('gcal-solo');
  });

  it('cancels a recurring-series instance WITHOUT deleting the shared event', async () => {
    store.lessons.push({
      id: 'lesson-rec',
      recurrenceId: 'rec-9',
      startsAt: new Date('2026-06-10T14:00:00.000Z'),
      status: 'confirmed',
      googleEventId: 'gcal-recurring-9',
    });

    await cancelOne('lesson-rec');

    expect(store.lessons[0].status).toBe('cancelled');
    expect(cancelEvent).not.toHaveBeenCalled();
  });

  it('throws for an unknown lesson', async () => {
    await expect(cancelOne('nope')).rejects.toThrow(/lesson not found/);
  });
});
