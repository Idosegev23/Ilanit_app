import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>אישור שיעור</CardTitle>
        </CardHeader>
        <CardContent>
          {!view ? (
            <p className="text-sm text-slate-600">
              הקישור אינו תקין, פג תוקפו, או שהשיעור כבר טופל.
            </p>
          ) : view.status !== 'pending' ? (
            <p className="text-sm text-slate-600">השיעור כבר טופל (סטטוס נוכחי: {view.status}).</p>
          ) : (
            <div className="space-y-3">
              <dl className="space-y-1 text-sm text-slate-700">
                <div>
                  <dt className="inline font-medium">תלמיד/ה: </dt>
                  <dd className="inline">{view.studentName}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">מתי: </dt>
                  <dd className="inline">{formatILDateTime(new Date(view.startISO))}</dd>
                </div>
                {view.location && (
                  <div>
                    <dt className="inline font-medium">כתובת: </dt>
                    <dd className="inline">{view.location}</dd>
                  </div>
                )}
                {view.price != null && (
                  <div>
                    <dt className="inline font-medium">מחיר: </dt>
                    <dd className="inline">{formatShekels(view.price)}</dd>
                  </div>
                )}
                {view.notes && (
                  <div>
                    <dt className="inline font-medium">הערות: </dt>
                    <dd className="inline">{view.notes}</dd>
                  </div>
                )}
              </dl>
              <ApproveActions token={token} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
