import { db } from '@/lib/db';
import { payments, lessons, students, actionTokens } from '@/db/schema';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { createActionToken, consumeActionToken, hashToken } from '@/lib/tokens';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime, nowIL } from '@/lib/time';

/*
  Collection.

  The shape of this is dictated by one fact: nothing comes back from the money.
  Ilanit's Bit link is a permanent "me" URL carrying her identity and nothing
  else — no amount, no reference — and cash reports nothing either. A parent can
  only DECLARE what they did; settlement is a separate confirmation from her.

  Hence three states rather than two:
    due                  → asked, no answer
    intent cash | bit    → the parent says they paid; Ilanit not yet asked
    paidAt               → Ilanit confirmed the money arrived

  Treating a declaration as payment would quietly settle debts that were never
  paid, which is the one failure here that costs real money.
*/

/*
  The request goes out when the lesson STARTS, not after it ends: the parent is
  usually there at drop-off, which is exactly when paying is convenient, and
  many have already paid by then anyway.
*/
/*
  ...and never if it ended longer ago than this.

  Without an upper bound the first run bills the entire back catalogue: at the
  moment this was written that was nine lessons going back to July, landing on
  four parents at once as a surprise. The window only has to be wider than the
  cron interval so nothing falls between runs; a few hours of slack covers a
  missed tick or a deploy.
*/
const PRIVATE_REQUEST_WINDOW_H = 6;
/** How long after a parent taps Bit before Ilanit is asked to confirm. */
const BIT_CONFIRM_DELAY_H = 24;
const PAY_TOKEN_TTL_MIN = 60 * 24 * 60;

export interface PayView {
  lessonId: string;
  studentName: string;
  amount: number;
  context: string;
  bitLink: string | null;
  settled: boolean;
  intent: 'paid' | 'bit' | null;
}

/** Resolves a parent's link for RENDERING, without consuming it. */
export async function peekPayToken(rawToken: string): Promise<PayView | null> {
  const rows = await db
    .select({ token: actionTokens, lesson: lessons })
    .from(actionTokens)
    .innerJoin(lessons, eq(lessons.id, actionTokens.lessonId))
    .where(and(eq(actionTokens.tokenHash, hashToken(rawToken)), eq(actionTokens.type, 'pay')))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const pay = (
    await db.select().from(payments).where(eq(payments.lessonId, row.lesson.id)).limit(1)
  )[0];
  if (!pay) return null;

  const settings = await getSettings();
  return {
    lessonId: row.lesson.id,
    studentName: row.lesson.bookedByName ?? 'תלמיד/ה',
    amount: pay.amount,
    context:
      row.lesson.type === 'group_session'
        ? 'המפגש הקבוצתי'
        : `השיעור ב-${formatILDateTime(row.lesson.startsAt)}`,
    bitLink: settings.bitLink,
    settled: pay.status === 'paid' || pay.status === 'waived',
    intent: pay.intent,
  };
}

/**
 * Records what the parent declared and tells Ilanit at once.
 *
 * Never marks the payment paid: "שילמתי במזומן" is a claim, and a Bit tap is
 * only evidence the app was opened.
 */
export async function declareIntent(
  rawToken: string,
  intent: 'paid' | 'bit',
): Promise<{ ok: boolean; error?: string }> {
  const consumed = await consumeActionToken(rawToken);
  if (!consumed || consumed.type !== 'pay') {
    return { ok: false, error: 'הקישור אינו תקין או שכבר נוצל' };
  }
  const pay = (
    await db.select().from(payments).where(eq(payments.lessonId, consumed.lessonId)).limit(1)
  )[0];
  if (!pay) return { ok: false, error: 'התשלום לא נמצא' };
  if (pay.status === 'paid') return { ok: true };

  /*
    The METHOD is deliberately not taken from the parent. "שילמתי" carries no
    claim about how, and Ilanit is the one who needs bit-vs-cash for her books —
    so it is captured from her when she confirms, and left null here.
  */
  await db
    .update(payments)
    .set({ intent, intentAt: new Date() })
    .where(eq(payments.id, pay.id));

  const lesson = (
    await db.select().from(lessons).where(eq(lessons.id, consumed.lessonId)).limit(1)
  )[0];
  const context =
    lesson?.type === 'group_session'
      ? 'מפגש קבוצתי'
      : `שיעור ב-${lesson ? formatILDateTime(lesson.startsAt) : ''}`;

  try {
    if (intent === 'paid') {
      /*
        Already paid, method unknown. Ask her straight away and send the settle
        link with it — /p/[token] is where she picks bit or cash and confirms,
        so one message both informs and resolves it.
      */
      const raw = await createActionToken('payment', consumed.lessonId, PAY_TOKEN_TTL_MIN);
      await notify(
        'pay_declared_ilanit',
        env().ILANIT_PHONE,
        {
          studentName: lesson?.bookedByName ?? '',
          amount: pay.amount,
          context,
          actionUrl: `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/p/${raw}`,
        },
        `declared:${pay.id}`,
        consumed.lessonId,
      );
      // She has been asked; runPaymentConfirms must not ask again.
      await db
        .update(payments)
        .set({ confirmAskedAt: new Date() })
        .where(eq(payments.id, pay.id));
    } else {
      // Opened Bit to pay now — nothing to confirm yet, so this is only a
      // heads-up. runPaymentConfirms asks about it a day later.
      await notify(
        'pay_intent_ilanit',
        env().ILANIT_PHONE,
        {
          studentName: lesson?.bookedByName ?? '',
          methodLabel: 'תשלום בביט',
          amount: pay.amount,
          context,
        },
        `intent:${pay.id}`,
        consumed.lessonId,
      );
    }
  } catch (err) {
    console.error('[payments] intent notification failed:', err);
  }
  return { ok: true };
}

