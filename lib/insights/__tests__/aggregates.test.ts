import { describe, it, expect } from 'vitest';
import {
  firstNameOf,
  weekStartILDateStr,
  buildRevenueSeries,
  buildLessonsPerWeek,
  buildWeekdayDistribution,
  buildHourDistribution,
  buildTopStudents,
  lessonsByStatus,
  buildAnonymizedStats,
  WEEKDAY_LABELS_HE,
  type AggLesson,
  type AggPayment,
  type AggStudentRef,
} from '@/lib/insights/aggregates';
import { parseILDateTime } from '@/lib/time';

// Helper builders for terse fixtures. `startsAt` defaults to a fixed instant
// for tests that don't exercise date logic.
function lesson(p: Partial<AggLesson>): AggLesson {
  return {
    status: 'completed',
    type: 'individual',
    price: 120,
    studentId: null,
    startsAt: new Date('2026-06-03T07:00:00.000Z'),
    ...p,
  };
}
function payment(p: Partial<AggPayment>): AggPayment {
  return { amount: 120, paidAt: null, status: 'paid', ...p };
}

describe('firstNameOf', () => {
  it('returns the first token of a full name', () => {
    expect(firstNameOf('דנה כהן לוי')).toBe('דנה');
    expect(firstNameOf('Yossi')).toBe('Yossi');
  });
  it('handles empty / whitespace input', () => {
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf('   ')).toBe('');
  });
});

describe('weekStartILDateStr', () => {
  it('anchors the week to the preceding Sunday (Asia/Jerusalem)', () => {
    // 2026-06-03 is a Wednesday → week start Sunday 2026-05-31.
    const wed = parseILDateTime('2026-06-03', '10:00');
    expect(weekStartILDateStr(wed)).toBe('2026-05-31');
    // A Sunday is its own week start.
    const sun = parseILDateTime('2026-05-31', '09:00');
    expect(weekStartILDateStr(sun)).toBe('2026-05-31');
  });
});

describe('buildRevenueSeries', () => {
  it('sums only PAID payments by paid-at day, chronologically', () => {
    const payments: AggPayment[] = [
      payment({ amount: 100, status: 'paid', paidAt: parseILDateTime('2026-06-01', '12:00') }),
      payment({ amount: 50, status: 'paid', paidAt: parseILDateTime('2026-06-01', '18:00') }),
      payment({ amount: 200, status: 'paid', paidAt: parseILDateTime('2026-06-03', '09:00') }),
      payment({ amount: 999, status: 'due', paidAt: null }), // ignored
      payment({ amount: 999, status: 'paid', paidAt: null }), // ignored (no date)
    ];
    expect(buildRevenueSeries(payments)).toEqual([
      { date: '2026-06-01', amount: 150 },
      { date: '2026-06-03', amount: 200 },
    ]);
  });

  it('returns an empty series when nothing is paid', () => {
    expect(buildRevenueSeries([payment({ status: 'due', paidAt: null })])).toEqual([]);
  });
});

describe('buildLessonsPerWeek', () => {
  it('counts only confirmed/completed lessons grouped by Sunday-week', () => {
    const lessons: AggLesson[] = [
      lesson({ startsAt: parseILDateTime('2026-06-01', '10:00'), status: 'completed' }), // wk 05-31
      lesson({ startsAt: parseILDateTime('2026-06-03', '10:00'), status: 'confirmed' }), // wk 05-31
      lesson({ startsAt: parseILDateTime('2026-06-08', '10:00'), status: 'completed' }), // wk 06-07
      lesson({ startsAt: parseILDateTime('2026-06-08', '12:00'), status: 'pending' }), // ignored
      lesson({ startsAt: parseILDateTime('2026-06-08', '14:00'), status: 'cancelled' }), // ignored
    ];
    expect(buildLessonsPerWeek(lessons)).toEqual([
      { week: '2026-05-31', count: 2 },
      { week: '2026-06-07', count: 1 },
    ]);
  });
});

describe('buildWeekdayDistribution', () => {
  it('produces a 7-entry array with Hebrew labels', () => {
    const lessons: AggLesson[] = [
      lesson({ startsAt: parseILDateTime('2026-06-03', '10:00') }), // Wednesday = 3
      lesson({ startsAt: parseILDateTime('2026-06-03', '11:00') }), // Wednesday = 3
      lesson({ startsAt: parseILDateTime('2026-05-31', '09:00') }), // Sunday = 0
      lesson({ startsAt: parseILDateTime('2026-06-03', '12:00'), status: 'pending' }), // ignored
    ];
    const dist = buildWeekdayDistribution(lessons);
    expect(dist).toHaveLength(7);
    expect(dist[0]).toEqual({ weekday: 0, label: 'ראשון', count: 1 });
    expect(dist[3]).toEqual({ weekday: 3, label: 'רביעי', count: 2 });
    expect(dist[6]).toEqual({ weekday: 6, label: WEEKDAY_LABELS_HE[6], count: 0 });
  });
});

