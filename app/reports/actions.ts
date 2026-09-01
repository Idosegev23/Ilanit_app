'use server';

import { auth } from '@/auth';
import { runReport, type ReportFilters, type ReportResult } from '@/lib/reports/query';

/**
 * Runs a report for the authenticated owner. Read-only: nothing here writes,
 * bills or settles, so the worst a bad filter can do is show the wrong rows.
 */
export async function runReportAction(
  filters: ReportFilters,
): Promise<{ ok: true; result: ReportResult } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'לא מחובר' };
  try {
    return { ok: true, result: await runReport(filters) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאה בהרצת הדוח' };
  }
}
