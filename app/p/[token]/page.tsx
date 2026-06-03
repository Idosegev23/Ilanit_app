import { ReceiptText, Clock, MapPin, User, Link2Off } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/badge';
import { peekPaymentToken } from '@/lib/morning/payment-token';
import { formatILDateTime } from '@/lib/time';
import { PaymentForm } from './payment-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלום וקבלה — אילנית' };

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
      <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-muted">
              <Link2Off className="size-6" aria-hidden="true" />
            </span>
            <CardTitle className="text-xl">הקישור אינו תקף</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-center text-sm text-muted">
              הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לעדכן תשלום ישירות מהמערכת.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
            <ReceiptText className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">עדכון תשלום והפקת קבלה</CardTitle>
          <CardDescription>סמני אם התקבל תשלום עבור השיעור</CardDescription>
        </CardHeader>
        <CardBody>
          <dl className="mb-5 space-y-3 rounded-xl border border-line bg-cream/50 p-4">
            <div className="flex items-start gap-3 text-sm">
              <User className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted">תלמיד/ה</dt>
                <dd className="text-ink">{view.studentName}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted">מועד השיעור</dt>
                <dd className="text-ink">{formatILDateTime(view.datetime)}</dd>
              </div>
            </div>
            {view.location ? (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted">כתובת</dt>
                  <dd className="text-ink">{view.location}</dd>
                </div>
              </div>
            ) : null}
            {view.alreadyPaid ? (
              <div className="flex items-center gap-2 border-t border-line pt-3">
                <StatusPill status="completed" label="השיעור סומן כהושלם" />
              </div>
            ) : null}
          </dl>
          <PaymentForm token={token} suggestedAmount={view.amount} />
        </CardBody>
      </Card>
    </main>
  );
}
