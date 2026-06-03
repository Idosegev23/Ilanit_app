import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Fake DB ──────────────────────────────────────────────────────────────────
// The metrics layer issues several distinct select() chains. Rather than model
// drizzle faithfully, we route each query by a tag set on the first .from()/
// .where() call and return canned rows. We assert on the SHAPE the metrics
// functions produce, not on the SQL.

interface Scenario {
  periodLessons: Array<Record<string, unknown>>;
  periodPayments: Array<Record<string, unknown>>;
  periodStudents: Array<Record<string, unknown>>;
  duePayments: Array<Record<string, unknown>>;
  upcoming: Array<Record<string, unknown>>;
  pending: Array<Record<string, unknown>>;
  unpaid: Array<Record<string, unknown>>;
}

const scenario: Scenario = {
  periodLessons: [],
  periodPayments: [],
  periodStudents: [],
  duePayments: [],
  upcoming: [],
  pending: [],
  unpaid: [],
};

// Each select() resolves a result based on which columns were selected.
type QueryKind = keyof Scenario | '__joinRows' | null;
function classify(cols: Record<string, unknown>): QueryKind {
  const keys = Object.keys(cols);
  if (keys.includes('paidAt') && keys.includes('status') && keys.includes('amount'))
    return 'periodPayments';
  if (keys.includes('amount') && keys.length === 1) return 'duePayments';
  if (keys.includes('studentId') && keys.includes('startsAt')) return 'periodLessons';
  if (keys.length === 2 && keys.includes('id') && keys.includes('name'))
    return 'periodStudents';
  if (keys.includes('paymentId')) return 'unpaid';
  if (keys.includes('bookedByName') && keys.includes('status')) return '__joinRows';
  return null;
}

// joinRows (upcoming vs pending) disambiguated by the where-status captured.
let lastStatusFilter: string | null = null;

vi.mock('@/lib/db', () => {
  const makeChain = (cols: Record<string, unknown>) => {
    const kind = classify(cols);
    const result = () => {
      if (kind === '__joinRows') {
        return lastStatusFilter === 'pending' ? scenario.pending : scenario.upcoming;
      }
      if (kind) return scenario[kind];
      return [];
    };
    const chain: Record<string, unknown> = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: (pred: unknown) => {
        if (pred && typeof pred === 'object' && '__status' in (pred as object)) {
          lastStatusFilter = (pred as { __status: string }).__status;
        }
        return chain;
      },
      orderBy: () => Promise.resolve(result()),
      limit: () => Promise.resolve(result()),
      then: (resolve: (v: unknown) => void) => resolve(result()),
    };
    return chain;
  };
  return {
    db: {
      select: (cols: Record<string, unknown>) => makeChain(cols),
    },
  };
});

// drizzle operators → capture the status filter for join disambiguation.
vi.mock('drizzle-orm', () => ({
  and: (...preds: unknown[]) => {
    const status = preds.find(
      (p) => p && typeof p === 'object' && '__status' in (p as object),
    );
    return status ?? { __and: preds };
  },
  asc: () => ({ __asc: true }),
  eq: (col: unknown, val: unknown) => {
    if (col && typeof col === 'object' && (col as { __k?: string }).__k === 'status') {
      return { __status: val };
    }
    return { __eq: [col, val] };
  },
  gte: () => ({ __gte: true }),
  lte: () => ({ __lte: true }),
  inArray: () => ({ __inArray: true }),
}));

vi.mock('@/db/schema', () => ({
  lessons: {
    id: { __k: 'id' },
    status: { __k: 'status' },
    type: { __k: 'type' },
    startsAt: { __k: 'startsAt' },
    endsAt: { __k: 'endsAt' },
    price: { __k: 'price' },
    studentId: { __k: 'studentId' },
    bookedByName: { __k: 'bookedByName' },
  },
  payments: {
    id: { __k: 'id' },
    lessonId: { __k: 'lessonId' },
    amount: { __k: 'amount' },
    paidAt: { __k: 'paidAt' },
    status: { __k: 'status' },
  },
  students: { id: { __k: 'id' }, name: { __k: 'name' } },
}));

vi.mock('@/lib/availability', () => ({
  occupancy: vi.fn().mockResolvedValue({ capacity: 100, booked: 55, pct: 55.4 }),
}));

vi.mock('@/lib/time', async () => {
  // Keep the real tz helpers (used transitively by the aggregators) but pin the
  // "now"/"start-of-day" anchors so windows are deterministic.
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return {
    ...actual,
    nowIL: () => new Date('2026-06-03T08:00:00.000Z'),
    startOfDayIL: () => new Date('2026-06-02T21:00:00.000Z'), // 2026-06-03 00:00 IL
  };
});

import {
  getKpis,
  getCharts,
  getActionLists,
  getDashboardData,
  periodWindow,
} from '@/lib/insights/metrics';
import { occupancy } from '@/lib/availability';
import { parseILDateTimeUTC } from './helpers';

function resetScenario() {
  scenario.periodLessons = [];
  scenario.periodPayments = [];
  scenario.periodStudents = [];
  scenario.duePayments = [];
  scenario.upcoming = [];
  scenario.pending = [];
  scenario.unpaid = [];
  lastStatusFilter = null;
}

