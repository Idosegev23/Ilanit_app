'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Phone,
  Mail,
  CircleDollarSign,
  Clock,
  StickyNote,
  CalendarDays,
  ReceiptText,
  Download,
  Users,
  Archive,
  Info,
  UserCog,
  PhoneCall,
  MessageCircle,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, StatusPill, type StatusKind } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumCell,
} from '@/components/ui/table';
import { formatShekels, cn } from '@/lib/utils';
import { StudentFormDialog } from '../student-form-dialog';
import { ScheduleLessonDialog } from '../schedule-lesson-dialog';

// Tabbed client file. The page (RSC) pre-aggregates + pre-formats the data into
// plain serializable view-models; this client component renders the profile hero
// header, quick-stat chips, and the section tabs (פרטים · שיעורים · תשלומים ·
// קבלות · קבוצות). The "עריכה" button reopens the shared student form (where the
// private-lesson price lives). RTL, lucide only, focus-visible, 44px targets.

export interface StudentFileVM {
  student: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    receiptLabel: string | null;
    defaultPrice: number | null;
    defaultDurationMin: number;
    notes: string | null;
    archived: boolean;
    autoCollect: boolean;
  };
  lessons: { id: string; when: string; status: StatusKind; price: number | null; payStatus: StatusKind | null }[];
  payments: { id: string; amount: number; status: StatusKind; method: string | null; paidAt: string | null }[];
  receipts: { id: string; number: string; amount: number; pdfUrl: string }[];
  memberships: { groupId: string; groupName: string; active: boolean }[];
  groupBilling: { id: string; month: string; amount: number; status: StatusKind }[];
  settingsDefaultPrice: number | null;
}

type TabId = 'details' | 'lessons' | 'payments' | 'receipts' | 'groups';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

