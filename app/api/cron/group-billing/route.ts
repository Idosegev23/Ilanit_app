import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/jobs/cron-auth';
import { isQuietNow, quietUntil } from '@/lib/env';
import { nowIL } from '@/lib/time';
import { runGroupBillingOnFirstSession } from '@/lib/jobs';

/*
  Daily safety net for group billing (vercel.json: "0 4 * * *").

  This route used to BE the billing rule: on settings.group_billing_day it
  charged every active group, whether or not that group had met. That is how
  «מתמטיקה עולות לז'» came to be billed ₪650 twice for months in which it never
  met once.

  The rule now lives on the group's own first session of the month, checked
  hourly by /api/cron/tick. This route runs the same job so a tick that failed
  or was skipped still gets a second chance the next morning; it is idempotent,
  so on an ordinary day it finds nothing to do.

  Auth: Authorization: Bearer <CRON_SECRET>.
*/
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  /*
    Quiet window (QUIET_UNTIL): a holiday or a break. Nothing scheduled runs —
    no reminders, no payment requests, no debt notes. It lapses on its own, so
    normal service resumes without anyone having to remember to switch it back.
  */
  if (isQuietNow(nowIL())) {
    return NextResponse.json({ ok: true, quiet: true, until: quietUntil() });
  }

  try {
    const result = await runGroupBillingOnFirstSession();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
