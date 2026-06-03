import { Sparkles } from 'lucide-react';
import { BookingForm } from '@/app/book/BookingForm';

// Public booking page (no login). The interactive availability picker + form
// lives in the client component; this server component frames it with a warm
// hero.
export const metadata = {
  title: 'קביעת שיעור — אילנית',
};

export default function BookPage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* Warm hero band */}
      <div className="bg-gradient-to-b from-primary-soft to-cream">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pb-2 pt-12 text-center sm:pt-16">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface text-primary-600 shadow-soft">
            <Sparkles className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">קביעת שיעור עם אילנית</h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
            בחרו תאריך ומועד שמתאים לכם, השאירו פרטים — והבקשה תועבר לאישור. נחזור אליכם
            בהקדם.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
        <BookingForm />
      </div>
    </main>
  );
}
