import { CalendarClock, MapPin } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { Card, CardBody } from '@/components/ui/card';
import { peekRescheduleToken } from '@/lib/lessons/reschedule';
import { RescheduleActions } from './RescheduleActions';

// Parent-facing accept/decline for a lesson Ilanit moved.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'שינוי מועד — אילנית' };

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekRescheduleToken(token);

  if (!view) {
    return (
      <AuthLayout eyebrow="שינוי מועד" valueProp="הקישור אינו תקין.">
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-lg font-bold text-ink">הקישור אינו בתוקף</p>
            <p className="mt-2 text-sm text-muted">אפשר לפנות לאילנית ישירות.</p>
          </CardBody>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="שינוי מועד"
      headline="המועד של השיעור השתנה"
      valueProp="נשמח לדעת אם המועד החדש מתאים לך."
    >
      <Card className="shadow-pop">
        <CardBody className="space-y-5">
          <div className="flex items-center gap-3.5 rounded-2xl bg-primary-soft/70 p-4 ring-1 ring-primary-200">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-ink shadow-glow"
            >
              <CalendarClock className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted">{view.studentName}</p>
              <p className="text-lg font-extrabold tracking-tight text-ink">{view.newWhen}</p>
              {view.location && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {view.location}
                </p>
              )}
            </div>
          </div>

          {view.closed ? (
            <p className="rounded-xl bg-surface-2/70 px-3.5 py-3 text-center text-sm text-muted">
              כבר השבת על ההודעה הזו, או שהיא כבר אינה רלוונטית.
            </p>
          ) : (
            <RescheduleActions token={token} />
          )}
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
