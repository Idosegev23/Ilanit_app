import Link from 'next/link';
import type { CSSProperties } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { StatCard, type StatTone } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { ilHour, nowIL } from '@/lib/time';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  SendBookingLinkDialog,
  type BookingLinkStudent,
} from '@/components/ui/send-booking-link-dialog';
import { StatusPill } from '@/components/ui/badge';
import { cn, formatShekels } from '@/lib/utils';
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

/*
  Tone → chip recipe, shared by every small glyph badge on this page.
  The primary tone deliberately uses primary-700 (#b84a7b, 4.9:1 on the blush
  chip) rather than primary/primary-600: a meaningful icon needs ≥3:1, and
  #f493be on a light chip is 2.15:1.
*/
const CHIP_TONE: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary-700',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

// ── Section heading — icon chip + bold title + a hairline that runs to the edge ─
function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

// ── KPI row ────────────────────────────────────────────────────────────────
function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const totalLessons = Object.values(kpis.lessonsByStatus).reduce((s, n) => s + n, 0);
  return (
    <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <StatCard
        style={{ '--i': 0 } as CSSProperties}
        label="הכנסות (30 ימים)"
        value={formatShekels(kpis.revenue)}
        icon={Wallet}
        tone="primary"
      />
      <StatCard
        style={{ '--i': 1 } as CSSProperties}
        label="שיעורים"
        value={totalLessons}
        hint={lessonsByStatusSummary(kpis.lessonsByStatus)}
        icon={CalendarCheck}
        tone="accent"
      />
      <StatCard
        style={{ '--i': 2 } as CSSProperties}
        label="אחוז תפוסה"
        value={`${kpis.occupancyPct}%`}
        icon={Gauge}
        tone="success"
      />
      <StatCard
        style={{ '--i': 3 } as CSSProperties}
        label="תלמידים פעילים"
        value={kpis.activeStudents}
        icon={Users}
        tone="primary"
      />
      {/* Five tiles over a two-column phone grid leaves an orphan — let the
          money tile span the full width instead of stranding half a row. */}
      <StatCard
        style={{ '--i': 4 } as CSSProperties}
        className="col-span-2 lg:col-span-1"
        label="חובות פתוחים"
        value={formatShekels(kpis.outstandingAmount)}
        hint={`${kpis.outstandingCount} תשלומים`}
        icon={AlertCircle}
        tone={kpis.outstandingCount > 0 ? 'warning' : 'success'}
      />
    </div>
  );
}

// ── Chart card (tinted header + icon chip) ───────────────────────────────────
function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader variant="gradient" className="flex-row items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

// ── Action-list scaffolding ──────────────────────────────────────────────────
function ActionCard({
  title,
  icon: Icon,
  tone,
  count,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: StatTone;
  count: number;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader variant="tint" className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl shadow-soft ring-1 ring-inset ring-white/70',
              CHIP_TONE[tone],
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <span>{title}</span>
          {count > 0 && (
            <Badge tone={tone} className="tabular-nums">
              {count}
            </Badge>
          )}
        </CardTitle>
        {href && (
          <Link
            href={href}
            className="-me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-primary-700 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {hrefLabel}
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex-1 pt-4">{children}</CardContent>
    </Card>
  );
}

/** A single action row: avatar-initial chip + name + meta + trailing slot. */
function ActionRow({
  name,
  meta,
  tone = 'primary',
  trailing,
}: {
  name: string;
  meta: React.ReactNode;
  tone?: StatTone;
  trailing: React.ReactNode;
}) {
  const initial = name.trim().charAt(0) || '•';
  return (
    <li className="-mx-2 flex min-h-[56px] items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-150 hover:bg-primary-50/70">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset ring-white/70',
          CHIP_TONE[tone],
        )}
      >
        {initial}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold leading-tight text-ink">{name}</span>
        <span className="text-xs tabular-nums text-muted">{meta}</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div>
    </li>
  );
}

