// Pure, side-effect-free aggregation helpers used to build the *anonymized*
// statistics object that is fed to OpenAI for the AI insights, and to shape the
// numeric series consumed by the dashboard charts.
//
// Privacy rule (spec §5.5): the payload sent to OpenAI may contain FIRST NAMES
// ONLY — never phone numbers, emails, full names, or any other PII. The helpers
// here are deliberately decoupled from the DB so they can be unit-tested with
// plain objects and reused by both the insights generator and the metrics layer.

import { ilHour, ilWeekday, toILDateStr } from '@/lib/time';

/** Hebrew weekday labels, index 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_LABELS_HE = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

/** Minimal lesson shape the aggregators need (decoupled from Drizzle rows). */
export interface AggLesson {
  status: string;
  type: string;
  startsAt: Date;
  price: number | null;
  studentId: string | null;
}

/** Minimal paid-payment shape (only paid payments contribute to revenue). */
export interface AggPayment {
  amount: number;
  paidAt: Date | null;
  status: string;
}

/** First-name-only student reference for anonymized aggregates. */
export interface AggStudentRef {
  id: string;
  firstName: string;
}

export interface RevenuePoint {
  date: string; // yyyy-MM-dd (Asia/Jerusalem)
  amount: number; // ₪ (integer)
}

export interface LessonsPerWeekPoint {
  week: string; // ISO week start date yyyy-MM-dd (Sunday, Asia/Jerusalem)
  count: number;
}

export interface WeekdayDistributionPoint {
  weekday: number; // 0-6
  label: string; // Hebrew
  count: number;
}

export interface HourDistributionPoint {
  hour: number; // 0-23
  count: number;
}

export interface TopStudentPoint {
  firstName: string;
  lessons: number;
  revenue: number; // ₪
}

/** Extracts a first name (everything up to the first space) from a full name. */
export function firstNameOf(fullName: string): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

/**
 * Sunday-anchored start-of-week date string (yyyy-MM-dd, Asia/Jerusalem) for an
 * instant. Used to bucket lessons per week.
 */
export function weekStartILDateStr(date: Date): string {
  const weekday = ilWeekday(date); // 0 = Sunday
  const ms = date.getTime() - weekday * 24 * 60 * 60 * 1000;
  return toILDateStr(new Date(ms));
}

/**
 * Daily revenue series from PAID payments only, in chronological order.
 * Days with no revenue are omitted (the chart fills gaps visually).
 */
export function buildRevenueSeries(payments: AggPayment[]): RevenuePoint[] {
  const byDay = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== 'paid' || !p.paidAt) continue;
    const day = toILDateStr(p.paidAt);
    byDay.set(day, (byDay.get(day) ?? 0) + p.amount);
  }
  return [...byDay.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Count of confirmed/completed lessons bucketed by ISO-ish week (Sunday start),
 * chronological. Pending/rejected/cancelled lessons are excluded.
 */
export function buildLessonsPerWeek(lessons: AggLesson[]): LessonsPerWeekPoint[] {
  const byWeek = new Map<string, number>();
  for (const l of lessons) {
    if (l.status !== 'confirmed' && l.status !== 'completed') continue;
    const week = weekStartILDateStr(l.startsAt);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }
  return [...byWeek.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/** Distribution of confirmed/completed lessons across weekdays (0-6). */
export function buildWeekdayDistribution(
  lessons: AggLesson[],
): WeekdayDistributionPoint[] {
  const counts = new Array(7).fill(0) as number[];
  for (const l of lessons) {
    if (l.status !== 'confirmed' && l.status !== 'completed') continue;
    counts[ilWeekday(l.startsAt)] += 1;
  }
  return counts.map((count, weekday) => ({
    weekday,
    label: WEEKDAY_LABELS_HE[weekday],
    count,
  }));
}

/** Distribution of confirmed/completed lessons across hours of the day (0-23). */
export function buildHourDistribution(lessons: AggLesson[]): HourDistributionPoint[] {
  const counts = new Array(24).fill(0) as number[];
  for (const l of lessons) {
    if (l.status !== 'confirmed' && l.status !== 'completed') continue;
    counts[ilHour(l.startsAt)] += 1;
  }
  return counts
    .map((count, hour) => ({ hour, count }))
    .filter((p) => p.count > 0);
}

/**
 * Top students by lesson count (ties broken by revenue), first names only.
 * Lessons without a matching student ref are ignored.
 */
export function buildTopStudents(
  lessons: AggLesson[],
  students: AggStudentRef[],
  limit = 5,
): TopStudentPoint[] {
  const nameById = new Map(students.map((s) => [s.id, s.firstName]));
  const agg = new Map<string, { lessons: number; revenue: number }>();
  for (const l of lessons) {
    if (l.status !== 'confirmed' && l.status !== 'completed') continue;
    if (!l.studentId) continue;
    const name = nameById.get(l.studentId);
    if (!name) continue;
    const cur = agg.get(name) ?? { lessons: 0, revenue: 0 };
    cur.lessons += 1;
    cur.revenue += l.price ?? 0;
    agg.set(name, cur);
  }
  return [...agg.entries()]
    .map(([firstName, v]) => ({ firstName, lessons: v.lessons, revenue: v.revenue }))
    .sort((a, b) => b.lessons - a.lessons || b.revenue - a.revenue)
    .slice(0, limit);
}

/** The full anonymized stats object handed to OpenAI (first names only). */
export interface AnonymizedStats {
  periodDays: number;
  totalRevenue: number;
  paidCount: number;
  lessonsByStatus: Record<string, number>;
  activeStudents: number;
  outstandingAmount: number;
  outstandingCount: number;
  occupancyPct: number;
  revenueByDay: RevenuePoint[];
  lessonsPerWeek: LessonsPerWeekPoint[];
  weekdayDistribution: WeekdayDistributionPoint[];
  hourDistribution: HourDistributionPoint[];
  topStudents: TopStudentPoint[];
}

/** Tallies lesson counts by status. */
export function lessonsByStatus(lessons: AggLesson[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lessons) {
    out[l.status] = (out[l.status] ?? 0) + 1;
  }
  return out;
}

/**
 * Builds the complete anonymized statistics object from raw (already
 * DB-fetched) rows. Pure: no DB, no env, no network — fully unit-testable.
 */
export function buildAnonymizedStats(input: {
  periodDays: number;
  lessons: AggLesson[];
  payments: AggPayment[];
  students: AggStudentRef[];
  activeStudents: number;
  occupancyPct: number;
}): AnonymizedStats {
  const { periodDays, lessons, payments, students, activeStudents, occupancyPct } = input;

  const paid = payments.filter((p) => p.status === 'paid');
  const due = payments.filter((p) => p.status === 'due');
  const totalRevenue = paid.reduce((sum, p) => sum + p.amount, 0);
  const outstandingAmount = due.reduce((sum, p) => sum + p.amount, 0);

  return {
    periodDays,
    totalRevenue,
    paidCount: paid.length,
    lessonsByStatus: lessonsByStatus(lessons),
    activeStudents,
    outstandingAmount,
    outstandingCount: due.length,
    occupancyPct,
    revenueByDay: buildRevenueSeries(payments),
    lessonsPerWeek: buildLessonsPerWeek(lessons),
    weekdayDistribution: buildWeekdayDistribution(lessons),
    hourDistribution: buildHourDistribution(lessons),
    topStudents: buildTopStudents(lessons, students),
  };
}
