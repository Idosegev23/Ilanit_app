import { db } from '@/lib/db';
import { payments, receipts, lessons, students } from '@/db/schema';
import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { notify } from '@/lib/notifications/dispatch';
import { nowIL } from '@/lib/time';

/*
  Receipt REMINDERS. The system deliberately issues nothing.

  Ilanit issues her own receipts and wants to keep doing so, so this job only
  tells her what is waiting — one line per student for the previous calendar
  month, one receipt each, per her rule of a single monthly receipt covering
  every payment.

  The Morning integration and the receipts table stay in place and dormant:
  removing them would be a one-way door if she ever wants the system to issue
  again, and dormant code that nothing calls costs nothing.
*/

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export interface ReceiptRemindersResult {
  /** Students with settled payments and no receipt for the month. */
  pending: number;
  totalAmount: number;
  sent: boolean;
}

/**
 * Summarises last month's settled-but-unreceipted payments for Ilanit.
 *
 * Only PAID payments count: an intent is not money, and a receipt for a payment
 * that never arrived would be worse than a late one.
 */
export async function runReceiptReminders(
  monthOffset = -1,
): Promise<ReceiptRemindersResult> {
  const now = nowIL();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const from = new Date(target.getFullYear(), target.getMonth(), 1);
  const to = new Date(target.getFullYear(), target.getMonth() + 1, 1);

  const rows = await db
    .select({
      studentId: lessons.studentId,
      studentName: students.name,
      amount: payments.amount,
      receiptId: receipts.id,
    })
    .from(payments)
    .innerJoin(lessons, eq(lessons.id, payments.lessonId))
    .leftJoin(students, eq(students.id, lessons.studentId))
    .leftJoin(receipts, eq(receipts.paymentId, payments.id))
    .where(
      and(
        eq(payments.status, 'paid'),
        gte(payments.paidAt, from),
        lt(payments.paidAt, to),
        isNull(receipts.id),
      ),
    );

  const byStudent = new Map<string, { name: string; amount: number; count: number }>();
  for (const r of rows) {
    if (!r.studentId) continue;
    const cur = byStudent.get(r.studentId) ?? {
      name: r.studentName ?? '',
      amount: 0,
      count: 0,
    };
    cur.amount += r.amount;
    cur.count += 1;
    byStudent.set(r.studentId, cur);
  }

  if (byStudent.size === 0) {
    return { pending: 0, totalAmount: 0, sent: false };
  }

  const entries = [...byStudent.values()].sort((a, b) => b.amount - a.amount);
  const totalAmount = entries.reduce((n, e) => n + e.amount, 0);
  const monthLabel = `${HE_MONTHS[target.getMonth()]} ${target.getFullYear()}`;

  const summary =
    `חודש ${monthLabel}:\n` +
    entries
      .map((e) => `• ${e.name} — ${e.amount}₪ (${e.count} תשלומים)`)
      .join('\n') +
    `\n\nסה״כ ${totalAmount}₪ · ${entries.length} קבלות להוצאה.`;

  let sent = false;
  try {
    await notify(
      'receipts_due_ilanit',
      env().ILANIT_PHONE,
      { summary },
      // One reminder per month, so a re-run inside the same month is a no-op.
      `receipts:${target.getFullYear()}-${target.getMonth() + 1}`,
    );
    sent = true;
  } catch (err) {
    console.error('[receipt-reminders] notify failed:', err);
  }

  return { pending: entries.length, totalAmount, sent };
}
