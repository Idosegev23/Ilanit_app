import {
  UserPlus,
  Clock,
  CalendarSearch,
  Link2Off,
  CheckCheck,
  type LucideIcon,
} from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
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
    <AuthLayout
      eyebrow="שיוך שיעור"
      valueProp="נמצא אירוע ביומן שאינו משויך — בחרי תלמיד/ה לשיוך מהיר."
      highlights={[
        'השיעור מתחבר לתיק התלמיד/ה',
        'אפשר לזכור את השיוך לאירועים עתידיים',
        'התשלומים והקבלות מתעדכנים בהתאם',
      ]}
    >
      <header className="mb-6 flex items-start gap-3.5 rise">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-cta text-ink shadow-glow"
          aria-hidden="true"
        >
          <UserPlus className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink">
            שיוך שיעור לתלמיד/ה
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            נמצא אירוע ביומן שאינו משויך לתלמיד/ה
          </p>
        </div>
      </header>

      {!view ? (
        <InvalidLink />
      ) : !view.needsMatch ? (
        <AlreadyAssigned />
      ) : (
        <div className="space-y-5">
          <dl className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 shadow-soft backdrop-blur">
            <DetailRow
              icon={CalendarSearch}
              label="אירוע"
              value={view.title ?? 'ללא כותרת'}
            />
            <DetailRow
              icon={Clock}
              label="מתי"
              value={formatILDateTime(new Date(view.startISO))}
            />
          </dl>
          <AssignForm
            token={token}
            eventTitle={view.title}
            students={students.map((s) => ({
              id: s.id,
              name: s.name,
              phone: s.phone ?? '',
            }))}
          />
        </div>
      )}
    </AuthLayout>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/70 px-4 py-3.5 text-sm last:border-b-0">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 ring-1 ring-white/70"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {label}
        </dt>
        <dd className="mt-0.5 font-medium leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-primary-50 text-muted ring-1 ring-white/70"
        aria-hidden="true"
      >
        <Link2Off className="size-7" />
      </span>
      <p className="max-w-xs text-sm leading-relaxed text-muted">
        הקישור אינו תקין, פג תוקפו, או שהשיעור כבר שויך.
      </p>
    </div>
  );
}

function AlreadyAssigned() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20"
        aria-hidden="true"
      >
        <CheckCheck className="size-7" />
      </span>
      <StatusPill status="confirmed" label="שויך" />
      <p className="text-sm text-muted">השיעור כבר שויך לתלמיד/ה.</p>
    </div>
  );
}
