import { UserPlus, Clock, CalendarSearch, Link2Off } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/badge';
import { peekAssignToken } from '@/lib/availability/assign';
import { listStudents } from '@/lib/students';
import { formatILDateTime } from '@/lib/time';
import { AssignForm } from '@/app/m/[token]/AssignForm';

// Assign-student landing page reached from the WhatsApp link (no login). Shows
// the unidentified calendar event and a student picker. The token is consumed
// only on submit (via /api/assign), so reloading the page is safe.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שיוך שיעור — אילנית' };

export default async function AssignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekAssignToken(token);
  const students = view ? await listStudents() : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
            <UserPlus className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">שיוך שיעור לתלמיד/ה</CardTitle>
          <CardDescription>נמצא אירוע ביומן שאינו משויך לתלמיד/ה</CardDescription>
        </CardHeader>
        <CardBody>
          {!view ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary-50 text-muted">
                <Link2Off className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted">
                הקישור אינו תקין, פג תוקפו, או שהשיעור כבר שויך.
              </p>
            </div>
          ) : !view.needsMatch ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <StatusPill status="confirmed" label="שויך" />
              <p className="text-sm text-muted">השיעור כבר שויך לתלמיד/ה.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-center">
                <StatusPill status="needs_match" />
              </div>
              <dl className="space-y-3 rounded-xl border border-line bg-cream/50 p-4">
                <div className="flex items-start gap-3 text-sm">
                  <CalendarSearch className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted">אירוע</dt>
                    <dd className="text-ink">{view.title ?? 'ללא כותרת'}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted">מתי</dt>
                    <dd className="text-ink">{formatILDateTime(new Date(view.startISO))}</dd>
                  </div>
                </div>
              </dl>
              <AssignForm
                token={token}
                eventTitle={view.title}
                students={students.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
