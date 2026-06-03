import Link from 'next/link';
import {
  Wallet,
  CalendarCheck,
  Gauge,
  AlertCircle,
  Users,
  TrendingUp,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  CircleDollarSign,
  Sparkles,
  Send,
  ChevronLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonVariants } from '@/components/ui/button';
import {
  SendBookingLinkDialog,
  type BookingLinkStudent,
} from '@/components/ui/send-booking-link-dialog';
import { StatusPill } from '@/components/ui/badge';
import { formatShekels } from '@/lib/utils';
import { getDashboardData } from '@/lib/insights/metrics';
import { listStudents } from '@/lib/students';
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

function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const totalLessons = Object.values(kpis.lessonsByStatus).reduce((s, n) => s + n, 0);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard
        label="הכנסות (30 ימים)"
        value={formatShekels(kpis.revenue)}
        icon={Wallet}
      />
      <StatCard
        label="שיעורים"
        value={totalLessons}
        hint={lessonsByStatusSummary(kpis.lessonsByStatus)}
        icon={CalendarCheck}
      />
      <StatCard
        label="אחוז תפוסה"
        value={`${kpis.occupancyPct}%`}
        icon={Gauge}
      />
      <StatCard
        label="תלמידים פעילים"
        value={kpis.activeStudents}
        icon={Users}
      />
      <StatCard
        label="חובות פתוחים"
        value={formatShekels(kpis.outstandingAmount)}
        hint={`${kpis.outstandingCount} תשלומים`}
        icon={AlertCircle}
      />
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5 text-primary-600" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function UpcomingList({ rows }: { rows: ActionLessonRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState
        icon={CalendarClock}
        title="אין שיעורים קרובים"
        description="כשייקבעו שיעורים חדשים הם יופיעו כאן."
      />
    );
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-3">
          <span className="truncate font-medium text-ink">{r.studentName}</span>
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {formatILDayTime(r.startsAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PendingList({ rows }: { rows: ActionLessonRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="אין בקשות הממתינות לאישור"
        description="בקשות תיאום חדשות יופיעו כאן לאישור."
      />
    );
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium text-ink">{r.studentName}</span>
            <span className="text-xs tabular-nums text-muted">
              {formatILShort(r.startsAt)}
            </span>
          </div>
          <Link
            href={`/lessons?lesson=${r.id}`}
            aria-label={`אישור שיעור עבור ${r.studentName}`}
            className={buttonVariants({ size: 'sm', variant: 'primary' })}
          >
            <ClipboardCheck className="size-4" aria-hidden="true" />
            אישור
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UnpaidList({ rows }: { rows: UnpaidRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState
        icon={CircleDollarSign}
        title="כל התשלומים סגורים"
        description="אין חובות פתוחים — כל הכבוד!"
      />
    );
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.paymentId} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium text-ink">{r.studentName}</span>
            <span className="text-xs tabular-nums text-muted">
              {formatILShort(r.startsAt)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status="due" />
            <span className="font-semibold tabular-nums text-ink">
              {formatShekels(r.amount)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const [data, cached, studentRows] = await Promise.all([
    getDashboardData(PERIOD_DAYS),
    getCachedInsights(PERIOD_DAYS),
    listStudents(),
  ]);

  const dialogStudents: BookingLinkStudent[] = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="דשבורד"
        subtitle="סקירת ההכנסות, התפוסה והפעולות הפתוחות שלך ב-30 הימים האחרונים."
      />

      {/* Prominent action — send a PERSONAL booking link to a student. */}
      <Card className="border-primary-100 bg-primary-soft/60">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg">
              <Send className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">שליחת לינק לתיאום</h2>
              <p className="mt-1 text-sm text-muted">
                בחרי תלמיד/ה (או הוסיפי חדש/ה) ונשלח לו/ה לינק אישי לתיאום שיעור בוואטסאפ.
              </p>
            </div>
          </div>
          <SendBookingLinkDialog
            students={dialogStudents}
            className="w-full sm:w-auto"
          />
        </CardContent>
      </Card>

      <KpiRow kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="הכנסה לאורך זמן" icon={TrendingUp}>
          <RevenueChart data={data.charts.revenueByDay} />
        </ChartCard>
        <ChartCard title="שיעורים לשבוע" icon={CalendarCheck}>
          <LessonsPerWeekChart data={data.charts.lessonsPerWeek} />
        </ChartCard>
        <ChartCard title="מגמת תפוסה לפי יום" icon={CalendarDays}>
          <OccupancyTrendChart data={data.charts.weekdayDistribution} />
        </ChartCard>
        <ChartCard title="תלמידים מובילים" icon={Users}>
          <TopStudentsChart data={data.charts.topStudents} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent-text" aria-hidden="true" />
            תובנות AI
          </CardTitle>
          <CardDescription>
            ניתוח חכם של הלו&quot;ז וההכנסות שלך, מבוסס נתוני 30 הימים האחרונים.
          </CardDescription>
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
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary-600" aria-hidden="true" />
              שיעורי השבוע הקרוב
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UpcomingList rows={data.actions.todayUpcoming} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="size-5 text-primary-600" aria-hidden="true" />
                ממתינים לאישור
              </span>
              <Link
                href="/lessons"
                className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-primary-600 transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                לכל השיעורים
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PendingList rows={data.actions.pendingApprovals} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="size-5 text-primary-600" aria-hidden="true" />
              טרם שולמו
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UnpaidList rows={data.actions.unpaid} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