describe('buildHourDistribution', () => {
  it('returns only hours with activity (Asia/Jerusalem)', () => {
    const lessons: AggLesson[] = [
      lesson({ startsAt: parseILDateTime('2026-06-03', '10:00') }),
      lesson({ startsAt: parseILDateTime('2026-06-04', '10:30') }),
      lesson({ startsAt: parseILDateTime('2026-06-05', '16:00') }),
    ];
    expect(buildHourDistribution(lessons)).toEqual([
      { hour: 10, count: 2 },
      { hour: 16, count: 1 },
    ]);
  });
});

describe('buildTopStudents', () => {
  const students: AggStudentRef[] = [
    { id: 's1', firstName: 'דנה' },
    { id: 's2', firstName: 'יוסי' },
    { id: 's3', firstName: 'מאיה' },
  ];
  it('ranks by lesson count then revenue, first names only', () => {
    const lessons: AggLesson[] = [
      lesson({ studentId: 's1', price: 100 }),
      lesson({ studentId: 's1', price: 100 }),
      lesson({ studentId: 's1', price: 100 }),
      lesson({ studentId: 's2', price: 300 }),
      lesson({ studentId: 's2', price: 300 }),
      lesson({ studentId: 's3', price: 100 }),
      lesson({ studentId: null, price: 999 }), // ignored (no student)
      lesson({ studentId: 'unknown', price: 999 }), // ignored (not in roster)
      lesson({ studentId: 's3', price: 100, status: 'pending' }), // ignored (status)
    ];
    const top = buildTopStudents(lessons, students, 5);
    expect(top.map((t) => t.firstName)).toEqual(['דנה', 'יוסי', 'מאיה']);
    expect(top[0]).toEqual({ firstName: 'דנה', lessons: 3, revenue: 300 });
    expect(top[1]).toEqual({ firstName: 'יוסי', lessons: 2, revenue: 600 });
  });
  it('respects the limit', () => {
    const lessons: AggLesson[] = [
      lesson({ studentId: 's1' }),
      lesson({ studentId: 's2' }),
      lesson({ studentId: 's3' }),
    ];
    expect(buildTopStudents(lessons, students, 2)).toHaveLength(2);
  });
});

describe('lessonsByStatus', () => {
  it('tallies every status', () => {
    const lessons: AggLesson[] = [
      lesson({ status: 'completed', startsAt: new Date() }),
      lesson({ status: 'completed', startsAt: new Date() }),
      lesson({ status: 'pending', startsAt: new Date() }),
      lesson({ status: 'cancelled', startsAt: new Date() }),
    ];
    expect(lessonsByStatus(lessons)).toEqual({
      completed: 2,
      pending: 1,
      cancelled: 1,
    });
  });
});

describe('buildAnonymizedStats', () => {
  it('assembles the full payload with revenue/outstanding split and no PII', () => {
    const lessons: AggLesson[] = [
      lesson({ studentId: 's1', price: 120, startsAt: parseILDateTime('2026-06-01', '10:00'), status: 'completed' }),
      lesson({ studentId: 's1', price: 120, startsAt: parseILDateTime('2026-06-03', '10:00'), status: 'confirmed' }),
      lesson({ studentId: 's2', price: 200, startsAt: parseILDateTime('2026-06-02', '16:00'), status: 'pending' }),
    ];
    const payments: AggPayment[] = [
      payment({ amount: 120, status: 'paid', paidAt: parseILDateTime('2026-06-01', '11:00') }),
      payment({ amount: 200, status: 'due', paidAt: null }),
    ];
    const students: AggStudentRef[] = [
      { id: 's1', firstName: 'דנה' },
      { id: 's2', firstName: 'יוסי' },
    ];

    const stats = buildAnonymizedStats({
      periodDays: 30,
      lessons,
      payments,
      students,
      activeStudents: 2,
      occupancyPct: 42,
    });

    expect(stats.periodDays).toBe(30);
    expect(stats.totalRevenue).toBe(120);
    expect(stats.paidCount).toBe(1);
    expect(stats.outstandingAmount).toBe(200);
    expect(stats.outstandingCount).toBe(1);
    expect(stats.activeStudents).toBe(2);
    expect(stats.occupancyPct).toBe(42);
    expect(stats.lessonsByStatus).toEqual({ completed: 1, confirmed: 1, pending: 1 });
    expect(stats.topStudents.map((t) => t.firstName)).toEqual(['דנה']);

    // No PII may leak into the serialized payload.
    const serialized = JSON.stringify(stats);
    expect(serialized).not.toContain('s1');
    expect(serialized).not.toContain('s2');
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/\+972|05\d/);
  });
});
