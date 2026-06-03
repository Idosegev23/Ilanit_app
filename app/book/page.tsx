import Link from 'next/link';
import { Link2Off, MessageCircle, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// There is NO generic public booking page. Booking happens only through a
// PERSONAL link (`/book/[token]`) that Ilanit sends to a student over WhatsApp.
// Anyone landing on bare /book sees a warm, branded notice explaining this —
// rendered inside the shared AuthLayout (gradient brand panel + elevated card),
// never a lonely card floating in an empty void.

export const metadata = { title: 'קביעת שיעור — אילנית' };

export default function BookLandingPage() {
  return (
    <AuthLayout
      eyebrow="קביעת שיעור"
      valueProp="קביעת שיעור מתבצעת דרך לינק אישי שאילנית שולחת בוואטסאפ."
      highlights={[
        'הלינק האישי שומר על המקום שלך',
        'בחירת מועד פנוי בלחיצה',
        'אישור מהיר בוואטסאפ',
      ]}
    >
      <div className="flex flex-col items-center gap-7 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft ring-1 ring-primary-100">
          <Link2Off className="size-8" aria-hidden="true" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink">צריך לינק אישי</h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
            כדי לקבוע שיעור, יש לפתוח את הלינק האישי שאילנית שולחת בוואטסאפ. אם
            עדיין לא קיבלת לינק — אפשר לפנות אליה והיא תשלח לך אחד.
          </p>
        </div>

        <div className="flex w-full items-center gap-3 rounded-2xl bg-gradient-tint p-4 text-start ring-1 ring-line">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-success shadow-soft">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-muted">
            הלינק האישי הוא פרטי — הוא שומר עבורך את המקום ואת פרטי השיעור.
          </p>
        </div>

        <Link
          href="/login"
          className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          כניסה לאזור הניהול
        </Link>
      </div>
    </AuthLayout>
  );
}
