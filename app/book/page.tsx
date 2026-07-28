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
      valueProp="ממלאים פרטים, בוחרים יום ומועד שמתאים לכם — והבקשה עוברת לאישור. אפשר לקבוע גם כמה שיעורים."
      features={[
        { icon: CalendarCheck, label: 'תצוגת שבוע מלא — בוחרים יום ומועד פנוי' },
        { icon: Clock, label: 'אישור מהיר ותזכורת בוואטסאפ' },
      ]}
    >
      <TokenBookingForm
        token=""
        publicBooking
        studentName=""
        initialWeek={initialWeek}
      />
      <p className="mt-6 text-center text-sm text-muted">
        לא מצאת שעה מתאימה?{' '}
        <a
          href="/standby"
          className="font-semibold text-primary-600 underline-offset-2 hover:underline"
        >
          הצטרפו לרשימת ההמתנה
        </a>
      </p>
    </AuthLayout>
  );
}
