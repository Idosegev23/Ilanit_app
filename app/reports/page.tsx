import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ReportsView } from './ReportsView';
import { loadReportOptions, runReport } from '@/lib/reports/query';
import { presetsFor } from '@/lib/reports/presets';
import { nowIL } from '@/lib/time';

/*
  Reports (/reports) — the in-app replacement for the free-text questions that
  used to live in the WhatsApp bot. Server-renders the first answer so the page
  is useful before any interaction; every later change re-runs through the
  server action.
*/
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  // The middleware only checks that a session cookie is PRESENT; validating it
  // is the page's job.
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/reports');

  const presets = presetsFor(nowIL());
  const initialPreset = presets[0];
  const [options, initial] = await Promise.all([
    loadReportOptions(),
    runReport(initialPreset.filters),
  ]);

  return (
    <ReportsView
      students={options.students}
      groups={options.groups}
      presets={presets}
      initialPresetId={initialPreset.id}
      initialResult={initial}
    />
  );
}
