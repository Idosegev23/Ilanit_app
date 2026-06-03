import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lessons, payments, students } from '@/db/schema';
import { occupancy } from '@/lib/availability';
import { nowIL, startOfDayIL, toILDateStr } from '@/lib/time';
import {
  buildAnonymizedStats,
  firstNameOf,
  buildRevenueSeries,
  buildLessonsPerWeek,
  buildWeekdayDistribution,
  buildTopStudents,
  type AggLesson,
  type AggPayment,
  type AggStudentRef,
  type AnonymizedStats,
  type RevenuePoint,
  type LessonsPerWeekPoint,
  type WeekdayDistributionPoint,
  type TopStudentPoint,
} from '@/lib/insights/aggregates';

// DB-backed metrics layer for the dashboard and the AI insights generator.
// All money is integer ₪; all date logic is Asia/Jerusalem via @/lib/time.
// Occupancy is delegated to the shared availability engine (@/lib/availability).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns the [from, to) UTC window for the trailing `periodDays` in IL time. */
export function periodWindow(periodDays: number): { from: Date; to: Date } {
  const now = nowIL();
  const todayStart = startOfDayIL(now);
  // Window ends at the end of today; starts `periodDays` days before today's start.
  const to = new Date(todayStart.getTime() + DAY_MS);
  const from = new Date(todayStart.getTime() - (periodDays - 1) * DAY_MS);
  return { from, to };
}

export interface DashboardKpis {
  revenue: number; // ₪ paid within the period
  lessonsByStatus: Record<string, number>;
  occupancyPct: number;
  activeStudents: number;
  outstandingAmount: number; // ₪ due (all time)
  outstandingCount: number;
}

export interface DashboardCharts {
  revenueByDay: RevenuePoint[];
  lessonsPerWeek: LessonsPerWeekPoint[];
  weekdayDistribution: WeekdayDistributionPoint[];
  topStudents: TopStudentPoint[];
}

export interface ActionLessonRow {
  id: string;
  studentName: string;
  startsAt: Date;
  endsAt: Date;
  type: string;
  status: string;
  price: number | null;
}

export interface UnpaidRow {
  paymentId: string;
  lessonId: string;
  studentName: string;
  startsAt: Date;
  amount: number;
}

export interface ActionLists {
  todayUpcoming: ActionLessonRow[];
  pendingApprovals: ActionLessonRow[];
  unpaid: UnpaidRow[];
}

export interface DashboardData {
  periodDays: number;
  kpis: DashboardKpis;
  charts: DashboardCharts;
  actions: ActionLists;
}

/**
 * Loads lessons within the window plus their student first-name refs, and all
 * payments tied to those lessons. Returned in the decoupled `Agg*` shapes so
 * the pure aggregators can consume them directly.
 */
async function loadPeriodRows(from: Date, to: Date): Promise<{
  lessons: AggLesson[];
  payments: AggPayment[];
  students: AggStudentRef[];
}> {
  const lessonRows = await db
    .select({
      id: lessons.id,
      status: lessons.status,
      type: lessons.type,
      startsAt: lessons.startsAt,
      price: lessons.price,
      studentId: lessons.studentId,
    })
    .from(lessons)
    .where(and(gte(lessons.startsAt, from), lte(lessons.startsAt, to)))
    .orderBy(asc(lessons.startsAt));

  const lessonIds = lessonRows.map((l) => l.id);
  const studentIds = [
    ...new Set(lessonRows.map((l) => l.studentId).filter((x): x is string => !!x)),
  ];

  const paymentRows = lessonIds.length
    ? await db
        .select({
          amount: payments.amount,
          paidAt: payments.paidAt,
          status: payments.status,
        })
        .from(payments)
        .where(inArray(payments.lessonId, lessonIds))
    : [];

  const studentRows = studentIds.length
    ? await db
        .select({ id: students.id, name: students.name })
        .from(students)
        .where(inArray(students.id, studentIds))
    : [];

  return {
    lessons: lessonRows.map((l) => ({
      status: l.status,
      type: l.type,
      startsAt: l.startsAt,
      price: l.price,
      studentId: l.studentId,
    })),
    payments: paymentRows.map((p) => ({
      amount: p.amount,
      paidAt: p.paidAt,
      status: p.status,
    })),
    students: studentRows.map((s) => ({ id: s.id, firstName: firstNameOf(s.name) })),
  };
}

/** Counts non-archived students who have at least one active lesson in window. */
function countActiveStudents(lessonRows: AggLesson[]): number {
  const ids = new Set<string>();
  for (const l of lessonRows) {
    if (l.studentId && (l.status === 'confirmed' || l.status === 'completed')) {
      ids.add(l.studentId);
    }
  }
  return ids.size;
}

/**
 * Occupancy % for the window, degrading to 0 on any failure. The availability
 * engine parses DATE strings (yyyy-MM-dd, Asia/Jerusalem), so we hand it those
 * rather than full ISO timestamps.
 */
async function safeOccupancyPct(from: Date, to: Date): Promise<number> {
  try {
    const occ = await occupancy(toILDateStr(from), toILDateStr(to));
    return Math.round(occ.pct);
  } catch {
    // Availability engine may be unconfigured/stubbed; degrade gracefully.
    return 0;
  }
}

