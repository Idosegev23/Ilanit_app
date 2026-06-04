import { CalendarCheck, Clock, Link2Off, MessageCircle } from 'lucide-react';
import { resolveBookingLink } from '@/lib/booking-links';
import { getStudent } from '@/lib/students';
import { AuthLayout } from '@/components/ui/auth-layout';
import { TokenBookingForm } from '@/app/book/[token]/TokenBookingForm';
import { loadBookingWeek } from '@/app/book/[token]/actions';

// Personal booking page (no login). The token identifies the student (Ilanit
// sent them this link); we resolve + load the student server-side and render the
// slot picker with the student KNOWN. An invalid/expired token shows a warm,
// friendly notice inside the shared AuthLayout instead.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'קביעת שיעור — אילנית' };

export default async function TokenBookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveBookingLink(token);
  const student = resolved ? await getStudent(resolved.studentId) : null;

  // ── Invalid / expired link — friendly warm notice in the AuthLayout shell ──
  if (!student) {
    return (
      <AuthLayout
        eyebrow="קביעת שיעור"
        valueProp="הלינק לתיאום אינו תקין או שפג תוקפו."
      >
        <div className="flex flex-col items-center gap-7 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft ring-1 ring-primary-100">
            <Link2Off className="size-8" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink">הקישור אינו תקין</h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
              ייתכן שהלינק כבר אינו בתוקף. אפשר לפנות לאילנית כדי שתשלח לך לינק חדש
              לתיאום שיעור.
            </p>
          </div>
          <div className="flex w-full items-center gap-3 rounded-2xl bg-gradient-tint p-4 text-start ring-1 ring-line">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-600 shadow-soft">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm leading-relaxed text-muted">
              שולחים הודעה לאילנית בוואטסאפ והיא תשלח לך לינק חדש.
            </p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Initial WEEK view, resolved server-side: this auto-jumps to the nearest open
  // week within the booking horizon (when any week is open) so the student lands
  // on a bookable week. Navigation re-fetches via the same server action.
  const initialWeek = await loadBookingWeek();

  // ── Valid link — shared AuthLayout (single source of truth for the brand
  // panel + its AA-safe scrim). `wide` widens the column and `bare` lets the
  // booking form bring its own Card (it owns the gradient header / week grid). ──
  return (
    <AuthLayout
      wide
      bare
      eyebrow="קביעת שיעור"
      headline="קביעת שיעור עם אילנית"
      valueProp="בחרו יום ומועד שמתאים לכם מתוך השבוע — והבקשה תועבר לאישור. נחזור אליכם בהקדם."
      features={[
        { icon: CalendarCheck, label: 'תצוגת שבוע מלא — בוחרים יום ומועד פנוי' },
        { icon: Clock, label: 'אישור מהיר ותזכורת בוואטסאפ' },
      ]}
    >
      <TokenBookingForm
        token={token}
        studentName={student.name}
        studentEmail={student.email}
        initialWeek={initialWeek}
      />
    </AuthLayout>
  );
}
