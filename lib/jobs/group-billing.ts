import { generateMonthlyBilling } from '@/lib/groups';
import { startOfDayIL, nowIL, toILDateStr } from '@/lib/time';

// Monthly group billing. Delegates the heavy lifting to lib/groups
// (generateMonthlyBilling), which creates due rows, sends per-member payment
// requests and the roster link to Ilanit. This job computes the billing month
// (the first of the CURRENT Asia/Jerusalem month) and is only invoked by the
// group-billing cron when today === settings.group_billing_day.

export interface GroupBillingResult {
  monthISO: string;
  created: number;
}

/** First-of-month ISO date string (yyyy-MM-dd) for the current IL month. */
function currentMonthISO(): string {
  const today = toILDateStr(startOfDayIL(nowIL())); // yyyy-MM-dd
  return `${today.slice(0, 7)}-01`;
}

/**
 * Generates this month's group billing via lib/groups. Returns the billing
 * month and the number of `group_billing` rows created.
 */
export async function runGroupBilling(monthISO?: string): Promise<GroupBillingResult> {
  const month = monthISO ?? currentMonthISO();
  const { created } = await generateMonthlyBilling(month);
  return { monthISO: month, created };
}
