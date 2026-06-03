import Link from 'next/link';
import { Link2Off, MessageCircle } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

// There is NO generic public booking page. Booking happens only through a
// PERSONAL link (`/book/[token]`) that Ilanit sends to a student over WhatsApp.
// Anyone landing on bare /book sees a warm notice explaining this.

export const metadata = { title: 'קביעת שיעור — אילנית' };

export default function BookLandingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
            <Link2Off className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">צריך לינק אישי</CardTitle>
          <CardDescription>קביעת שיעור מתבצעת דרך לינק אישי</CardDescription>
        </CardHeader>
        <CardBody className="space-y-5">
          <p className="text-center text-sm leading-relaxed text-muted">
            כדי לקבוע שיעור, יש לפתוח את הלינק האישי שאילנית שולחת בוואטסאפ. אם עדיין לא
            קיבלת לינק — אפשר לפנות אליה והיא תשלח לך אחד.
          </p>
          <div className="flex justify-center">
            <Link href="/login" className={buttonVariants({ variant: 'secondary' })}>
              <MessageCircle className="size-4" aria-hidden="true" />
              כניסה לאזור הניהול
            </Link>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
