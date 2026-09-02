import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/jobs/cron-auth';
import {
  runDayBeforeReminders,
  runCalendarScan,
  runPaymentFollowup,
  runGroupBillingOnFirstSession,
} from '@/lib/jobs';
import {
  runPaymentRequests,
  runPaymentConfirms,
  runDeferredPaymentRequests,
} from '@/lib/payments';
import { runReceiptReminders } from '@/lib/jobs/receipt-reminders';
import { reconcileCancellations } from '@/lib/jobs/reconcile-cancellations';
import { getSettings } from '@/lib/settings';
import { ilDayOfMonth, ilHour, nowIL } from '@/lib/time';

// Hourly cron (vercel.json: "0 * * * *"). Jobs, each tz-gated in Asia/Jerusalem:
//   (א) day-before reminders — only at the hour of settings.reminder_time
//   (ב) calendar scan        — every run, over the trailing window
//   (ד) cancellation reconcile — every run; frees slots for lessons Ilanit
//        deleted directly in Google Calendar
//   (ג) payment follow-up    — only once a day, at the reminder hour
// Auth: Authorization: Bearer <CRON_SECRET>.

export const dynamic = 'force-dynamic';

// Trailing calendar-scan window (minutes). Slightly larger than the 60-minute
// cadence so a delayed run can't miss events; idempotency dedupes overlaps.
const SCAN_LOOKBACK_MIN = 90;

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const settings = await getSettings();
  const now = nowIL();
  const currentHour = ilHour(now);
  const reminderHour = Number(String(settings.reminderTime).slice(0, 2));
  const atReminderHour = currentHour === reminderHour;

  const ran: Record<string, unknown> = {};

  // (ב) Calendar scan — every run.
  try {
    const sinceISO = new Date(now.getTime() - SCAN_LOOKBACK_MIN * 60 * 1000).toISOString();
    ran.calendarScan = await runCalendarScan(sinceISO, now.toISOString());
  } catch (err) {
    ran.calendarScanError = err instanceof Error ? err.message : String(err);
  }

  /*
    Collection — every run.

    Requests bill private lessons that ended at least half an hour ago; because
    the cron is hourly that delay is a floor, not an exact moment. Confirms then
    ask Ilanit about declarations that have had time to actually happen. Both
    are idempotent — a lesson with a payment row is skipped, and a payment with
    confirmAskedAt set is never asked about twice — so a re-run costs nothing.
  */
  try {
    ran.paymentRequests = await runPaymentRequests();
  } catch (err) {
    ran.paymentRequestsError = err instanceof Error ? err.message : String(err);
  }
  try {
    ran.paymentConfirms = await runPaymentConfirms();
  } catch (err) {
    ran.paymentConfirmsError = err instanceof Error ? err.message : String(err);
  }

  /*
    Requests held back for a family's pay-day, sent once that day arrives.
    Message-log dedup makes it safe hourly: only charges never actually asked
    about go out, so a request lost to an outage is recovered here too.
  */
  try {
    ran.deferredRequests = await runDeferredPaymentRequests();
  } catch (err) {
    ran.deferredRequestsError = err instanceof Error ? err.message : String(err);
  }

  /*
    Group billing — charged when the group actually MEETS, not on a calendar
    date. Checked every hour so the charge lands during the month's first
    session; idempotent per group and month.
  */
  try {
    ran.groupBilling = await runGroupBillingOnFirstSession();
  } catch (err) {
    ran.groupBillingError = err instanceof Error ? err.message : String(err);
  }

  /*
    Receipt reminders — on the 1st, at the reminder hour. The system issues no
    receipts; this only tells Ilanit which ones are waiting. The message-log
    key is per month, so extra runs that day are no-ops.
  */
  if (ilDayOfMonth(now) === 1 && atReminderHour) {
    try {
      ran.receiptReminders = await runReceiptReminders();
    } catch (err) {
      ran.receiptRemindersError = err instanceof Error ? err.message : String(err);
    }
  }

  // (ד) Cancellation reconcile — every run. Frees slots for future standalone
  // lessons whose Google event Ilanit deleted directly in her calendar.
  try {
    ran.reconcileCancellations = await reconcileCancellations();
  } catch (err) {
    ran.reconcileError = err instanceof Error ? err.message : String(err);
  }

  // (א) Day-before reminders — only at the reminder hour.
  if (atReminderHour) {
    try {
      ran.dayBeforeReminders = await runDayBeforeReminders();
    } catch (err) {
      ran.dayBeforeRemindersError = err instanceof Error ? err.message : String(err);
    }

    // (ג) Payment follow-up — once daily, alongside reminders.
    try {
      ran.paymentFollowup = await runPaymentFollowup();
    } catch (err) {
      ran.paymentFollowupError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({ ok: true, atReminderHour, ran });
}