function UpcomingList({ rows }: { rows: ActionLessonRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState
        icon={CalendarClock}
        title="אין שיעורים קרובים"
        description="כשייקבעו שיעורים חדשים הם יופיעו כאן."
        className="py-10"
      />
    );
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <ActionRow
          key={r.id}
          name={r.studentName}
          tone="primary"
          meta={formatILDayTime(r.startsAt)}
          trailing={<StatusPill status="confirmed" />}
        />
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
        className="py-10"
      />
    );
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <ActionRow
          key={r.paymentId}
          name={r.studentName}
          tone="warning"
          meta={formatILShort(r.startsAt)}
          trailing={
            <>
              <span className="font-bold tabular-nums text-ink">
                {formatShekels(r.amount)}
              </span>
              <StatusPill status="due" />
            </>
          }
        />
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
    phone: s.phone ?? '',
  }));

  // Personal, time-of-day greeting — this system is Ilanit's alone.
  const hour = ilHour(nowIL());
  const greeting =
    hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';

  return (
    <div className="space-y-10">
      <PageHeader
        className="rise"
        eyebrow="המערכת שלך"
        title={`${greeting}, אילנית 🌸`}
        subtitle="הנה מה שקורה אצלך ב-30 הימים האחרונים — ההכנסות, התפוסה והפעולות שממתינות לך."
        actions={
          <SendBookingLinkDialog students={dialogStudents} className="w-full sm:w-auto" />
        }
      />

      {/*
        Hero action — send a PERSONAL booking link to a student.
        v4 carries this on the blush→peach ramp with INK text throughout: ink is
        6.2:1 on the pink stop and 9.7:1 on the peach one, so the whole panel
        clears AA without the scrim stack the old sage gradient needed. The old
        deep-teal blob and rgba scrim are gone with it.
        `.blob` sits at z-index 0, so the content column is explicitly `z-10`.
      */}
      <section className="rise relative isolate overflow-hidden rounded-3xl border border-white/60 bg-gradient-warm p-6 shadow-pop sm:p-9">
        <span aria-hidden="true" className="blob -top-24 start-[-70px] size-72 bg-white/60" />
        <span aria-hidden="true" className="blob -bottom-28 end-[-50px] size-80 bg-primary-200/80" />
        <div
          aria-hidden="true"
          className="texture-dots pointer-events-none absolute inset-0 z-0 opacity-70"
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            {/* Ink chip: the one place white text is safe here (13.4:1). */}
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-pop">
              <Send className="size-6" aria-hidden="true" />
            </span>
            <div className="max-w-xl">
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink">
                פעולה מהירה
              </p>
              <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
                שליחת לינק לתיאום
              </h2>
              <p className="mt-2.5 text-sm font-medium leading-relaxed text-ink">
                בחרי תלמיד/ה (או הוסיפי חדש/ה) ונשלח לו/ה לינק אישי לתיאום שיעור בוואטסאפ —
                הדרך המהירה למלא את הלו&quot;ז.
              </p>
            </div>
          </div>
          <SendBookingLinkDialog
            students={dialogStudents}
            triggerVariant="secondary"
            className="w-full shrink-0 lg:w-auto"
          />
        </div>
      </section>

      <KpiRow kpis={data.kpis} />

      {/* Charts */}
      <section className="space-y-5">
        <SectionTitle icon={TrendingUp} title="ניתוח ומגמות" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <ChartCard
            title="הכנסה לאורך זמן"
            subtitle="סך התשלומים שהתקבלו בכל יום"
            icon={TrendingUp}
          >
            <RevenueChart data={data.charts.revenueByDay} />
          </ChartCard>
          <ChartCard
            title="שיעורים לשבוע"
            subtitle="מספר השיעורים שנקבעו בכל שבוע"
            icon={CalendarCheck}
          >
            <LessonsPerWeekChart data={data.charts.lessonsPerWeek} />
          </ChartCard>
          <ChartCard
            title="מגמת תפוסה לפי יום"
            subtitle="התפלגות השיעורים על פני ימי השבוע"
            icon={CalendarDays}
          >
            <OccupancyTrendChart data={data.charts.weekdayDistribution} />
          </ChartCard>
          <ChartCard
            title="תלמידים מובילים"
            subtitle="התלמידים עם מירב השיעורים בתקופה"
            icon={Users}
          >
            <TopStudentsChart data={data.charts.topStudents} />
          </ChartCard>
        </div>
      </section>

      {/* AI insights */}
      <Card className="overflow-hidden">
        <CardHeader variant="gradient" className="flex-row items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-text shadow-soft ring-1 ring-inset ring-white/70">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>תובנות AI</CardTitle>
            <CardDescription>
              ניתוח חכם של הלו&quot;ז וההכנסות שלך, מבוסס נתוני 30 הימים האחרונים.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <InsightsPanel
            periodDays={PERIOD_DAYS}
            initialText={cached?.text ?? null}
            initialGeneratedAt={cached ? formatILShort(cached.generatedAt) : null}
            initialModel={cached?.model ?? null}
          />
        </CardContent>
      </Card>

      {/* Action lists */}
      <section className="space-y-5">
        <SectionTitle icon={ClipboardCheck} title="פעולות פתוחות" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <ActionCard
            title="שיעורי השבוע"
            icon={CalendarClock}
            tone="primary"
            count={data.actions.todayUpcoming.length}
          >
            <UpcomingList rows={data.actions.todayUpcoming} />
          </ActionCard>
          <ActionCard
            title="טרם שולמו"
            icon={CircleDollarSign}
            tone="warning"
            count={data.actions.unpaid.length}
          >
            <UnpaidList rows={data.actions.unpaid} />
          </ActionCard>
        </div>
      </section>
    </div>
  );
}
