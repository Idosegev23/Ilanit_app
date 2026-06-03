import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/jobs/cron-auth';
import { runGroupBilling } from '@/lib/jobs';
import { getSettings } from '@/lib/settings';
import { nowIL, toILDateStr } from '@/lib/time';

// Daily cron (vercel.json: "0 4 * * *"). Runs monthly group billing ONLY on
// the configured day-of-month (settings.group_billing_day, default 1) in
// Asia/Jerusalem. Auth: Authorization: Bearer <CRON_SECRET>.

export const dynamic = 'force-dynamic';

/** Day-of-month (1-31) in Asia/Jerusalem. */
function ilDayOfMonth(date: Date): number {
  // toILDateStr → yyyy-MM-dd; the day component is the IL calendar day.
  return Number(toILDateStr(date).slice(8, 10));
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const settings = await getSettings();
  const today = ilDayOfMonth(nowIL());
  const isBillingDay = today === settings.groupBillingDay;

  if (!isBillingDay) {
    return NextResponse.json({ ok: true, isBillingDay, day: today });
  }

  try {
    const result = await runGroupBilling();
    return NextResponse.json({ ok: true, isBillingDay, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, isBillingDay, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
