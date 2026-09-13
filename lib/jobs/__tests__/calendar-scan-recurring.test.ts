import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  The bug this pins.

  createSeries registers ONE Google recurring event and stamps every occurrence
  of the series with that master id. listEndedSince asks for singleEvents, so
  Google hands back INSTANCES, whose ids are `<master>_<utc timestamp>`.

  The scan used to look the instance id up in a map keyed by stored event id.
  It never matched — so every recurring lesson that ended was re-imported as a
  brand-new `calendar_import` lesson with no price. That single fault produced
  all four symptoms Ilanit saw: phantom debts in her nightly note, ₪0 payment
  requests reaching parents, "התקבל תשלום של ₪0?" reaching her, and no
  "was it paid?" prompt at all for the real lesson, because the copy had been
  completed in its place.

  A map keyed by id alone cannot fix this: fourteen occurrences share one master
  id, and building a Map from them keeps only the last. The occurrence has to be
  identified by master + start.
*/

const state = vi.hoisted(() => ({
  events: [] as any[],
  lessons: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  notified: [] as any[],
}));

vi.mock('@/lib/google-calendar', () => ({
  listEndedSince: async () => state.events,
}));
vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({ locationAddress: 'עתניאל 10/2', defaultDurationMin: 60 }),
}));
vi.mock('@/lib/env', () => ({
  env: () => ({ ILANIT_PHONE: '972545886779', NEXT_PUBLIC_APP_URL: 'https://app.test' }),
}));
vi.mock('@/lib/tokens', () => ({ createActionToken: async () => 'tok' }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: async (template: string, to: string, vars: any) => {
    state.notified.push({ template, to, vars });
    return { ok: true };
  },
}));
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => new Date('2026-09-13T12:00:00Z') };
});
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  inArray: () => ({}),
}));
vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  payments: { __t: 'payments' },
  students: { __t: 'students' },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: (_c?: unknown) => ({
      from: (t: { __t?: string }) => {
        const rows = t?.__t === 'lessons' ? state.lessons : [];
        const chain: any = {
          where: () => chain,
          limit: async () => rows,
          then: (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res),
        };
        return chain;
      },
    }),
    insert: (t: { __t?: string }) => ({
      values: (v: any) => {
        state.inserted.push({ table: t?.__t, values: v });
        return { returning: async () => [{ id: 'new-lesson', ...v }] };
      },
    }),
    update: (t: { __t?: string }) => ({
      set: (v: any) => ({
        where: async () => {
          state.updates.push({ table: t?.__t, set: v });
        },
      }),
    }),
  },
}));

import { runCalendarScan } from '@/lib/jobs/calendar-scan';

const MASTER = 'osu9dveirb3phl5i8nm1q2pssc';

/** One occurrence of a weekly series, as createSeries stores it. */
function occurrence(startISO: string, over: Record<string, unknown> = {}) {
  return {
    id: `lesson-${startISO}`,
    googleEventId: MASTER, // every occurrence carries the MASTER id
    recurrenceId: 'rec-1',
    studentId: 'stu-1',
    type: 'individual',
    status: 'confirmed',
    needsMatch: false,
    price: 140,
    startsAt: new Date(startISO),
    endsAt: new Date(new Date(startISO).getTime() + 60 * 60_000),
    ...over,
  };
}

/** The instance Google returns for that occurrence. */
function instanceOf(startISO: string, over: Record<string, unknown> = {}) {
  const stamp = startISO.replace(/[-:]/g, '').replace('.000', '');
  return {
    id: `${MASTER}_${stamp}`,
    summary: 'שיעור – מילנה',
    startISO,
    endISO: new Date(new Date(startISO).getTime() + 60 * 60_000).toISOString(),
    type: 'individual',
    ...over,
  };
}

const importedLessons = () =>
  state.inserted.filter((i) => i.table === 'lessons' && i.values.source === 'calendar_import');

beforeEach(() => {
  state.events = [];
  state.lessons = [];
  state.inserted = [];
  state.updates = [];
  state.notified = [];
});

describe('runCalendarScan — a recurring instance belongs to its occurrence', () => {
  it('does NOT re-import an occurrence the app already owns', async () => {
    // Three weeks of one series, all sharing the master id.
    state.lessons = [
      occurrence('2026-09-06T11:30:00.000Z'),
      occurrence('2026-09-13T11:30:00.000Z'),
      occurrence('2026-09-20T11:30:00.000Z'),
    ];
    state.events = [instanceOf('2026-09-06T11:30:00.000Z')];

    const res = await runCalendarScan('2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z');

    expect(importedLessons()).toHaveLength(0);
    expect(res.needsMatchCreated).toBe(0);
    // It was recognised and completed — the real lesson, not a copy.
    expect(res.completed).toBe(1);
  });

  it('completes the RIGHT occurrence, not whichever the map kept last', async () => {
    /*
      The heart of it: a Map keyed on the shared master id retains only one of
      the three. Matching on master + start is what makes the middle week
      resolvable at all.
    */
    state.lessons = [
      occurrence('2026-09-06T11:30:00.000Z'),
      occurrence('2026-09-13T11:30:00.000Z'),
      occurrence('2026-09-20T11:30:00.000Z'),
    ];
    state.events = [instanceOf('2026-09-13T11:30:00.000Z')];

    await runCalendarScan('2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z');

    expect(importedLessons()).toHaveLength(0);
    // The payment opened belongs to the 13th, at that lesson's own price.
    const pay = state.inserted.find((i) => i.table === 'payments');
    expect(pay?.values.lessonId).toBe('lesson-2026-09-13T11:30:00.000Z');
    expect(pay?.values.amount).toBe(140);
  });

  it('still imports a genuinely new event', async () => {
    // Nothing in the roster claims this one, so it must still be captured.
    state.lessons = [];
    state.events = [
      { id: 'brand-new-event', summary: 'שיעור – מישהי', startISO: '2026-09-10T09:00:00.000Z', endISO: '2026-09-10T10:00:00.000Z', type: 'individual' },
    ];

    await runCalendarScan('2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z');

    expect(importedLessons()).toHaveLength(1);
  });

  it('opens no ₪0 charge for a lesson with no price', async () => {
    /*
      A priceless lesson is an exemption or an unpriced import, never a debt.
      Opening one is what asked Ilanit "התקבל תשלום של ₪0?" and billed רוני and
      ירדן for nothing.
    */
    state.lessons = [occurrence('2026-09-06T11:30:00.000Z', { price: null })];
    state.events = [instanceOf('2026-09-06T11:30:00.000Z')];

    await runCalendarScan('2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z');

    expect(state.inserted.find((i) => i.table === 'payments')).toBeUndefined();
    expect(state.notified.find((n) => n.template === 'payment_check_ilanit')).toBeUndefined();
    // The lesson is still marked completed — only the charge is withheld.
    expect(state.updates.find((u) => u.set?.status === 'completed')).toBeDefined();
  });

  it('uses the real start rather than guessing it from the duration', async () => {
    state.lessons = [];
    state.events = [
      { id: 'solo', summary: 'שיעור – חדשה', startISO: '2026-09-10T08:45:00.000Z', endISO: '2026-09-10T10:00:00.000Z', type: 'individual' },
    ];

    await runCalendarScan('2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z');

    const created = importedLessons()[0];
    // 08:45, not "one hour before the end".
    expect((created.values.startsAt as Date).toISOString()).toBe('2026-09-10T08:45:00.000Z');
  });
});
