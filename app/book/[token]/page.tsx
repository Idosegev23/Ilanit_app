import { CalendarCheck, Clock, Link2Off, MessageCircle } from 'lucide-react';
import { resolveBookingLink } from '@/lib/booking-links';
import { getStudent } from '@/lib/students';
import { AuthLayout } from '@/components/ui/auth-layout';
import { Brand } from '@/components/ui/brand';
import { TokenBookingForm } from '@/app/book/[token]/TokenBookingForm';

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

  // ── Valid link — full-bleed split: gradient brand panel + elevated form ──
  // We use a bespoke split (mirrors AuthLayout) so the booking form gets a
  // roomier card (max-w-xl) for its slot grid, never a lonely card in a void.
  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-1">
      {/* ── Brand / value panel (desktop column; mobile header band) ── */}
      <section className="relative isolate flex flex-col justify-center overflow-hidden bg-gradient-warm px-6 py-10 text-white texture-dots lg:px-14 lg:py-16">
        <span
          aria-hidden="true"
          className="blob -top-24 -end-16 size-72 bg-[var(--grad-warm-3)]"
        />
        <span
          aria-hidden="true"
          className="blob -bottom-28 -start-10 size-80 bg-[var(--grad-warm-1)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-md lg:mx-0">
          <Brand size="lg" onDark className="lg:mb-10" />

          <div className="mt-6 hidden lg:block">
            <p className="text-sm font-medium uppercase tracking-wide text-white/75">
              קביעת שיעור
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-snug text-white text-balance">
              קביעת שיעור עם אילנית
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-white/90 text-balance">
              בחרו תאריך ומועד שמתאים לכם — והבקשה תועבר לאישור. נחזור אליכם בהקדם.
            </p>

            <ul className="mt-8 space-y-3 text-white/90">
              <li className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"
                >
                  <CalendarCheck className="size-[1.125rem]" />
                </span>
                <span className="text-base">בחירת מועד פנוי ביומן של אילנית</span>
              </li>
              <li className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"
                >
                  <Clock className="size-[1.125rem]" />
                </span>
                <span className="text-base">אישור מהיר ותזכורת בוואטסאפ</span>
              </li>
            </ul>
          </div>

          {/* Mobile-only condensed value prop */}
          <p className="mt-3 text-base font-medium text-white/90 lg:hidden">
            בחרו תאריך ומועד שמתאים לכם — והבקשה תועבר לאישור.
          </p>
        </div>
      </section>

      {/* ── Action surface: the booking form on a soft gradient ── */}
      <section className="flex items-start justify-center bg-gradient-soft px-4 py-8 sm:items-center sm:px-6 sm:py-12">
        <div className="w-full max-w-xl animate-fade-in">
          <TokenBookingForm
            token={token}
            studentName={student.name}
            studentEmail={student.email}
          />
        </div>
      </section>
    </div>
  );
}
