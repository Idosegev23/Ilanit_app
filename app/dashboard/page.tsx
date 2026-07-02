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
import { buttonVariants } from '@/components/ui/button';
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

// ── KPI row ────────────────────────────────────────────────────────────────
function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const totalLessons = Object.values(kpis.lessonsByStatus).reduce((s, n) => s + n, 0);
  return (
    <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-5">
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
      <StatCard
        style={{ '--i': 4 } as CSSProperties}
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
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
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
  const chipTone: Record<StatTone, string> = {
    primary: 'bg-primary-soft text-primary-600',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader variant="tint" className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl shadow-soft',
              chipTone[tone],
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
            className="-me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-primary-600 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
  const chipTone: Record<StatTone, string> = {
    primary: 'bg-primary-soft text-primary-600',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  const initial = name.trim().charAt(0) || '•';
  return (
    <li className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-cream/70">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          chipTone[tone],
        )}
      >
        {initial}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium leading-tight text-ink">{name}</span>
        <span className="text-xs tabular-nums text-muted">{meta}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{trailing}</div>
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
              <span className="font-semibold tabular-nums text-ink">
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="המערכת שלך"
        title={`${greeting}, אילנית 🌸`}
        subtitle="הנה מה שקורה אצלך ב-30 הימים האחרונים — ההכנסות, התפוסה והפעולות שממתינות לך."
        actions={
          <SendBookingLinkDialog students={dialogStudents} className="w-full sm:w-auto" />
        }
      />

      {/* Hero action — send a PERSONAL booking link to a student. */}
      <Card className="relative isolate overflow-hidden rounded-3xl border-transparent bg-gradient-warm text-primary-fg shadow-pop">
        {/* decorative warm blobs + dotted relief — no empty void */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 texture-dots opacity-60" />
        <span
          aria-hidden="true"
          className="blob -top-16 start-[-40px] size-56 bg-white/30"
        />
        <span
          aria-hidden="true"
          className="blob -bottom-20 end-[-30px] size-64 bg-[#1f5249]/50"
        />
        {/*
          Contrast scrim — the 135deg calm ramp brightens toward the bottom-end
          (sage → sand) where bare white text drops below AA. The text column is
          anchored at the inline-start (visual right in RTL), so we darken the
          start band + bottom with a deep-teal ink scrim. After compositing,
          white body text clears ≥4.5:1 at any card width.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_left,rgba(18,48,43,0.52)_0%,rgba(18,48,43,0.48)_50%,rgba(18,48,43,0.1)_82%,rgba(18,48,43,0)_100%)]"
        />
        <CardContent className="relative z-10 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-primary-fg shadow-[0_8px_24px_-8px_rgba(18,48,43,0.5)] ring-1 ring-white/40 backdrop-blur-sm">
              <Send className="size-6" aria-hidden="true" />
            </span>
            <div className="max-w-md">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-fg/80">
                פעולה מהירה
              </p>
              <h2 className="text-2xl font-bold leading-tight drop-shadow-[0_1px_2px_rgba(18,48,43,0.35)]">
                שליחת לינק לתיאום
              </h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-primary-fg drop-shadow-[0_1px_3px_rgba(18,48,43,0.5)]">
                בחרי תלמיד/ה (או הוסיפי חדש/ה) ונשלח לו/ה לינק אישי לתיאום שיעור בוואטסאפ —
                הדרך המהירה למלא את הלו&quot;ז.
              </p>
            </div>
          </div>
          <SendBookingLinkDialog
            students={dialogStudents}
            triggerVariant="secondary"
            className="w-full shrink-0 sm:w-auto"
          />
        </CardContent>
      </Card>

      <KpiRow kpis={data.kpis} />

      {/* Charts */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          <TrendingUp className="size-4 text-primary-600" aria-hidden="true" />
          ניתוח ומגמות
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text shadow-soft">
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
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          <ClipboardCheck className="size-4 text-primary-600" aria-hidden="true" />
          פעולות פתוחות
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