describe('periodWindow', () => {
  it('spans the trailing N days anchored to IL start-of-day', () => {
    const { from, to } = periodWindow(30);
    // to = start-of-today + 1 day; from = start-of-today - 29 days
    expect(to.getTime() - new Date('2026-06-02T21:00:00.000Z').getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(new Date('2026-06-02T21:00:00.000Z').getTime() - from.getTime()).toBe(
      29 * 24 * 60 * 60 * 1000,
    );
  });
});

describe('getKpis', () => {
  beforeEach(resetScenario);

  it('computes revenue, statuses, outstanding, active students, occupancy', async () => {
    scenario.periodLessons = [
      { status: 'completed', type: 'individual', startsAt: new Date(), price: 120, studentId: 's1' },
      { status: 'confirmed', type: 'individual', startsAt: new Date(), price: 120, studentId: 's2' },
      { status: 'pending', type: 'individual', startsAt: new Date(), price: 120, studentId: 's3' },
      { status: 'completed', type: 'individual', startsAt: new Date(), price: 120, studentId: 's1' },
    ];
    scenario.periodPayments = [
      { amount: 120, paidAt: new Date(), status: 'paid' },
      { amount: 120, paidAt: new Date(), status: 'paid' },
    ];
    scenario.periodStudents = [{ id: 's1', name: 'דנה כהן' }];
    scenario.duePayments = [{ amount: 150 }, { amount: 210 }];

    const kpis = await getKpis(30);
    expect(kpis.revenue).toBe(240);
    expect(kpis.lessonsByStatus).toEqual({ completed: 2, confirmed: 1, pending: 1 });
    expect(kpis.outstandingAmount).toBe(360);
    expect(kpis.outstandingCount).toBe(2);
    // active = distinct students with confirmed/completed lessons → s1, s2
    expect(kpis.activeStudents).toBe(2);
    expect(kpis.occupancyPct).toBe(55); // rounded from 55.4
  });

  it('degrades occupancy to 0 when the availability engine throws', async () => {
    (occupancy as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error('NOT_IMPLEMENTED'),
    );
    scenario.periodLessons = [];
    scenario.periodPayments = [];
    scenario.duePayments = [];
    const kpis = await getKpis(30);
    expect(kpis.occupancyPct).toBe(0);
  });
});

describe('getCharts', () => {
  beforeEach(resetScenario);

  it('produces revenue / lessons-per-week / weekday / top-student series', async () => {
    scenario.periodLessons = [
      {
        status: 'completed',
        type: 'individual',
        startsAt: parseILDateTimeUTC('2026-06-01', '10:00'),
        price: 120,
        studentId: 's1',
      },
      {
        status: 'completed',
        type: 'individual',
        startsAt: parseILDateTimeUTC('2026-06-03', '10:00'),
        price: 120,
        studentId: 's1',
      },
    ];
    scenario.periodPayments = [
      { amount: 120, paidAt: parseILDateTimeUTC('2026-06-01', '11:00'), status: 'paid' },
    ];
    scenario.periodStudents = [{ id: 's1', name: 'דנה כהן' }];

    const charts = await getCharts(30);
    expect(charts.revenueByDay).toEqual([{ date: '2026-06-01', amount: 120 }]);
    expect(charts.lessonsPerWeek).toEqual([{ week: '2026-05-31', count: 2 }]);
    expect(charts.topStudents).toEqual([{ firstName: 'דנה', lessons: 2, revenue: 240 }]);
    expect(charts.weekdayDistribution).toHaveLength(7);
  });
});

describe('getActionLists', () => {
  beforeEach(resetScenario);

  it('maps upcoming, pending, and unpaid rows with display names', async () => {
    const start = parseILDateTimeUTC('2026-06-04', '16:00');
    const end = parseILDateTimeUTC('2026-06-04', '17:00');
    scenario.upcoming = [
      {
        id: 'l1',
        type: 'individual',
        status: 'confirmed',
        startsAt: start,
        endsAt: end,
        price: 120,
        studentName: 'דנה כהן',
        bookedByName: null,
      },
    ];
    scenario.pending = [
      {
        id: 'l2',
        type: 'individual',
        status: 'pending',
        startsAt: start,
        endsAt: end,
        price: 100,
        studentName: null,
        bookedByName: 'מאיה (טלפון)',
      },
    ];
    scenario.unpaid = [
      {
        paymentId: 'p1',
        lessonId: 'l3',
        amount: 120,
        startsAt: start,
        type: 'individual',
        studentName: 'יוסי לוי',
        bookedByName: null,
      },
      {
        paymentId: 'p2',
        lessonId: 'l4',
        amount: 90,
        startsAt: start,
        type: 'group_session',
        studentName: null,
        bookedByName: null,
      },
    ];

    const lists = await getActionLists();
    expect(lists.todayUpcoming).toEqual([
      {
        id: 'l1',
        studentName: 'דנה כהן',
        startsAt: start,
        endsAt: end,
        type: 'individual',
        status: 'confirmed',
        price: 120,
      },
    ]);
    expect(lists.pendingApprovals[0].studentName).toBe('מאיה (טלפון)');
    expect(lists.unpaid[0]).toEqual({
      paymentId: 'p1',
      lessonId: 'l3',
      studentName: 'יוסי לוי',
      startsAt: start,
      amount: 120,
    });
    // group session with no student name → labeled "מפגש קבוצה"
    expect(lists.unpaid[1].studentName).toBe('מפגש קבוצה');
  });
});

describe('getDashboardData', () => {
  beforeEach(resetScenario);

  it('returns the combined payload', async () => {
    const data = await getDashboardData(7);
    expect(data.periodDays).toBe(7);
    expect(data.kpis).toBeDefined();
    expect(data.charts).toBeDefined();
    expect(data.actions).toBeDefined();
  });
});
