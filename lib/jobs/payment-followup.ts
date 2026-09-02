import { db } from '@/lib/db';
import { payments, lessons, students } from '@/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/dispatch';
import { nowIL, toILDateStr } from '@/lib/time';

/*
  (ג) The nightly open-debt note to Ilanit.

  This is a WORKLIST, not a ledger. It goes out at 18:00 alongside tomorrow's
  reminders, and its only job is to tell her which parents she still has to
  chase tonight. Three rules follow from that, all learned the hard way when the
  01/09 note arrived as thirteen lines of mostly ₪0:

    · one line per FAMILY, not per lesson — she chases a parent once, not once
      per session, and thirteen lines of the same two names is not a list she
      can act on;
    · never a ₪0 line — a zero charge is an exemption or an unpriced row, and
      neither is money anyone owes;
    · nothing from a family she settles with by hand — she has already decided
      not to chase them, and being reminded nightly of a decision she made is
      exactly the friction this note should be removing.

  What is deliberately NOT here: the full open-debt picture, including the
  hand-billed families. That lives on /reports, where she can go and look when
  she wants it — rather than being pushed at her every evening.
*/

export interface PaymentFollowupResult {
  openDebts: number;
  reminderSent: boolean;
}

/**
 * Sends Ilanit one consolidated note about debts she can still act on. A debt
 * counts when its payment is still `due`, carries a real amount, belongs to a
 * family in the automatic flow, and was created more than
 * `paymentFollowupDelayH` hours ago. Idempotent per day via message_log.
 */
export async function runPaymentFollowup(): Promise<PaymentFollowupResult> {
  const settings = await getSettings();
  const ilanitPhone = env().ILANIT_PHONE;

  const now = nowIL();
  const cutoff = new Date(now.getTime() - settings.paymentFollowupDelayH * 60 * 60 * 1000);

  const rows = await db
    .select({
      amount: payments.amount,
      startsAt: lessons.startsAt,
      studentId: students.id,
      studentName: students.name,
      autoCollect: students.autoCollect,
    })
    .from(payments)
    .innerJoin(lessons, eq(payments.lessonId, lessons.id))
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(
      and(
        eq(payments.status, 'due'),
        lt(payments.createdAt, cutoff),
        gt(payments.amount, 0),
      ),
    );

  // A row with no student at all is an unmatched import, not a debt anyone can
  // be asked to settle — it needs assigning first, so it has no place on a
  // chase list either.
  const chaseable = rows.filter((r) => r.studentId && r.autoCollect);
  if (chaseable.length === 0) {
    return { openDebts: 0, reminderSent: false };
  }

  interface Owed {
    name: string;
    lessons: number;
    amount: number;
    oldest: Date;
  }
  const byStudent = new Map<string, Owed>();
  for (const r of chaseable) {
    const key = r.studentId as string;
    const cur = byStudent.get(key);
    if (cur) {
      cur.lessons += 1;
      cur.amount += r.amount;
      if (r.startsAt < cur.oldest) cur.oldest = r.startsAt;
    } else {
      byStudent.set(key, {
        name: r.studentName ?? 'תלמיד/ה',
        lessons: 1,
        amount: r.amount,
        oldest: r.startsAt,
      });
    }
  }

  // Largest debt first — that is the call worth making tonight.
  const owed = [...byStudent.values()].sort((a, b) => b.amount - a.amount);
  const totalAmount = owed.reduce((sum, o) => sum + o.amount, 0);

  const lines = owed
    .map((o) => {
      const since = toILDateStr(o.oldest).split('-').reverse().slice(0, 2).join('/');
      const what = o.lessons === 1 ? 'שיעור אחד' : `${o.lessons} שיעורים`;
      return `• ${o.name} — ${what}, ₪${o.amount} (מ-${since})`;
    })
    .join('\n');
  const summary =
    owed.length === 1 ? lines : `${lines}\nסה"כ פתוח: ₪${totalAmount}`;

  const today = toILDateStr(now);
  const res = await notify(
    'payment_followup_ilanit',
    ilanitPhone,
    { summary },
    `followup:${today}`,
  );

  return { openDebts: chaseable.length, reminderSent: res.ok && !res.skipped };
}
