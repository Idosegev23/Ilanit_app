import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  Undo2,
  Users,
  Wallet,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill, type StatusKind } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumCell,
} from '@/components/ui/table';
import { getGroup, rosterFor, groupReceiptLabel } from '@/lib/groups';
import { receiptsEnabled } from '@/lib/env';
import { formatShekels } from '@/lib/utils';
import { toILMonthStr } from '@/lib/groups/month';
import { markPaidAction, markUnpaidAction } from '@/app/groups/actions';
import { ReceiptDescriptionField } from './receipt-description-field';

// Monthly billing roster for a group: Ilanit marks each member paid / unpaid.
// Marking paid issues a Morning receipt (PDF) and sends it as a WhatsApp
// attachment to the member.
export const dynamic = 'force-dynamic';

const METHODS: Array<{ value: string; label: string }> = [
  { value: 'bit', label: 'ביט' },
  { value: 'cash', label: 'מזומן' },
  { value: 'transfer', label: 'העברה' },
  { value: 'other', label: 'אחר' },
];

// Map a stored billing status to a known StatusPill kind (fallback → due).
function pillStatus(status: string): StatusKind {
  if (status === 'paid' || status === 'waived' || status === 'due') return status;
  return 'due';
}

export default async function GroupBillingRosterPage({
  params,
}: {
  params: Promise<{ id: string; month: string }>;
}) {
  const { id, month } = await params;
  const group = await getGroup(id);
  if (!group) notFound();

  let monthLabel: string;
  try {
    monthLabel = toILMonthStr(month);
  } catch {
    notFound();
  }

  const roster = await rosterFor(id, month);
  // Off by default — the roster must not offer a document it will not issue.
  const withReceipt = receiptsEnabled();
  const paidCount = roster.filter((r) => r.status === 'paid').length;
  const totalDue = roster
    .filter((r) => r.status === 'due')
    .reduce((sum, r) => sum + r.amount, 0);
  const collected = roster
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + r.amount, 0);
  const paidPct =
    roster.length > 0 ? Math.round((paidCount / roster.length) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="rise">
        <Link
          href={`/groups/${id}`}
          className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
          {group.name}
        </Link>

        <PageHeader
          eyebrow="רוסטר חיוב"
          title={`חיוב חודשי — ${monthLabel}`}
          subtitle={`${group.name} · ${formatShekels(group.monthlyPrice)} לחבר`}
        />
      </div>

      {roster.length > 0 && (
        <>
          <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="שילמו"
              value={
                <span>
                  {paidCount}
                  <span className="text-base font-medium text-muted">
                    {' '}
                    / {roster.length}
                  </span>
                </span>
              }
              icon={CheckCircle2}
              tone="success"
              hint={`${paidPct}% מהחברוֹת`}
            />
            <StatCard
              label="נגבה החודש"
              value={formatShekels(collected)}
              icon={Wallet}
              tone="primary"
              hint="סך התקבולים שאושרו"
            />
            <StatCard
              label="חוב פתוח"
              value={formatShekels(totalDue)}
              icon={CircleDollarSign}
              tone="warning"
              hint="סכום שטרם נגבה"
            />
            <StatCard
              label="סך חברוֹת"
              value={roster.length}
              icon={Users}
              tone="accent"
            />
          </div>

          {/* Collection progress — at-a-glance how close the month is to fully paid. */}
          <div className="glass rounded-2xl p-5 sm:p-6">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <p className="text-sm font-semibold text-ink">התקדמות גבייה</p>
              <p className="text-2xl font-extrabold leading-none tracking-tight tabular-nums text-primary-700">
                {paidPct}%
              </p>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-primary-50 ring-1 ring-inset ring-primary-100"
              role="progressbar"
              aria-valuenow={paidPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="אחוז החברוֹת ששילמו"
            >
              <div
                className="h-full rounded-full bg-gradient-warm shadow-glow transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </>
      )}

      <Card solid className="overflow-hidden">
        <CardHeader variant="gradient">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
              <Receipt className="size-5" aria-hidden="true" />
            </span>
            חברוֹת הקבוצה
          </CardTitle>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="אין חיובים לחודש זה"
              description="החיוב נוצר אוטומטית ב-1 לחודש לכל חברה פעילה בקבוצה."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חברה</TableHead>
                  <TableHead className="text-end">סכום</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead className="text-end">פעולה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((r) => (
                  <TableRow
                    key={r.billingId}
                    className={r.status === 'paid' ? 'bg-success-soft/30' : undefined}
                  >
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-200 text-sm font-bold text-ink shadow-soft ring-1 ring-inset ring-white/60"
                        >
                          {r.name.trim().charAt(0)}
                        </span>
                        <span className="font-semibold text-ink">{r.name}</span>
                      </span>
                    </TableCell>
                    <TableNumCell className="text-base font-bold">
                      {formatShekels(r.amount)}
                    </TableNumCell>
                    <TableCell>
                      <StatusPill status={pillStatus(r.status)} />
                    </TableCell>
                    <TableCell className="text-end">
                      {r.status === 'paid' ? (
                        <form
                          action={markUnpaidAction}
                          className="flex justify-end"
                        >
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="md"
                            className="text-muted hover:bg-danger-soft hover:text-danger"
                          >
                            <Undo2 className="size-4" aria-hidden="true" />
                            ביטול סימון
                          </Button>
                        </form>
                      ) : (
                        <form
                          action={markPaidAction}
                          className="flex flex-col items-stretch gap-2.5 lg:items-end"
                        >
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          {/* Editable receipt description — presets + free text.
                             Defaults to the student's receiptLabel, else
                             "חוג {group name}". */}
                          {withReceipt && (
                            <ReceiptDescriptionField
                              id={`desc-${r.billingId}`}
                              defaultValue={
                                r.receiptLabel?.trim() || groupReceiptLabel(group.name)
                              }
                              ariaLabel={`תיאור הקבלה עבור ${r.name}`}
                            />
                          )}
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <label
                              htmlFor={`method-${r.billingId}`}
                              className="sr-only"
                            >
                              אמצעי תשלום עבור {r.name}
                            </label>
                            <Select
                              id={`method-${r.billingId}`}
                              name="method"
                              defaultValue="bit"
                              className="w-auto text-sm"
                            >
                              {METHODS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" variant="ink" size="md">
                              <Receipt className="size-4" aria-hidden="true" />
                              {withReceipt ? 'סמני כשולם + קבלה' : 'אישור קבלת התשלום'}
                            </Button>
                          </div>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {roster.length > 0 && (
            <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-accent-soft px-4 py-3.5 text-xs leading-relaxed text-accent-text ring-1 ring-inset ring-white/50">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {withReceipt ? (
                  <>
                    סימון &quot;שולם&quot; מפיק קבלה רשמית (Morning) עם תיאור הקבלה
                    שבחרת ושולח אותה אוטומטית להורה בוואטסאפ. ניתן לבטל סימון אם
                    נעשתה טעות.
                  </>
                ) : (
                  <>
                    סימון &quot;שולם&quot; רושם שהתשלום התקבל — לא מופקת קבלה ולא
                    נשלחת הודעה להורה. ניתן לבטל סימון אם נעשתה טעות.
                  </>
                )}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
