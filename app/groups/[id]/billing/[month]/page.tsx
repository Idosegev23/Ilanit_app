import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  Undo2,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { getGroup, rosterFor } from '@/lib/groups';
import { formatShekels } from '@/lib/utils';
import { toILMonthStr } from '@/lib/groups/month';
import { markPaidAction, markUnpaidAction } from '@/app/groups/actions';

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

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link
        href={`/groups/${id}`}
        className="mb-3 inline-flex items-center gap-1 rounded-lg text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        {group.name}
      </Link>

      <PageHeader
        title={`רוסטר חיוב — ${monthLabel}`}
        subtitle={group.name}
        className="mb-8"
      />

      {roster.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="שילמו"
            value={
              <span>
                {paidCount}
                <span className="text-base font-medium text-muted"> / {roster.length}</span>
              </span>
            }
            icon={CheckCircle2}
            hint="חברוֹת ששילמו החודש"
          />
          <StatCard
            label="חוב פתוח"
            value={formatShekels(totalDue)}
            icon={CircleDollarSign}
            hint="סכום שטרם נגבה"
          />
          <StatCard label="סך חברוֹת" value={roster.length} icon={Users} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>חברוֹת הקבוצה</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
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
                  <TableRow key={r.billingId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableNumCell>{formatShekels(r.amount)}</TableNumCell>
                    <TableCell>
                      <StatusPill status={pillStatus(r.status)} />
                    </TableCell>
                    <TableCell className="text-end">
                      {r.status === 'paid' ? (
                        <form action={markUnpaidAction} className="flex justify-end">
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Undo2 className="size-4" aria-hidden="true" />
                            ביטול סימון
                          </Button>
                        </form>
                      ) : (
                        <form
                          action={markPaidAction}
                          className="flex flex-wrap items-center justify-end gap-2"
                        >
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          <label htmlFor={`method-${r.billingId}`} className="sr-only">
                            אמצעי תשלום עבור {r.name}
                          </label>
                          <Select
                            id={`method-${r.billingId}`}
                            name="method"
                            defaultValue="bit"
                            className="h-9 w-auto py-1.5 text-sm"
                          >
                            {METHODS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" size="sm">
                            <Receipt className="size-4" aria-hidden="true" />
                            סמני כשולם + קבלה
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
