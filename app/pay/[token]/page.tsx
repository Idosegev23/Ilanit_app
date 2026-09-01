import { Wallet, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { Card, CardBody } from '@/components/ui/card';
import { peekPayToken } from '@/lib/payments';
import { PayActions } from './PayActions';

// Parent-facing settle screen. Distinct from /p/[token], which is Ilanit's own.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלום — אילנית' };

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekPayToken(token);

  if (!view) {
    return (
      <AuthLayout eyebrow="תשלום" valueProp="הקישור אינו תקין או שכבר נוצל.">
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-lg font-bold text-ink">הקישור אינו בתוקף</p>
            <p className="mt-2 text-sm text-muted">אפשר לפנות לאילנית לקבלת קישור חדש.</p>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  if (view.settled) {
    return (
      <AuthLayout eyebrow="תשלום" valueProp="התשלום כבר נרשם. תודה!">
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold text-ink">שולם</p>
            <p className="text-sm text-muted">אין צורך בפעולה נוספת.</p>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="תשלום"
      headline={`תשלום עבור ${view.studentName}`}
      valueProp="בוחרים אמצעי תשלום — וזהו. אילנית תאשר את קבלת התשלום."
    >
      <Card className="shadow-pop">
        <CardBody className="space-y-5">
          <div className="flex items-center gap-3.5 rounded-2xl bg-primary-soft/70 p-4 ring-1 ring-primary-200">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-ink shadow-glow"
            >
              <Wallet className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted">{view.context}</p>
              <p className="text-3xl font-extrabold tabular-nums tracking-tight text-ink">
                {view.amount}₪
              </p>
            </div>
          </div>

          <PayActions token={token} amount={view.amount} bitLink={view.bitLink} />

          <p className="text-center text-xs leading-relaxed text-muted">
            בביט יש להקליד את הסכום ידנית — הקישור הקבוע אינו נושא סכום.
          </p>
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
