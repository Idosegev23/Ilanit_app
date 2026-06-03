import Link from 'next/link';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatShekels } from '@/lib/utils';
import { getDashboardData } from '@/lib/insights/metrics';
import { getCachedInsights } from '@/lib/insights';
import { InsightsPanel } from './insights-panel';
import {
  RevenueChart,
  LessonsPerWeekChart,
  OccupancyTrendChart,
  TopStudentsChart,
} from './charts';
import { lessonsByStatusSummary, formatILDayTime, formatILShort } from './format';
import type {
  ActionLessonRow,
  UnpaidRow,
  DashboardKpis,
} from '@/lib/insights/metrics';

// The dashboard always renders fresh DB-derived KPIs/charts/lists on each load.
// AI insights are NOT generated here (no OpenAI call on load) — only the cached
// text is read; regeneration is an explicit action in the InsightsPanel.
export const dynamic = 'force-dynamic';

const PERIOD_DAYS = 30;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Kpi label="הכנסות (30 ימים)" value={formatShekels(kpis.revenue)} />
      <Kpi
        label="שיעורים"
        value={String(
          Object.values(kpis.lessonsByStatus).reduce((s, n) => s + n, 0),
        )}
        hint={lessonsByStatusSummary(kpis.lessonsByStatus)}
      />
      <Kpi label="אחוז תפוסה" value={`${kpis.occupancyPct}%`} />
      <Kpi label="תלמידים פעילים" value={String(kpis.activeStudents)} />
      <Kpi
        label="חובות פתוחים"
        value={formatShekels(kpis.outstandingAmount)}
        hint={`${kpis.outstandingCount} תשלומים`}
      />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function UpcomingList({ rows }: { rows: ActionLessonRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-slate-500">אין שיעורים קרובים.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
          <span className="font-medium text-slate-800">{r.studentName}</span>
          <span className="text-slate-500">{formatILDayTime(r.startsAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function PendingList({ rows }: { rows: ActionLessonRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-slate-500">אין בקשות הממתינות לאישור.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
          <div className="flex flex-col">
            <span className="font-medium text-slate-800">{r.studentName}</span>
            <span className="text-xs text-slate-400">{formatILShort(r.startsAt)}</span>
          </div>
          <Link
            href={`/lessons?lesson=${r.id}`}
            className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
          >
            אישור
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UnpaidList({ rows }: { rows: UnpaidRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-slate-500">כל התשלומים סגורים. כל הכבוד!</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.paymentId} className="flex items-center justify-between py-2 text-sm">
          <div className="flex flex-col">
            <span className="font-medium text-slate-800">{r.studentName}</span>
            <span className="text-xs text-slate-400">{formatILShort(r.startsAt)}</span>
          </div>
          <span className="font-semibold text-red-600">{formatShekels(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData(PERIOD_DAYS);
  const cached = await getCachedInsights(PERIOD_DAYS);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <h1 className="text-2xl font-bold text-slate-900">דשבורד</h1>

        <KpiRow kpis={data.kpis} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="הכנסה לאורך זמן">
            <RevenueChart data={data.charts.revenueByDay} />
          </ChartCard>
          <ChartCard title="שיעורים לשבוע">
            <LessonsPerWeekChart data={data.charts.lessonsPerWeek} />
          </ChartCard>
          <ChartCard title="מגמת תפוסה לפי יום">
            <OccupancyTrendChart data={data.charts.weekdayDistribution} />
          </ChartCard>
          <ChartCard title="תלמידים מובילים">
            <TopStudentsChart data={data.charts.topStudents} />
          </ChartCard>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>תובנות AI</CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsPanel
              periodDays={PERIOD_DAYS}
              initialText={cached?.text ?? null}
              initialGeneratedAt={cached ? formatILShort(cached.generatedAt) : null}
              initialModel={cached?.model ?? null}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>שיעורי השבוע הקרוב</CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingList rows={data.actions.todayUpcoming} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ממתינים לאישור</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingList rows={data.actions.pendingApprovals} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>טרם שולמו</CardTitle>
            </CardHeader>
            <CardContent>
              <UnpaidList rows={data.actions.unpaid} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
