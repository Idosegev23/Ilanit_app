import Link from 'next/link';
import { notFound } from 'next/navigation';
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
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card';
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
import { studentFileData } from '@/lib/students';
import { formatShekels } from '@/lib/utils';
import { formatILDateTime } from '@/lib/time';
import type { Lesson, Payment, Receipt, GroupBilling } from '@/db/schema';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<string, string> = {
  bit: 'ביט',
  cash: 'מזומן',
  transfer: 'העברה',
  other: 'אחר',
};

function monthLabel(month: GroupBilling['month']): string {
  // month is a date string (yyyy-MM-dd, first of month).
  return String(month).slice(0, 7); // yyyy-MM
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
    <div className="space-y-6">
      <PageHeader
        title={student.name}
        subtitle="תיק לקוח"
        actions={
          <Link href="/students">
            <Button variant="secondary" size="sm">
              {/* RTL back: chevron points to the end (left edge of content flow) */}
              <ChevronRight className="size-4" aria-hidden="true" />
              לרשימת התלמידים
            </Button>
          </Link>
        }
      />

      {/* ── פרטים ── */}
      <Card>
        <CardHeader>
          <CardTitle>פרטים</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <DetailRow icon={CircleDollarSign} label="מחיר ברירת מחדל">
            <span className="tabular-nums font-medium text-ink">
              {student.defaultPrice != null ? formatShekels(student.defaultPrice) : '—'}
            </span>
          </DetailRow>
          <DetailRow icon={Clock} label="משך שיעור">
            <span className="tabular-nums">{student.defaultDurationMin} דק׳</span>
          </DetailRow>
          {student.notes ? (
            <div className="sm:col-span-2">
              <DetailRow icon={StickyNote} label="הערות">
                <span className="whitespace-pre-wrap">{student.notes}</span>
              </DetailRow>
            </div>
          ) : null}
          {student.archived ? (
            <div className="sm:col-span-2">
              <Badge tone="muted">
                <Archive className="size-3.5" aria-hidden="true" />
                התלמיד בארכיון
              </Badge>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* ── שיעורים ── */}
      <Card>
        <CardHeader>
          <CardTitle>שיעורים</CardTitle>
        </CardHeader>
        <CardBody>
          {lessons.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="אין שיעורים עדיין"
              description="שיעורים יופיעו כאן לאחר תיאום או יצירה ידנית."
            />
          ) : (
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
                {lessons.map((l: Lesson) => {
                  const pay = paymentByLesson.get(l.id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{formatILDateTime(l.startsAt)}</TableCell>
                      <TableCell>
                        <StatusPill status={l.status as StatusKind} />
                      </TableCell>
                      <TableNumCell>
                        {l.price != null ? (
                          <span className="font-medium">{formatShekels(l.price)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableNumCell>
                      <TableCell>
                        {pay ? (
                          <StatusPill status={pay.status as StatusKind} />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* ── תשלומים ── */}
      <Card>
        <CardHeader>
          <CardTitle>תשלומים</CardTitle>
        </CardHeader>
        <CardBody>
          {payments.length === 0 ? (
            <EmptyState
              icon={CircleDollarSign}
              title="אין תשלומים עדיין"
              description="תשלומים נרשמים אוטומטית לאחר השלמת שיעור."
            />
          ) : (
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
                {payments.map((p: Payment) => (
                  <TableRow key={p.id}>
                    <TableNumCell>
                      <span className="font-medium">{formatShekels(p.amount)}</span>
                    </TableNumCell>
                    <TableCell>
                      <StatusPill status={p.status as StatusKind} />
                    </TableCell>
                    <TableCell>
                      {p.method ? (
                        <span className="text-muted">{METHOD_LABEL[p.method] ?? p.method}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.paidAt ? (
                        formatILDateTime(p.paidAt)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* ── ארכיון קבלות ── */}
      <Card>
        <CardHeader>
          <CardTitle>ארכיון קבלות</CardTitle>
        </CardHeader>
        <CardBody>
          {receipts.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="אין קבלות שמורות"
              description="כל קבלה שמופקת נשמרת כאן כעותק PDF להורדה."
            />
          ) : (
            <ul className="divide-y divide-line">
              {receipts.map((r: Receipt) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600">
                      <ReceiptText className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        קבלה מס׳{' '}
                        <span dir="ltr" className="tabular-nums">
                          {r.morningDocNumber}
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
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink shadow-soft transition-colors duration-150 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-primary"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    הורדת PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── קבוצות וחיוב חודשי ── */}
      {(memberships.length > 0 || groupBilling.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>קבוצות וחיוב חודשי</CardTitle>
          </CardHeader>
          <CardBody className="space-y-6">
            {memberships.length > 0 ? (
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
                      <Badge tone={m.active ? 'success' : 'muted'}>
                        {m.active ? 'פעילה' : 'לא פעילה'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {groupBilling.length > 0 ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-muted">
                  <CircleDollarSign className="size-4" aria-hidden="true" />
                  חיובים חודשיים
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>חודש</TableHead>
                      <TableHead className="text-end">סכום</TableHead>
                      <TableHead>סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupBilling.map((b: GroupBilling) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <span dir="ltr" className="tabular-nums">
                            {monthLabel(b.month)}
                          </span>
                        </TableCell>
                        <TableNumCell>
                          <span className="font-medium">{formatShekels(b.amount)}</span>
                        </TableNumCell>
                        <TableCell>
                          <StatusPill status={b.status as StatusKind} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// Small labeled detail row with a tinted lucide icon chip.
function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-600">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="mt-0.5 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
