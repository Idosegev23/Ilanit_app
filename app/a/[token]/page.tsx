import { CalendarClock, Clock, MapPin, CircleDollarSign, User, StickyNote, Link2Off } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/badge';
import { peekApproveToken } from '@/lib/availability/approval';
import { formatILDateTime } from '@/lib/time';
import { formatShekels } from '@/lib/utils';
import { ApproveActions } from '@/app/a/[token]/ApproveActions';

// Approval landing page reached from the WhatsApp link (no login). Shows the
// pending lesson and approve/reject buttons. The token is consumed only when a
// decision is submitted (via /api/approve), so reloading the page is safe.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אישור שיעור — אילנית' };

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekApproveToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
            <CalendarClock className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">אישור שיעור</CardTitle>
          <CardDescription>בקשת תיאום חדשה ממתינה לאישורך</CardDescription>
        </CardHeader>
        <CardBody>
          {!view ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-50 text-muted">
                <Link2Off className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted">
                הקישור אינו תקין, פג תוקפו, או שהשיעור כבר טופל.
              </p>
            </div>
          ) : view.status !== 'pending' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <StatusPill status={view.status} />
              <p className="text-sm text-muted">השיעור כבר טופל.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-center">
                <StatusPill status="pending" />
              </div>
              <dl className="space-y-3 rounded-xl border border-line bg-cream/50 p-4">
                <DetailRow icon={User} label="תלמיד/ה" value={view.studentName} />
                <DetailRow
                  icon={Clock}
                  label="מתי"
                  value={formatILDateTime(new Date(view.startISO))}
                />
                {view.location && <DetailRow icon={MapPin} label="כתובת" value={view.location} />}
                {view.price != null && (
                  <DetailRow
                    icon={CircleDollarSign}
                    label="מחיר"
                    value={<span className="tabular-nums">{formatShekels(view.price)}</span>}
                  />
                )}
                {view.notes && <DetailRow icon={StickyNote} label="הערות" value={view.notes} />}
              </dl>
              <ApproveActions token={token} />
            </div>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="text-ink">{value}</dd>
      </div>
    </div>
  );
}
