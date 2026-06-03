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
    defaultPrice: number | null;
    defaultDurationMin: number;
    notes: string | null;
    archived: boolean;
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
      <div className="flex items-center justify-between gap-3">
        <Link href="/students">
          <Button variant="secondary" size="md">
            <ChevronRight className="size-4" aria-hidden="true" />
            לרשימת התלמידים
          </Button>
        </Link>
        <StudentFormDialog
          student={student}
          settingsDefaultPrice={file.settingsDefaultPrice}
          triggerVariant="secondary"
          triggerSize="md"
        />
      </div>

      {/* ── Profile hero ── */}
      <Card className="relative overflow-hidden">
        <div className="relative bg-gradient-warm px-6 pb-16 pt-6 sm:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-10 -top-12 size-44 rounded-full bg-white/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -start-8 bottom-0 size-32 rounded-full bg-white/10 blur-2xl"
          />
          {student.archived && (
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/30">
              <Archive className="size-3.5" aria-hidden="true" />
              התלמיד/ה בארכיון
            </span>
          )}
        </div>

        <CardBody className="relative -mt-12 px-6 pt-0 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <span
              aria-hidden="true"
              className="flex size-24 shrink-0 items-center justify-center rounded-3xl bg-surface text-2xl font-bold text-primary-600 shadow-pop ring-4 ring-surface"
            >
              {initials(student.name)}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-bold leading-tight text-ink sm:text-3xl">
                {student.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                <a
                  href={`tel:${student.phone}`}
                  dir="ltr"
                  className="inline-flex items-center gap-1.5 rounded transition-colors duration-150 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  <span className="tabular-nums">{student.phone}</span>
                </a>
                {student.email && (
                  <a
                    href={`mailto:${student.email}`}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 rounded transition-colors duration-150 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {student.email}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Quick-stat chips */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat
              icon={CircleDollarSign}
              tone="primary"
              label="מחיר שיעור פרטי"
              value={student.defaultPrice != null ? formatShekels(student.defaultPrice) : '—'}
            />
            <HeroStat
              icon={Clock}
              tone="accent"
              label="משך שיעור"
              value={`${student.defaultDurationMin} דק׳`}
            />
            <HeroStat
              icon={ReceiptText}
              tone="success"
              label="נגבה עד היום"
              value={formatShekels(collected)}
            />
            <HeroStat
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
        <div
          role="tablist"
          aria-label="חלקי תיק התלמיד"
          className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-soft"
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
                  'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-none',
                  selected
                    ? 'bg-gradient-warm text-white shadow-card'
                    : 'text-muted hover:bg-primary-50 hover:text-ink',
                )}
              >
                <TabIcon className="size-4" aria-hidden="true" />
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      selected ? 'bg-white/25 text-white' : 'bg-primary-soft text-primary-600',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
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
      <CardBody className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
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
              className="rounded text-primary-600 underline-offset-2 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {student.email}
            </a>
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
  return (
    <Card className="overflow-hidden">
      <Table>
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
              <TableCell>{l.when}</TableCell>
              <TableCell>
                <StatusPill status={l.status} />
              </TableCell>
              <TableNumCell>
                {l.price != null ? (
                  <span className="font-medium">{formatShekels(l.price)}</span>
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
    </Card>
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
    <Card className="overflow-hidden">
      <Table>
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
                <span className="font-medium">{formatShekels(p.amount)}</span>
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
              <TableCell>
                {p.paidAt ? p.paidAt : <span className="text-muted">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
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
    <Card>
      <CardBody>
        <ul className="divide-y divide-line">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
                  <ReceiptText className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    קבלה מס׳{' '}
                    <span dir="ltr" className="tabular-nums">
                      {r.number}
                    </span>
                  </p>
                  <p className="text-sm tabular-nums text-muted">{formatShekels(r.amount)}</p>
                </div>
              </div>
              <a
                href={r.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-soft transition-colors duration-150 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-primary"
              >
                <Download className="size-4" aria-hidden="true" />
                הורדת PDF
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
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
    <Card>
      <CardBody className="space-y-6">
        {memberships.length > 0 && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted">
              <Users className="size-4" aria-hidden="true" />
              חברות בקבוצות
            </p>
            <ul className="flex flex-wrap gap-2">
              {memberships.map((m) => (
                <li
                  key={m.groupId}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-cream/50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-ink">{m.groupName}</span>
                  <Badge tone={m.active ? 'success' : 'muted'}>{m.active ? 'פעילה' : 'לא פעילה'}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {groupBilling.length > 0 && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted">
              <CircleDollarSign className="size-4" aria-hidden="true" />
              חיובים חודשיים
            </p>
            <div className="overflow-hidden rounded-2xl border border-line">
              <Table>
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
                        <span className="font-medium">{formatShekels(b.amount)}</span>
                      </TableNumCell>
                      <TableCell>
                        <StatusPill status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function HeroStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  tone: 'primary' | 'accent' | 'success' | 'warning';
  label: string;
  value: string;
}) {
  const chip = {
    primary: 'bg-primary-soft text-primary-600',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-3.5">
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 items-center justify-center rounded-lg', chip)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="text-xs font-medium text-muted">{label}</p>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums text-ink">{value}</p>
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
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="mt-1 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
