import { db } from '@/lib/db';
import { payments, lessons, students, groupBilling, groups } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { notify } from '@/lib/notifications/dispatch';
import { contactPhoneFor } from '@/lib/students';
import { createActionToken, createGroupBillingToken } from '@/lib/tokens';
import { formatILDateTime, nowIL } from '@/lib/time';
import { toILMonthStr } from '@/lib/groups/month';
import { mayAskToday } from '@/lib/payments/collect-window';

/*
  Sends the requests that were held back for a family's pay-day.

  A parent who pays on the 15th is charged on time but not asked until the 15th,
  so something has to do the asking when the day comes. That is this.

  It leans entirely on the message log for "was this already asked?": every
  request carries a stable relatedId, and `notify` skips a (template, relatedId)
  pair it has already sent. So this pass can re-attempt every open charge every
  hour and only the genuinely unasked ones go out — which also means a request
  lost to an outage is picked up here rather than becoming a silent debt.

  Bounded to charges from the last 31 days. Without that bound, switching this
  on would ask about the entire back catalogue at once — the same trap the
  original collection engine had, measured at nine surprise messages.
*/

const LOOKBACK_DAYS = 31;
/** Same TTL the primary send paths mint, so a deferred link is no shorter. */
const PAY_TOKEN_TTL_MIN = 60 * 24 * 60;

export interface DeferredRequestsResult {
  individual: number;
  group: number;
}

export async function runDeferredPaymentRequests(): Promise<DeferredRequestsResult> {
  const now = nowIL();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const result: DeferredRequestsResult = { individual: 0, group: 0 };

  // ── individual lessons ────────────────────────────────────────────────────
  const openLessons = await db
    .select({ pay: payments, lesson: lessons, student: students })
    .from(payments)
    .innerJoin(lessons, eq(lessons.id, payments.lessonId))
    .innerJoin(students, eq(students.id, lessons.studentId))
    .where(and(eq(payments.status, 'due'), gt(payments.createdAt, since)));

  for (const { pay, lesson, student } of openLessons) {
    if (!student.autoCollect || !mayAskToday(student, now)) continue;
    const raw = await createActionToken('pay', lesson.id, PAY_TOKEN_TTL_MIN);
    const res = await notify(
      'pay_request_individual',
      contactPhoneFor(student),
      {
        studentName: student.name,
        datetime: formatILDateTime(lesson.startsAt),
        amount: pay.amount,
        actionUrl: `${appUrl}/pay/${raw}`,
      },
      `pay-req:${pay.id}`,
      lesson.id,
    );
    if (res.ok && !res.skipped) result.individual += 1;
  }

  // ── monthly group charges ─────────────────────────────────────────────────
  const openBills = await db
    .select({ bill: groupBilling, group: groups, student: students })
    .from(groupBilling)
    .innerJoin(groups, eq(groups.id, groupBilling.groupId))
    .innerJoin(students, eq(students.id, groupBilling.studentId))
    .where(and(eq(groupBilling.status, 'due'), gt(groupBilling.createdAt, since)));

  for (const { bill, group, student } of openBills) {
    if (!student.autoCollect || !mayAskToday(student, now)) continue;
    const payToken = await createGroupBillingToken('pay', bill.id, PAY_TOKEN_TTL_MIN);
    const res = await notify(
      'pay_request_group',
      contactPhoneFor(student),
      {
        studentName: student.name,
        groupName: group.name,
        month: toILMonthStr(bill.month),
        amount: bill.amount,
        actionUrl: `${appUrl}/pay/${payToken}`,
      },
      `group_billing:${bill.id}`,
    );
    if (res.ok && !res.skipped) result.group += 1;
  }

  return result;
}