/** Computes the dashboard KPI block for the trailing period. */
export async function getKpis(periodDays: number): Promise<DashboardKpis> {
  const { from, to } = periodWindow(periodDays);
  const { lessons: lessonRows, payments: paymentRows } = await loadPeriodRows(from, to);

  const lessonsByStatus: Record<string, number> = {};
  for (const l of lessonRows) lessonsByStatus[l.status] = (lessonsByStatus[l.status] ?? 0) + 1;

  const revenue = paymentRows
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);

  // Outstanding is a business-wide figure (all open dues), not period-scoped.
  const dueRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.status, 'due'));
  const outstandingAmount = dueRows.reduce((s, r) => s + r.amount, 0);

  const occupancyPct = await safeOccupancyPct(from, to);

  return {
    revenue,
    lessonsByStatus,
    occupancyPct,
    activeStudents: countActiveStudents(lessonRows),
    outstandingAmount,
    outstandingCount: dueRows.length,
  };
}

/** Computes the chart series for the trailing period. */
export async function getCharts(periodDays: number): Promise<DashboardCharts> {
  const { from, to } = periodWindow(periodDays);
  const { lessons: lessonRows, payments: paymentRows, students: studentRefs } =
    await loadPeriodRows(from, to);

  return {
    revenueByDay: buildRevenueSeries(paymentRows),
    lessonsPerWeek: buildLessonsPerWeek(lessonRows),
    weekdayDistribution: buildWeekdayDistribution(lessonRows),
    topStudents: buildTopStudents(lessonRows, studentRefs),
  };
}

/** Resolves a display name for an action-list row (full name, or booked-by). */
function rowName(name: string | null, bookedBy: string | null, type: string): string {
  if (name) return name;
  if (type === 'group_session') return 'מפגש קבוצה';
  return bookedBy ?? 'ללא שם';
}

/** Builds the action lists: today/upcoming, pending approvals, unpaid. */
export async function getActionLists(): Promise<ActionLists> {
  const now = nowIL();
  const todayStart = startOfDayIL(now);
  const horizon = new Date(todayStart.getTime() + 7 * DAY_MS);

  const upcomingRows = await db
    .select({
      id: lessons.id,
      type: lessons.type,
      status: lessons.status,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      price: lessons.price,
      studentName: students.name,
      bookedByName: lessons.bookedByName,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(
      and(
        eq(lessons.status, 'confirmed'),
        gte(lessons.startsAt, todayStart),
        lte(lessons.startsAt, horizon),
      ),
    )
    .orderBy(asc(lessons.startsAt));

  const pendingRows = await db
    .select({
      id: lessons.id,
      type: lessons.type,
      status: lessons.status,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      price: lessons.price,
      studentName: students.name,
      bookedByName: lessons.bookedByName,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(eq(lessons.status, 'pending'))
    .orderBy(asc(lessons.startsAt));

  const unpaidRows = await db
    .select({
      paymentId: payments.id,
      lessonId: lessons.id,
      amount: payments.amount,
      startsAt: lessons.startsAt,
      type: lessons.type,
      studentName: students.name,
      bookedByName: lessons.bookedByName,
    })
    .from(payments)
    .innerJoin(lessons, eq(payments.lessonId, lessons.id))
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(eq(payments.status, 'due'))
    .orderBy(asc(lessons.startsAt));

  const toActionRow = (r: {
    id: string;
    type: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    price: number | null;
    studentName: string | null;
    bookedByName: string | null;
  }): ActionLessonRow => ({
    id: r.id,
    studentName: rowName(r.studentName, r.bookedByName, r.type),
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    type: r.type,
    status: r.status,
    price: r.price,
  });

  return {
    todayUpcoming: upcomingRows.map(toActionRow),
    pendingApprovals: pendingRows.map(toActionRow),
    unpaid: unpaidRows.map((r) => ({
      paymentId: r.paymentId,
      lessonId: r.lessonId,
      studentName: rowName(r.studentName, r.bookedByName, r.type),
      startsAt: r.startsAt,
      amount: r.amount,
    })),
  };
}

/** Loads the full dashboard payload (KPIs + charts + action lists). */
export async function getDashboardData(periodDays: number): Promise<DashboardData> {
  const [kpis, charts, actions] = await Promise.all([
    getKpis(periodDays),
    getCharts(periodDays),
    getActionLists(),
  ]);
  return { periodDays, kpis, charts, actions };
}

/**
 * Builds the anonymized statistics object (first names only) fed to OpenAI.
 * Reuses the same DB rows and the shared occupancy figure.
 */
export async function buildStatsForPeriod(periodDays: number): Promise<AnonymizedStats> {
  const { from, to } = periodWindow(periodDays);
  const { lessons: lessonRows, payments: paymentRows, students: studentRefs } =
    await loadPeriodRows(from, to);

  const occupancyPct = await safeOccupancyPct(from, to);

  return buildAnonymizedStats({
    periodDays,
    lessons: lessonRows,
    payments: paymentRows,
    students: studentRefs,
    activeStudents: countActiveStudents(lessonRows),
    occupancyPct,
  });
}
