import {
  ReceiptText,
  Clock,
  MapPin,
  User,
  Link2Off,
  type LucideIcon,
} from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
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
      <AuthLayout
        eyebrow="תשלום וקבלה"
        valueProp="עדכון תשלומים והפקת קבלות — ישירות מהנייד, אחרי כל שיעור."
      >
        <header className="mb-6 flex items-start gap-3.5">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-muted shadow-soft"
            aria-hidden="true"
          >
            <Link2Off className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-ink">
              הקישור אינו תקף
            </h1>
            <p className="mt-0.5 text-sm text-muted">פג תוקף או שכבר נעשה בו שימוש</p>
          </div>
        </header>
        <div className="rounded-2xl border border-line bg-surface-2/50 px-5 py-6 text-center">
          <p className="text-sm leading-relaxed text-muted">
            אפשר לעדכן את התשלום ולהפיק קבלה ישירות מהמערכת.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="תשלום וקבלה"
      valueProp="סמני אם התקבל תשלום עבור השיעור — קבלה מופקת ונשלחת אוטומטית."
      highlights={[
        'קבלה נשלחת לתלמיד/ה כצרופה',
        'עותק נשמר אוטומטית בתיק הלקוח',
        'אפשר לשלוח בקשת תשלום בלחיצה אחת',
      ]}
    >
      <header className="mb-6 flex items-start gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft"
          aria-hidden="true"
        >
          <ReceiptText className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-ink">
            עדכון תשלום והפקת קבלה
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            סמני אם התקבל תשלום עבור השיעור
          </p>
        </div>
      </header>

      <dl className="mb-5 overflow-hidden rounded-2xl border border-line bg-gradient-tint">
        <DetailRow icon={User} label="תלמיד/ה" value={view.studentName} />
        <DetailRow
          icon={Clock}
          label="מועד השיעור"
          value={formatILDateTime(view.datetime)}
        />
        {view.location ? (
          <DetailRow icon={MapPin} label="כתובת" value={view.location} />
        ) : null}
        {view.alreadyPaid ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <StatusPill status="completed" label="השיעור סומן כהושלם" />
          </div>
        ) : null}
      </dl>

      <PaymentForm
        token={token}
        suggestedAmount={view.amount}
        defaultDescription={view.receiptLabel}
      />
    </AuthLayout>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-b-0">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-primary-600 shadow-soft"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}
