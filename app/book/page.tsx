import { CalendarCheck, Clock } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { TokenBookingForm } from '@/app/book/[token]/TokenBookingForm';
import { loadBookingWeek } from '@/app/book/[token]/actions';

// Permanent PUBLIC booking page. This is the fixed link Ilanit shares once and
// reuses forever — no per-person token. Every visitor fills in their own details
// (name + phone, optional parent + email) and picks one or more slots; each
// request becomes a pending lesson for Ilanit to approve. The student is matched
// or created by phone, so returning people are recognised.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'קביעת שיעור — אילנית' };

export default async function PublicBookPage() {
  const initialWeek = await loadBookingWeek();

  return (
    <AuthLayout
      wide
      bare
      eyebrow="קביעת שיעור"
      headline="קביעת שיעור עם אילנית"
      valueProp="ממלאים פרטים, בוחרים יום ומועד שמתאים לכם — והשיעור נקבע מיד. אפשר לקבוע גם כמה שיעורים."
      features={[
        { icon: CalendarCheck, label: 'תצוגת שבוע מלא — בוחרים יום ומועד פנוי' },
        { icon: Clock, label: 'אישור מיידי ותזכורת בוואטסאפ' },
      ]}
    >
      <TokenBookingForm
        token=""
        publicBooking
        studentName=""
        initialWeek={initialWeek}
      />
      {/* Escape hatch for "nothing here works for me" — a soft glass pill so it
          reads as an offer, not as fine print. */}
      <p className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-full border border-white/60 bg-white/60 px-4 py-2 text-center text-sm text-muted shadow-soft backdrop-blur">
        לא מצאת שעה מתאימה?{' '}
        <a
          href="/standby"
          className="inline-flex min-h-11 items-center rounded-full px-3 font-bold text-primary-700 underline decoration-primary/60 underline-offset-4 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          הצטרפו לרשימת ההמתנה
        </a>
      </p>
    </AuthLayout>
  );
}