async function payUrl(lessonId: string): Promise<string> {
  const raw = await createActionToken('pay', lessonId, PAY_TOKEN_TTL_MIN);
  return `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/pay/${raw}`;
}

export interface PaymentRequestsResult {
  requested: number;
  skipped: number;
}

/**
 * Bills every private lesson that ended at least PRIVATE_REQUEST_DELAY_MIN ago
 * and has no payment row yet.
 *
 * The cron is hourly, so the delay is a floor rather than an exact moment — a
 * lesson ending at 17:00 is billed at 18:00. Skipping anything that already has
 * a payment row is what makes re-running safe.
 */
export async function runPaymentRequests(): Promise<PaymentRequestsResult> {
  const now = nowIL();
  const floor = new Date(now.getTime() - PRIVATE_REQUEST_WINDOW_H * 3600_000);

  const due = await db
    .select({ lesson: lessons, student: students })
    .from(lessons)
    .leftJoin(students, eq(students.id, lessons.studentId))
    .leftJoin(payments, eq(payments.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.type, 'individual'),
        eq(lessons.status, 'confirmed'),
        // Started already, and recently enough not to reach into the past.
        lt(lessons.startsAt, now),
        gt(lessons.startsAt, floor),
        isNull(payments.id),
      ),
    )
    .limit(50);

  let requested = 0;
  let skipped = 0;
  for (const { lesson, student } of due) {
    // A zero or missing price is a deliberate exemption, not a debt.
    const amount = lesson.price ?? student?.defaultPrice ?? 0;
    if (!student || amount <= 0) {
      skipped++;
      continue;
    }
    const inserted = await db
      .insert(payments)
      .values({ lessonId: lesson.id, status: 'due', amount })
      .returning();
    try {
      await notifyStudent(
        student,
        'pay_request_individual',
        {
          studentName: student.name,
          datetime: formatILDateTime(lesson.startsAt),
          amount,
          actionUrl: await payUrl(lesson.id),
        },
        `pay-req:${inserted[0].id}`,
        lesson.id,
      );
      requested++;
    } catch (err) {
      console.error('[payments] request failed:', err);
    }
  }
  return { requested, skipped };
}

export interface PaymentConfirmsResult {
  asked: number;
}

/**
 * Asks Ilanit to confirm declarations that have had time to actually happen.
 *
 * Bit is asked a day later; cash waits until the lesson is over, because a
 * parent paying in person has not paid yet when they tap the button. Each
 * payment is asked about once — confirmAskedAt is the guard.
 */
export async function runPaymentConfirms(): Promise<PaymentConfirmsResult> {
  const now = nowIL();
  const bitCutoff = new Date(now.getTime() - BIT_CONFIRM_DELAY_H * 3600_000);

  const pending = await db
    .select({ pay: payments, lesson: lessons })
    .from(payments)
    .innerJoin(lessons, eq(lessons.id, payments.lessonId))
    .where(and(eq(payments.status, 'due'), isNull(payments.confirmAskedAt)))
    .limit(50);

  let asked = 0;
  for (const { pay, lesson } of pending) {
    if (!pay.intent || !pay.intentAt) continue;
    // Only the Bit branch reaches here — a 'paid' declaration is asked about
    // the moment it arrives, and stamped confirmAskedAt on the spot.
    if (pay.intent !== 'bit' || pay.intentAt >= bitCutoff) continue;

    try {
      const raw = await createActionToken('payment', lesson.id, PAY_TOKEN_TTL_MIN);
      await notify(
        'pay_confirm_ilanit',
        env().ILANIT_PHONE,
        {
          studentName: lesson.bookedByName ?? '',
          methodLabel: 'תשלום בביט',
          amount: pay.amount,
          context:
            lesson.type === 'group_session'
              ? 'מפגש קבוצתי'
              : `שיעור ב-${formatILDateTime(lesson.startsAt)}`,
          actionUrl: `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/p/${raw}`,
        },
        `pay-confirm:${pay.id}`,
        lesson.id,
      );
      await db
        .update(payments)
        .set({ confirmAskedAt: new Date() })
        .where(eq(payments.id, pay.id));
      asked++;
    } catch (err) {
      console.error('[payments] confirm ask failed:', err);
    }
  }
  return { asked };
}

export interface OpenDebt {
  studentId: string;
  studentName: string;
  amount: number;
  count: number;
}

/** Everything still unpaid, per student — used by reminders and the assistant. */
export async function openDebts(): Promise<OpenDebt[]> {
  const rows = await db
    .select({ studentId: lessons.studentId, name: students.name, amount: payments.amount })
    .from(payments)
    .innerJoin(lessons, eq(lessons.id, payments.lessonId))
    .leftJoin(students, eq(students.id, lessons.studentId))
    .where(eq(payments.status, 'due'));

  const by = new Map<string, OpenDebt>();
  for (const r of rows) {
    if (!r.studentId) continue;
    const cur = by.get(r.studentId) ?? {
      studentId: r.studentId,
      studentName: r.name ?? '',
      amount: 0,
      count: 0,
    };
    cur.amount += r.amount;
    cur.count += 1;
    by.set(r.studentId, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}
