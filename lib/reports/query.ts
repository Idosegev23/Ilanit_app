import { db } from '@/lib/db';
import { lessons, students, groups, payments, groupBilling } from '@/db/schema';
import { and, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { parseILDateTime, toILDateStr } from '@/lib/time';

/*
  The report engine behind /reports.

  This replaces the free-text questions Ilanit was supposed to ask the WhatsApp
  bot — a feature she never knew existed. The questions themselves were real
  ("how many lessons did Imri have in August", "who owes me money"), so they
  moved into the app as filters she can see and adjust, which also makes the
  answer auditable: every number on the screen is backed by the rows listed
  under it.

  Read-only by construction. Nothing here writes, bills or settles.
*/

export type LessonStatusFilter =
  'all' | 'completed' | 'confirmed' | 'pending' | 'cancelled' | 'rejected';

/**
 * `unbilled` is not a payments value — it means an INDIVIDUAL lesson carries no
 * payment row at all. It earns a place next to the real statuses because that
 * is the silent failure mode: a lesson that was never charged looks identical
 * to a settled one in every other view, since neither shows up as a debt.
 *
 * Group sessions are excluded by definition, not by oversight: they are billed
 * monthly per student through `groupBilling` and never carry a per-lesson
 * charge, so counting them here would report every single one as a missed
 * charge and send Ilanit chasing money she already bills correctly.
 */
export type PaymentStatusFilter = 'all' | 'due' | 'paid' | 'waived' | 'unbilled';

export type LessonTypeFilter = 'all' | 'individual' | 'group_session';

export interface ReportFilters {
  studentId?: string | null;
  groupId?: string | null;
  /** Inclusive IL calendar dates, `yyyy-MM-dd`. */
  from?: string | null;
  to?: string | null;
  lessonStatus?: LessonStatusFilter;
  paymentStatus?: PaymentStatusFilter;
  type?: LessonTypeFilter;
}

export interface ReportRow {
  lessonId: string;
  startsAt: Date;
  endsAt: Date;
  type: 'individual' | 'group_session';
  lessonStatus: string;
  studentId: string | null;
  studentName: string | null;
  groupName: string | null;
  /** null when the lesson has never been billed. */
  paymentStatus: 'due' | 'paid' | 'waived' | null;
  amount: number | null;
  paidAt: Date | null;
  method: string | null;
}

export interface StudentRollup {
  studentId: string;
  name: string;
  lessons: number;
  paid: number;
  due: number;
  unbilled: number;
}

export interface ReportTotals {
  lessons: number;
  /** Lessons with a payment row, whatever its status. */
  billed: number;
  unbilled: number;
  paid: number;
  due: number;
  waived: number;
}

/**
 * Group billing for the same window. Kept OUT of `totals` on purpose: a group
 * charge is monthly and per student, with no lesson attached, so it has no
 * lesson status, no lesson date and no per-lesson amount. Folding it into the
 * lesson totals would make "what was cancelled in August" quietly report a
 * group charge that has nothing to do with any cancellation.
 *
 * `applies` is false when the active filters are lesson-shaped, and the query
 * is then skipped rather than answered with a misleading zero.
 */
export interface GroupBillingTotals {
  applies: boolean;
  paid: number;
  due: number;
}

export interface ReportResult {
  rows: ReportRow[];
  totals: ReportTotals;
  groupBilling: GroupBillingTotals;
  byStudent: StudentRollup[];
}

/** Whether monthly group billing can meaningfully answer these filters. */
export function groupBillingApplies(f: ReportFilters): boolean {
  if (f.lessonStatus && f.lessonStatus !== 'all') return false;
  if (f.type === 'individual') return false;
  if (f.paymentStatus === 'unbilled') return false;
  return true;
}

/** Start of an IL calendar day as a UTC instant. */
function dayStart(dateStr: string): Date {
  return parseILDateTime(dateStr, '00:00');
}

/** Start of the day AFTER `dateStr`, so a `to` bound includes its own day. */
function dayAfter(dateStr: string): Date {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return dayStart(toILDateStr(d));
}

export async function runReport(filters: ReportFilters): Promise<ReportResult> {
  const where: SQL[] = [];
  if (filters.studentId) where.push(eq(lessons.studentId, filters.studentId));
  if (filters.groupId) where.push(eq(lessons.groupId, filters.groupId));
  if (filters.from) where.push(gte(lessons.startsAt, dayStart(filters.from)));
  if (filters.to) where.push(lt(lessons.startsAt, dayAfter(filters.to)));
  if (filters.lessonStatus && filters.lessonStatus !== 'all') {
    where.push(eq(lessons.status, filters.lessonStatus));
  }
  if (filters.type && filters.type !== 'all') where.push(eq(lessons.type, filters.type));

  const raw = await db
    .select({
      lessonId: lessons.id,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      type: lessons.type,
      lessonStatus: lessons.status,
      studentId: lessons.studentId,
      studentName: students.name,
      bookedByName: lessons.bookedByName,
      groupName: groups.name,
      paymentStatus: payments.status,
      amount: payments.amount,
      paidAt: payments.paidAt,
      method: payments.method,
    })
    .from(lessons)
    .leftJoin(students, eq(students.id, lessons.studentId))
    .leftJoin(groups, eq(groups.id, lessons.groupId))
    .leftJoin(payments, eq(payments.lessonId, lessons.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(lessons.startsAt));

  /*
    The payment filter is applied here rather than in SQL because `unbilled`
    asks for the ABSENCE of a joined row, which a WHERE on payments.status
    cannot express without turning the LEFT JOIN back into an inner one.
  */
  const want = filters.paymentStatus ?? 'all';
  const rows: ReportRow[] = raw
    .filter((r) => {
      if (want === 'all') return true;
      if (want === 'unbilled')
        return r.paymentStatus === null && r.type === 'individual';
      return r.paymentStatus === want;
    })
    .map((r) => ({
      lessonId: r.lessonId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      type: r.type,
      lessonStatus: r.lessonStatus,
      studentId: r.studentId,
      studentName: r.studentName ?? r.bookedByName ?? null,
      groupName: r.groupName,
      paymentStatus: r.paymentStatus,
      amount: r.amount,
      paidAt: r.paidAt,
      method: r.method,
    }));

  const totals: ReportTotals = {
    lessons: rows.length,
    billed: 0,
    unbilled: 0,
    paid: 0,
    due: 0,
    waived: 0,
  };
  const group: GroupBillingTotals = {
    applies: groupBillingApplies(filters),
    paid: 0,
    due: 0,
  };
  const byStudent = new Map<string, StudentRollup>();

  for (const r of rows) {
    // A group session with no payment row is correct, not missing.
    if (r.paymentStatus === null) {
      if (r.type === 'individual') totals.unbilled += 1;
    } else {
      totals.billed += 1;
      const amt = r.amount ?? 0;
      if (r.paymentStatus === 'paid') totals.paid += amt;
      else if (r.paymentStatus === 'due') totals.due += amt;
      else totals.waived += amt;
    }

    if (!r.studentId) continue;
    let cur = byStudent.get(r.studentId);
    if (!cur) {
      cur = {
        studentId: r.studentId,
        name: r.studentName ?? '—',
        lessons: 0,
        paid: 0,
        due: 0,
        unbilled: 0,
      };
      byStudent.set(r.studentId, cur);
    }
    cur.lessons += 1;
    if (r.paymentStatus === 'paid') cur.paid += r.amount ?? 0;
    else if (r.paymentStatus === 'due') cur.due += r.amount ?? 0;
    else if (r.paymentStatus === null && r.type === 'individual') cur.unbilled += 1;
  }

  // Group billing for the same window, so "how much did I take in" is not
  // silently missing every group student.
  if (group.applies) {
    const gWhere: SQL[] = [];
    if (filters.studentId) gWhere.push(eq(groupBilling.studentId, filters.studentId));
    if (filters.groupId) gWhere.push(eq(groupBilling.groupId, filters.groupId));
    if (filters.from) gWhere.push(gte(groupBilling.month, filters.from.slice(0, 8) + '01'));
    if (filters.to) gWhere.push(lt(groupBilling.month, toILDateStr(dayAfter(filters.to))));
    const bills = await db
      .select({ status: groupBilling.status, amount: groupBilling.amount })
      .from(groupBilling)
      .where(gWhere.length ? and(...gWhere) : undefined);
    for (const b of bills) {
      if (b.status === 'paid') group.paid += b.amount;
      else if (b.status === 'due') group.due += b.amount;
    }
  }

  return {
    rows,
    totals,
    groupBilling: group,
    byStudent: [...byStudent.values()].sort((a, b) => b.lessons - a.lessons),
  };
}

/** Active students and groups, for the filter pickers. */
export async function loadReportOptions() {
  const [st, gr] = await Promise.all([
    db
      .select({
        id: students.id,
        name: students.name,
        phone: students.phone,
        guardianName: students.guardianName,
        guardianPhone: students.guardianPhone,
      })
      .from(students)
      .where(eq(students.archived, false))
      .orderBy(asc(students.name)),
    db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.active, true))
      .orderBy(asc(groups.name)),
  ]);
  return { students: st, groups: gr };
}
