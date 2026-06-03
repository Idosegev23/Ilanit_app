import { db } from '@/lib/db';
import { payments, lessons, students } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/dispatch';
import { nowIL, formatILDateTime, toILDateStr } from '@/lib/time';

// (ג) Payment follow-up. Surfaces still-`due` individual-lesson payments that
// are older than settings.paymentFollowupDelayH and sends Ilanit a single
// consolidated reminder. Idempotent per day via message_log.

export interface PaymentFollowupResult {
  openDebts: number;
  reminderSent: boolean;
}

/**
 * Sends Ilanit a daily summary of open (overdue) individual debts. A debt is
 * "overdue" when its payment is still `due` and was created more than
 * `paymentFollowupDelayH` hours ago.
 */
export async function runPaymentFollowup(): Promise<PaymentFollowupResult> {
  const settings = await getSettings();
  const ilanitPhone = env().ILANIT_PHONE;

  const now = nowIL();
  const cutoff = new Date(now.getTime() - settings.paymentFollowupDelayH * 60 * 60 * 1000);

  const rows = await db
    .select({
      paymentId: payments.id,
      amount: payments.amount,
      startsAt: lessons.startsAt,
      studentName: students.name,
    })
    .from(payments)
    .innerJoin(lessons, eq(payments.lessonId, lessons.id))
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(and(eq(payments.status, 'due'), lt(payments.createdAt, cutoff)));

  if (rows.length === 0) {
    return { openDebts: 0, reminderSent: false };
  }

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const lines = rows
    .map((r) => {
      const who = r.studentName ?? 'תלמיד/ה';
      return `• ${who} — ${formatILDateTime(r.startsAt)} — ₪${r.amount}`;
    })
    .join('\n');
  const summary = `${lines}\nסה"כ פתוח: ₪${totalAmount}`;

  const today = toILDateStr(now);
  const res = await notify(
    'payment_followup_ilanit',
    ilanitPhone,
    { summary },
    `followup:${today}`,
  );

  return { openDebts: rows.length, reminderSent: res.ok && !res.skipped };
}
