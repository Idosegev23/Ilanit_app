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
      <div>
        <Link
          href={`/groups/${id}`}
          className="mb-4 inline-flex items-center gap-1 rounded-lg text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-2 flex items-end justify-between gap-3">
              <p className="text-sm font-medium text-ink">התקדמות גבייה</p>
              <p className="text-sm font-semibold tabular-nums text-primary-600">
                {paidPct}%
              </p>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-primary-50"
              role="progressbar"
              aria-valuenow={paidPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="אחוז החברוֹת ששילמו"
            >
              <div
                className="h-full rounded-full bg-gradient-warm transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </>
      )}

      <Card>
        <CardHeader variant="tint">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary-600" aria-hidden="true" />
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
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-600"
                        >
                          {r.name.trim().charAt(0)}
                        </span>
                        <span className="font-medium text-ink">{r.name}</span>
                      </span>
                    </TableCell>
                    <TableNumCell className="font-semibold">
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
                          <Button type="submit" variant="ghost" size="md">
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
                          <ReceiptDescriptionField
                            id={`desc-${r.billingId}`}
                            defaultValue={r.receiptLabel?.trim() || groupReceiptLabel(group.name)}
                            ariaLabel={`תיאור הקבלה עבור ${r.name}`}
                          />
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
                            <Button type="submit" size="md">
                              <Receipt className="size-4" aria-hidden="true" />
                              סמני כשולם + קבלה
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
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-xs leading-relaxed text-accent-text">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                סימון &quot;שולם&quot; מפיק קבלה רשמית (Morning) עם תיאור הקבלה
                שבחרת ושולח אותה אוטומטית להורה בוואטסאפ. ניתן לבטל סימון אם נעשתה
                טעות.
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
