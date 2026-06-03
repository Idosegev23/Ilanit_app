import { Sparkles, Link2Off } from 'lucide-react';
import { resolveBookingLink } from '@/lib/booking-links';
import { getStudent } from '@/lib/students';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TokenBookingForm } from '@/app/book/[token]/TokenBookingForm';

// Personal booking page (no login). The token identifies the student (Ilanit
// sent them this link); we resolve + load the student server-side and render the
// slot picker with the student KNOWN. An invalid/expired token shows a warm,
// friendly notice instead.

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

  // ── Invalid / expired link — friendly warm notice ──
  if (!student) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
              <Link2Off className="size-6" aria-hidden="true" />
            </span>
            <CardTitle className="text-xl">הקישור אינו תקין</CardTitle>
            <CardDescription>הלינק לתיאום אינו תקין או שפג תוקפו</CardDescription>
          </CardHeader>
          <CardBody>
            <p className="text-center text-sm leading-relaxed text-muted">
              ייתכן שהלינק כבר אינו בתוקף. אפשר לפנות לאילנית כדי שתשלח לך לינק חדש לתיאום
              שיעור.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

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
            בחרו תאריך ומועד שמתאים לכם — והבקשה תועבר לאישור. נחזור אליכם בהקדם.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
        <TokenBookingForm
          token={token}
          studentName={student.name}
          studentEmail={student.email}
        />
      </div>
    </main>
  );
}
