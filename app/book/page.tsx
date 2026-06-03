import { BookingForm } from '@/app/book/BookingForm';

// Public booking page (no login). The interactive availability picker + form
// lives in the client component; this server component just frames it.
export const metadata = {
  title: 'קביעת שיעור — אילנית',
};

export default function BookPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <BookingForm />
    </main>
  );
}
