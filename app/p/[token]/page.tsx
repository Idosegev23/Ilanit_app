import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { peekPaymentToken } from '@/lib/morning/payment-token';
import { formatILDateTime } from '@/lib/time';
import { PaymentForm } from './payment-form';

export const dynamic = 'force-dynamic';

// Public (no-login) payment action page reached from a WhatsApp link Ilanit
// taps after a lesson ends. She confirms whether payment was received (and the
// amount/method) to issue a receipt, or sends the student a payment request.
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekPaymentToken(token);

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>הקישור אינו תקף</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לעדכן תשלום ישירות מהמערכת.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>עדכון תשלום והפקת קבלה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-1 text-sm text-slate-700">
            <p>
              תלמיד/ה: <span className="font-medium">{view.studentName}</span>
            </p>
            <p>
              מועד השיעור: <span className="font-medium">{formatILDateTime(view.datetime)}</span>
            </p>
            {view.location ? <p>כתובת: {view.location}</p> : null}
            {view.alreadyPaid ? (
              <p className="text-amber-600">שיעור זה כבר סומן כהושלם.</p>
            ) : null}
          </div>
          <PaymentForm token={token} suggestedAmount={view.amount} />
        </CardContent>
      </Card>
    </main>
  );
}
