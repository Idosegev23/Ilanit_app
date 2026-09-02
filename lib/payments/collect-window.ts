import { ilDayOfMonth, nowIL } from '@/lib/time';

/*
  Whether a family may be asked for money today.

  Some parents pay on a fixed date and asking earlier is not a reminder, it is a
  fortnight of nagging. `collectFromDay` holds that date; until it arrives the
  charge is created and visible to Ilanit, but no request goes out.

  Deliberately about the ASKING only. Nothing here suppresses the debt, the
  reports, or Ilanit's own worklist — a deferred request is still money owed.
*/

export interface CollectWindowStudent {
  collectFromDay: number | null;
}

/** True when a payment request may be sent to this family today. */
export function mayAskToday(
  student: CollectWindowStudent,
  at: Date = nowIL(),
): boolean {
  const from = student.collectFromDay;
  if (from == null) return true;
  return ilDayOfMonth(at) >= from;
}
