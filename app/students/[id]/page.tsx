import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { studentFileData } from '@/lib/students';
import { formatShekels } from '@/lib/utils';
import { formatILDateTime } from '@/lib/time';
import type { Lesson, Payment, Receipt, GroupBilling } from '@/db/schema';

export const dynamic = 'force-dynamic';

const LESSON_STATUS_LABEL: Record<Lesson['status'], string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  completed: 'הושלם',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

const PAYMENT_STATUS_LABEL: Record<Payment['status'], string> = {
  due: 'חוב',
  paid: 'שולם',
  waived: 'בוטל חיוב',
};

const METHOD_LABEL: Record<string, string> = {
  bit: 'ביט',
  cash: 'מזומן',
  transfer: 'העברה',
  other: 'אחר',
};

function monthLabel(month: GroupBilling['month']): string {
  // month is a date string (yyyy-MM-dd, first of month).
  const str = String(month);
  return str.slice(0, 7); // yyyy-MM
}

// Full client file: details + default price, lesson history (all statuses),
// payment history, the receipt archive (PDF download links from Blob), and
// group memberships + monthly billing.
export default async function StudentFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const file = await studentFileData(id);
  if (!file) notFound();

  const { student, lessons, payments, receipts, memberships, groupBilling } = file;
  const paymentByLesson = new Map<string, Payment>(payments.map((p) => [p.lessonId, p]));

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{student.name}</h1>
            <p className="text-sm text-slate-500" dir="ltr">
              {student.phone}
              {student.email ? ` · ${student.email}` : ''}
            </p>
          </div>
          <Link href="/students" className="text-sm text-brand hover:underline">
            ← לרשימת התלמידים
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>פרטים</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm text-slate-700">
            <div>
              מחיר ברירת מחדל:{' '}
              <span className="font-medium">
                {student.defaultPrice != null ? formatShekels(student.defaultPrice) : '—'}
              </span>
            </div>
            <div>
              משך שיעור: <span className="font-medium">{student.defaultDurationMin} דק׳</span>
            </div>
            {student.notes ? <div className="col-span-2">הערות: {student.notes}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>היסטוריית שיעורים</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-sm text-slate-500">אין שיעורים עדיין.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lessons.map((l: Lesson) => {
                  const pay = paymentByLesson.get(l.id);
                  return (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-700">{formatILDateTime(l.startsAt)}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-slate-500">{LESSON_STATUS_LABEL[l.status]}</span>
                        {l.price != null ? (
                          <span className="text-slate-600">{formatShekels(l.price)}</span>
                        ) : null}
                        {pay ? (
                          <span
                            className={
                              pay.status === 'paid'
                                ? 'text-green-600'
                                : pay.status === 'due'
                                  ? 'text-red-600'
                                  : 'text-slate-500'
                            }
                          >
                            {PAYMENT_STATUS_LABEL[pay.status]}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>היסטוריית תשלומים</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">אין תשלומים עדיין.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p: Payment) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">{formatShekels(p.amount)}</span>
                    <span className="flex items-center gap-3 text-slate-500">
                      <span>{PAYMENT_STATUS_LABEL[p.status]}</span>
                      {p.method ? <span>{METHOD_LABEL[p.method] ?? p.method}</span> : null}
                      {p.paidAt ? <span>{formatILDateTime(p.paidAt)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ארכיון קבלות</CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <p className="text-sm text-slate-500">אין קבלות שמורות.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {receipts.map((r: Receipt) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">
                      קבלה מס׳ {r.morningDocNumber} · {formatShekels(r.amount)}
                    </span>
                    <a
                      href={r.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="text-brand hover:underline"
                    >
                      הורדת PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {(memberships.length > 0 || groupBilling.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>קבוצות וחיוב חודשי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {memberships.length > 0 ? (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">חברות בקבוצות</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {memberships.map((m) => (
                      <li key={m.groupId} className="flex items-center justify-between">
                        <span>{m.groupName}</span>
                        <span className={m.active ? 'text-green-600' : 'text-slate-400'}>
                          {m.active ? 'פעילה' : 'לא פעילה'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {groupBilling.length > 0 ? (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">חיובים חודשיים</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {groupBilling.map((b: GroupBilling) => (
                      <li key={b.id} className="flex items-center justify-between">
                        <span>
                          {monthLabel(b.month)} · {formatShekels(b.amount)}
                        </span>
                        <span
                          className={
                            b.status === 'paid'
                              ? 'text-green-600'
                              : b.status === 'due'
                                ? 'text-red-600'
                                : 'text-slate-500'
                          }
                        >
                          {PAYMENT_STATUS_LABEL[b.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
