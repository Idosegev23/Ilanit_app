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
import { receiptsEnabled } from '@/lib/env';
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
  // Off by default — the screen must not promise a document it will not issue.
  const withReceipt = receiptsEnabled();

  if (!view) {
    return (
      <AuthLayout
        eyebrow={withReceipt ? 'תשלום וקבלה' : 'עדכון תשלום'}
        valueProp={
          withReceipt
            ? 'עדכון תשלומים והפקת קבלות — ישירות מהנייד, אחרי כל שיעור.'
            : 'עדכון תשלומים — ישירות מהנייד, אחרי כל שיעור.'
        }
      >
        <header className="mb-6 flex items-start gap-3.5 rise">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-muted shadow-soft ring-1 ring-white/70"
            aria-hidden="true"
          >
            <Link2Off className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink">
              הקישור אינו תקף
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              פג תוקף או שכבר נעשה בו שימוש
            </p>
          </div>
        </header>
        <div className="rounded-2xl border border-white/60 bg-white/60 px-5 py-8 text-center shadow-soft backdrop-blur">
          <p className="text-sm leading-relaxed text-muted">
            {withReceipt
              ? 'אפשר לעדכן את התשלום ולהפיק קבלה ישירות מהמערכת.'
              : 'אפשר לעדכן את התשלום ישירות מהמערכת.'}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow={withReceipt ? 'תשלום וקבלה' : 'עדכון תשלום'}
      valueProp={
        withReceipt
          ? 'סמני אם התקבל תשלום עבור השיעור — קבלה מופקת ונשלחת אוטומטית.'
          : 'סמני אם התקבל תשלום עבור השיעור.'
      }
      highlights={
        withReceipt
          ? [
              'קבלה נשלחת לתלמיד/ה כצרופה',
              'עותק נשמר אוטומטית בתיק הלקוח',
              'אפשר לשלוח בקשת תשלום בלחיצה אחת',
            ]
          : [
              'התשלום נרשם בתיק הלקוח',
              'אפשר לשלוח בקשת תשלום בלחיצה אחת',
            ]
      }
    >
      <header className="mb-6 flex items-start gap-3.5 rise">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-cta text-ink shadow-glow"
          aria-hidden="true"
        >
          <ReceiptText className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink">
            {withReceipt ? 'עדכון תשלום והפקת קבלה' : 'עדכון תשלום'}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            סמני אם התקבל תשלום עבור השיעור
          </p>
        </div>
      </header>

      <dl className="mb-5 overflow-hidden rounded-2xl border border-white/60 bg-white/65 shadow-soft backdrop-blur">
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
          <div className="flex items-center gap-2 px-4 py-3.5">
            <StatusPill status="completed" label="השיעור סומן כהושלם" />
          </div>
        ) : null}
      </dl>

      <PaymentForm
        receiptsEnabled={withReceipt}
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
    <div className="flex items-start gap-3 border-b border-white/70 px-4 py-3.5 text-sm last:border-b-0">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 ring-1 ring-white/70"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {label}
        </dt>
        <dd className="mt-0.5 font-medium leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}
