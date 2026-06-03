import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>שיוך שיעור לתלמיד/ה</CardTitle>
        </CardHeader>
        <CardContent>
          {!view ? (
            <p className="text-sm text-slate-600">
              הקישור אינו תקין, פג תוקפו, או שהשיעור כבר שויך.
            </p>
          ) : !view.needsMatch ? (
            <p className="text-sm text-slate-600">השיעור כבר שויך לתלמיד/ה.</p>
          ) : (
            <div className="space-y-4">
              <dl className="space-y-1 text-sm text-slate-700">
                <div>
                  <dt className="inline font-medium">אירוע: </dt>
                  <dd className="inline">{view.title ?? 'ללא כותרת'}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">מתי: </dt>
                  <dd className="inline">{formatILDateTime(new Date(view.startISO))}</dd>
                </div>
              </dl>
              <AssignForm
                token={token}
                eventTitle={view.title}
                students={students.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