export function StudentFileClient({ file }: { file: StudentFileVM }) {
  const { student } = file;
  const hasGroups = file.memberships.length > 0 || file.groupBilling.length > 0;

  const tabs = React.useMemo(
    () =>
      [
        { id: 'details' as const, label: 'פרטים', icon: Info, count: null },
        { id: 'lessons' as const, label: 'שיעורים', icon: CalendarDays, count: file.lessons.length },
        { id: 'payments' as const, label: 'תשלומים', icon: CircleDollarSign, count: file.payments.length },
        { id: 'receipts' as const, label: 'קבלות', icon: ReceiptText, count: file.receipts.length },
        ...(hasGroups
          ? [{ id: 'groups' as const, label: 'קבוצות', icon: Users, count: file.memberships.length }]
          : []),
      ],
    [file, hasGroups],
  );

  const [active, setActive] = React.useState<TabId>('details');

  // Lifetime collected (paid lessons + paid group billing) — a quick KPI chip.
  const collected = React.useMemo(() => {
    const lessonPaid = file.payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const groupPaid = file.groupBilling
      .filter((b) => b.status === 'paid')
      .reduce((sum, b) => sum + b.amount, 0);
    return lessonPaid + groupPaid;
  }, [file]);

  const outstanding = React.useMemo(() => {
    const lessonsDue = file.payments
      .filter((p) => p.status === 'due')
      .reduce((sum, p) => sum + p.amount, 0);
    const groupDue = file.groupBilling
      .filter((b) => b.status === 'due')
      .reduce((sum, b) => sum + b.amount, 0);
    return lessonsDue + groupDue;
  }, [file]);

  return (
    <div className="space-y-6">
      {/* ── Top bar: back + edit ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* No focus override here — the global :focus-visible ring is the one
            that meets WCAG 2.2, and suppressing it would blind keyboard users. */}
        <Link href="/students" className="shrink-0">
          <Button variant="secondary" size="md">
            <ChevronRight className="size-4" aria-hidden="true" />
            לרשימת התלמידים
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StudentFormDialog
            student={student}
            settingsDefaultPrice={file.settingsDefaultPrice}
            triggerVariant="secondary"
            triggerSize="md"
          />
          {/* Primary admin action: Ilanit sets a lesson for this student herself. */}
          <ScheduleLessonDialog
            student={{
              id: student.id,
              name: student.name,
              defaultPrice: student.defaultPrice,
              defaultDurationMin: student.defaultDurationMin,
            }}
            settingsDefaultPrice={file.settingsDefaultPrice}
            triggerVariant="gradient"
            triggerSize="md"
          />
        </div>
      </div>

      {/*
        ── Profile hero ──
        The blush band is a surface, never a text bed for white: ink on the pink
        stop is 6.2:1, white would be 2.15:1. The archived chip therefore sits on
        a white glass pill with ink text.
      */}
      <Card className="rise relative overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-warm px-5 pb-16 pt-6 sm:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-10 -top-12 size-44 rounded-full bg-white/55 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -start-8 bottom-0 size-32 rounded-full bg-primary-200/70 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="texture-dots pointer-events-none absolute inset-0 opacity-60"
          />
          {student.archived && (
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink shadow-soft ring-1 ring-inset ring-white/70">
              <Archive className="size-3.5" aria-hidden="true" />
              התלמיד/ה בארכיון
            </span>
          )}
        </div>

        <CardBody className="relative -mt-12 px-5 pt-0 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <span
              aria-hidden="true"
              className="flex size-24 shrink-0 items-center justify-center rounded-3xl bg-surface text-2xl font-extrabold tracking-tight text-primary-700 shadow-pop ring-4 ring-surface"
            >
              {initials(student.name)}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
                {student.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                <a
                  href={`tel:${student.phone}`}
                  dir="ltr"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full transition-colors duration-150 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  <span className="tabular-nums">{student.phone}</span>
                </a>
                {student.email && (
                  <a
                    href={`mailto:${student.email}`}
                    dir="ltr"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full transition-colors duration-150 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {student.email}
                  </a>
                )}
              </div>

              {student.guardianPhone && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft/80 px-3 py-1.5 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    ההודעות נשלחות להורה
                    {student.guardianName ? ` (${student.guardianName})` : ''}:{' '}
                    <span dir="ltr" className="tabular-nums">
                      {student.guardianPhone}
                    </span>
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Quick-stat chips */}
          <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat
              index={0}
              icon={CircleDollarSign}
              tone="primary"
              label="מחיר שיעור פרטי"
              value={student.defaultPrice != null ? formatShekels(student.defaultPrice) : '—'}
            />
            <HeroStat
              index={1}
              icon={Clock}
              tone="accent"
              label="משך שיעור"
              value={`${student.defaultDurationMin} דק׳`}
            />
            <HeroStat
              index={2}
              icon={ReceiptText}
              tone="success"
              label="נגבה עד היום"
              value={formatShekels(collected)}
            />
            <HeroStat
              index={3}
              icon={CalendarDays}
              tone={outstanding > 0 ? 'warning' : 'success'}
              label="לתשלום"
              value={formatShekels(outstanding)}
            />
          </div>
        </CardBody>
      </Card>

      {/* ── Tabs ── */}
      <div>
        {/*
          The selected tab uses the ink fill: it is the single highest-emphasis
          state on the page, white on ink is 13.4:1, and it keeps the blush for
          accents instead of spending it on a control that repeats five times.
        */}
        <div
          role="tablist"
          aria-label="חלקי תיק התלמיד"
          className="glass-strong flex gap-1.5 overflow-x-auto rounded-full p-1.5 shadow-soft"
        >
          {tabs.map((t) => {
            const TabIcon = t.icon;
            const selected = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                onClick={() => setActive(t.id)}
                className={cn(
                  // Never shrink: below `sm:` the strip scrolls horizontally
                  // rather than squashing five Hebrew labels into 390px.
                  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
                  selected
                    ? 'bg-ink text-white shadow-card'
                    : 'text-muted hover:bg-primary-50 hover:text-ink',
                )}
              >
                <TabIcon className="size-4" aria-hidden="true" />
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums',
                      selected ? 'bg-white/25 text-white' : 'bg-primary-soft text-primary-700',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {active === 'details' && (
            <Panel id="details">
              <DetailsPanel student={student} settingsDefaultPrice={file.settingsDefaultPrice} />
            </Panel>
          )}
          {active === 'lessons' && (
            <Panel id="lessons">
              <LessonsPanel lessons={file.lessons} />
            </Panel>
          )}
          {active === 'payments' && (
            <Panel id="payments">
              <PaymentsPanel payments={file.payments} />
            </Panel>
          )}
          {active === 'receipts' && (
            <Panel id="receipts">
              <ReceiptsPanel receipts={file.receipts} />
            </Panel>
          )}
          {active === 'groups' && hasGroups && (
            <Panel id="groups">
              <GroupsPanel memberships={file.memberships} groupBilling={file.groupBilling} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ id, children }: { id: TabId; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="motion-safe:animate-fade-in"
    >
      {children}
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  bit: 'ביט',
  cash: 'מזומן',
  transfer: 'העברה',
  other: 'אחר',
};

// ── Panels ──────────────────────────────────────────────────────────────────

function DetailsPanel({
  student,
  settingsDefaultPrice,
}: {
  student: StudentFileVM['student'];
  settingsDefaultPrice: number | null;
}) {
  return (
    <Card>
      <CardBody className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
        <DetailRow icon={Phone} label="טלפון">
          <span dir="ltr" className="tabular-nums">
            {student.phone}
          </span>
        </DetailRow>
        <DetailRow icon={Mail} label="דוא״ל">
          {student.email ? (
            <a
              href={`mailto:${student.email}`}
              dir="ltr"
              className="rounded-full font-medium text-primary-700 underline-offset-4 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {student.email}
            </a>
          ) : (
            <span className="text-muted">—</span>
          )}
        </DetailRow>
        <DetailRow icon={UserCog} label="שם הורה">
          {student.guardianName ? (
            <span>{student.guardianName}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </DetailRow>
        <DetailRow icon={PhoneCall} label="טלפון הורה">
          {student.guardianPhone ? (
            <a
              href={`tel:${student.guardianPhone}`}
              dir="ltr"
              className="rounded-full font-medium tabular-nums text-primary-700 underline-offset-4 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {student.guardianPhone}
            </a>
          ) : (
            <span className="text-muted">—</span>
          )}
        </DetailRow>
        {student.guardianPhone && (
          <div className="sm:col-span-2">
            <p className="flex items-start gap-2 rounded-2xl bg-primary-soft/70 px-4 py-3 text-sm text-primary-700 ring-1 ring-inset ring-white/60">
              <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                כל ההודעות (לינק לתיאום, תזכורות, בקשות תשלום וקבלות) נשלחות לטלפון ההורה.
              </span>
            </p>
          </div>
        )}
        <DetailRow icon={ReceiptText} label="תיאור לקבלה (ברירת מחדל)">
          {student.receiptLabel ? (
            <span>{student.receiptLabel}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </DetailRow>
        <DetailRow icon={CircleDollarSign} label="מחיר לשיעור פרטי">
          {student.defaultPrice != null ? (
            <span className="font-semibold tabular-nums text-ink">
              {formatShekels(student.defaultPrice)}
            </span>
          ) : (
            <span className="text-muted">
              {settingsDefaultPrice != null ? (
                <>
                  ברירת מחדל:{' '}
                  <span className="tabular-nums">{formatShekels(settingsDefaultPrice)}</span>
                </>
              ) : (
                'לא הוגדר'
              )}
            </span>
          )}
        </DetailRow>
        <DetailRow icon={Clock} label="משך שיעור">
          <span className="tabular-nums">{student.defaultDurationMin} דק׳</span>
        </DetailRow>
        <div className="sm:col-span-2">
          <DetailRow icon={StickyNote} label="הערות">
            {student.notes ? (
              <span className="whitespace-pre-wrap leading-relaxed">{student.notes}</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </DetailRow>
        </div>
      </CardBody>
    </Card>
  );
}

function LessonsPanel({ lessons }: { lessons: StudentFileVM['lessons'] }) {
  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="אין שיעורים עדיין"
        description="שיעורים יופיעו כאן לאחר תיאום או יצירה ידנית."
      />
    );
  }
  // `Table` already provides the glass-strong shell + horizontal scroll, so it
  // stands on its own — a Card around it would double the surface. The min-width
  // keeps four columns readable at 390px by scrolling instead of crushing.
  return (
    <Table className="min-w-[520px]">
      <TableHeader>
        <TableRow>
          <TableHead>מועד</TableHead>
          <TableHead>סטטוס שיעור</TableHead>
          <TableHead className="text-end">מחיר</TableHead>
          <TableHead>תשלום</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lessons.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="whitespace-nowrap tabular-nums">{l.when}</TableCell>
            <TableCell>
              <StatusPill status={l.status} />
            </TableCell>
            <TableNumCell>
              {l.price != null ? (
                <span className="font-semibold">{formatShekels(l.price)}</span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </TableNumCell>
            <TableCell>
              {l.payStatus ? <StatusPill status={l.payStatus} /> : <span className="text-muted">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PaymentsPanel({ payments }: { payments: StudentFileVM['payments'] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={CircleDollarSign}
        title="אין תשלומים עדיין"
        description="תשלומים נרשמים אוטומטית לאחר השלמת שיעור."
      />
    );
  }
  return (
    <Table className="min-w-[520px]">
      <TableHeader>
        <TableRow>
          <TableHead className="text-end">סכום</TableHead>
          <TableHead>סטטוס</TableHead>
          <TableHead>אמצעי</TableHead>
          <TableHead>שולם בתאריך</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableNumCell>
              <span className="font-semibold">{formatShekels(p.amount)}</span>
            </TableNumCell>
            <TableCell>
              <StatusPill status={p.status} />
            </TableCell>
            <TableCell>
              {p.method ? (
                <span className="text-muted">{METHOD_LABEL[p.method] ?? p.method}</span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {p.paidAt ? p.paidAt : <span className="text-muted">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReceiptsPanel({ receipts }: { receipts: StudentFileVM['receipts'] }) {
  if (receipts.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="אין קבלות שמורות"
        description="כל קבלה שמופקת נשמרת כאן כעותק PDF להורדה."
      />
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {receipts.map((r) => (
        <li
          key={r.id}
          className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
              <ReceiptText className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                קבלה מס׳{' '}
                <span dir="ltr" className="tabular-nums">
                  {r.number}
                </span>
              </p>
              <p className="text-sm font-medium tabular-nums text-muted">
                {formatShekels(r.amount)}
              </p>
            </div>
          </div>
          <a
            href={r.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-white/80 px-4 text-sm font-semibold text-ink shadow-soft backdrop-blur transition-colors duration-150 hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-ink"
          >
            <Download className="size-4" aria-hidden="true" />
            הורדת PDF
          </a>
        </li>
      ))}
    </ul>
  );
}

function GroupsPanel({
  memberships,
  groupBilling,
}: {
  memberships: StudentFileVM['memberships'];
  groupBilling: StudentFileVM['groupBilling'];
}) {
  return (
    <div className="space-y-6">
      {memberships.length > 0 && (
        <Card>
          <CardBody className="space-y-3 p-5 sm:p-6">
            <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
              <Users className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
              חברות בקבוצות
            </p>
            <ul className="flex flex-wrap gap-2">
              {memberships.map((m) => (
                <li
                  key={m.groupId}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white/70 px-4 py-2 text-sm shadow-soft backdrop-blur"
                >
                  <span className="font-semibold text-ink">{m.groupName}</span>
                  <Badge tone={m.active ? 'success' : 'muted'}>{m.active ? 'פעילה' : 'לא פעילה'}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {groupBilling.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
            <CircleDollarSign className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
            חיובים חודשיים
          </p>
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead>חודש</TableHead>
                <TableHead className="text-end">סכום</TableHead>
                <TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupBilling.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span dir="ltr" className="tabular-nums">
                      {b.month}
                    </span>
                  </TableCell>
                  <TableNumCell>
                    <span className="font-semibold">{formatShekels(b.amount)}</span>
                  </TableNumCell>
                  <TableCell>
                    <StatusPill status={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

// Every tinted glyph chip below uses primary-700 (4.9:1), never primary-600
// (2.8:1 on the blush chip) — an icon that carries meaning needs ≥3:1.
const CHIP_TONE: Record<'primary' | 'accent' | 'success' | 'warning', string> = {
  primary: 'bg-primary-soft text-primary-700',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
};

function HeroStat({
  icon: Icon,
  tone,
  label,
  value,
  index,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  tone: 'primary' | 'accent' | 'success' | 'warning';
  label: string;
  value: string;
  /** Position in the `.stagger` grid — drives the entrance cascade. */
  index: number;
}) {
  return (
    <div
      style={{ '--i': index } as React.CSSProperties}
      className="rounded-2xl border border-line bg-white/70 p-3.5 shadow-soft backdrop-blur transition-shadow duration-200 hover:shadow-card"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl shadow-soft ring-1 ring-inset ring-white/70',
            CHIP_TONE[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 text-xs font-medium text-muted">{label}</p>
      </div>
      <p className="mt-2.5 text-xl font-extrabold tracking-tight tabular-nums text-ink">
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div className="mt-1 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
