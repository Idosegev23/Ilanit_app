import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getGroup, rosterFor } from '@/lib/groups';
import { formatShekels } from '@/lib/utils';
import { toILMonthStr } from '@/lib/groups/month';
import { markPaidAction, markUnpaidAction } from '@/app/groups/actions';

// Monthly billing roster for a group: Ilanit marks each member paid / unpaid.
// Marking paid issues a Morning receipt (PDF) and sends it as a WhatsApp
// attachment to the member.
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  due: 'ממתין',
  paid: 'שולם',
  waived: 'פטור',
};

const METHODS: Array<{ value: string; label: string }> = [
  { value: 'bit', label: 'ביט' },
  { value: 'cash', label: 'מזומן' },
  { value: 'transfer', label: 'העברה' },
  { value: 'other', label: 'אחר' },
];

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
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <Link href={`/groups/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← {group.name}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            רוסטר חיוב — {monthLabel}
          </h1>
          <p className="text-sm text-slate-500">
            {paidCount} מתוך {roster.length} שילמו · חוב פתוח: {formatShekels(totalDue)}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>חברוֹת הקבוצה</CardTitle>
          </CardHeader>
          <CardContent>
            {roster.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                אין חיובים לחודש זה. החיוב נוצר אוטומטית ב-1 לחודש לכל חברה פעילה.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {roster.map((r) => (
                  <li
                    key={r.billingId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-sm text-slate-500">{formatShekels(r.amount)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          r.status === 'paid'
                            ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                            : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700'
                        }
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>

                      {r.status === 'paid' ? (
                        <form action={markUnpaidAction}>
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          <Button type="submit" variant="ghost" size="sm">
                            ביטול סימון
                          </Button>
                        </form>
                      ) : (
                        <form action={markPaidAction} className="flex items-center gap-2">
                          <input type="hidden" name="billingId" value={r.billingId} />
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="month" value={month} />
                          <select
                            name="method"
                            defaultValue="bit"
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {METHODS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" size="sm">
                            סמני כשולם + קבלה
                          </Button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
