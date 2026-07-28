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
        <div className="flex flex-col items-center gap-7 text-center rise">
          <span className="flex size-20 items-center justify-center rounded-full bg-white/70 shadow-glow ring-1 ring-white/70 backdrop-blur">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-700 ring-1 ring-primary-100">
              <Link2Off className="size-7" aria-hidden="true" />
            </span>
          </span>
          <div className="space-y-2">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              הקישור אינו תקין
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
              ייתכן שהלינק כבר אינו בתוקף. אפשר לפנות לאילנית כדי שתשלח לך לינק חדש
              לתיאום שיעור.
            </p>
          </div>
          <div className="flex w-full items-center gap-3 rounded-2xl bg-primary-soft p-4 text-start shadow-soft ring-1 ring-white/60">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-glow">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm leading-relaxed text-ink">
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
        needsDetails={!student.phone}
        studentName={student.name}
        studentEmail={student.email}
        studentGuardianName={student.guardianName}
        studentGuardianPhone={student.guardianPhone}
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
