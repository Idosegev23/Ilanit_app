import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/jobs/cron-auth';
import {
  runDayBeforeReminders,
  runCalendarScan,
  runPaymentFollowup,
} from '@/lib/jobs';
import { getSettings } from '@/lib/settings';
import { ilHour, nowIL } from '@/lib/time';

// Hourly cron (vercel.json: "0 * * * *"). Three jobs, each tz-gated in
// Asia/Jerusalem:
//   (א) day-before reminders — only at the hour of settings.reminder_time
//   (ב) calendar scan        — every run, over the trailing window
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
