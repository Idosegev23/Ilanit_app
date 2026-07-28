import {
  CalendarClock,
  Clock,
  MapPin,
  CircleDollarSign,
  User,
  StickyNote,
  Link2Off,
  CheckCheck,
} from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { StatusPill } from '@/components/ui/badge';
import { peekApproveToken } from '@/lib/availability/approval';
import { formatILDateTime } from '@/lib/time';
import { formatShekels } from '@/lib/utils';
import { ApproveActions } from '@/app/a/[token]/ApproveActions';

// Approval landing page reached from the WhatsApp link (no login). Shows the
// pending lesson and approve/reject buttons. The token is consumed only when a
// decision is submitted (via /api/approve), so reloading the page is safe.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אישור שיעור — אילנית' };

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekApproveToken(token);

  return (
    <AuthLayout
      eyebrow="אישור תיאום"
      valueProp="בקשת תיאום חדשה ממתינה לאישורך — אישור בלחיצה אחת מהנייד."
      highlights={[
        'אישור מוסיף את השיעור ליומן אוטומטית',
        'התלמיד/ה מקבל/ת הודעת אישור מיידית',
        'דחייה שולחת לינק לקביעה מחדש',
      ]}
    >
      <header className="mb-6 flex items-start gap-3.5 rise">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-cta text-ink shadow-glow"
          aria-hidden="true"
        >
          <CalendarClock className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink">
            אישור שיעור
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            בקשת תיאום חדשה ממתינה לאישורך
          </p>
        </div>
      </header>

      {!view ? (
        <InvalidLink />
      ) : view.status !== 'pending' ? (
        <AlreadyHandled status={view.status} />
      ) : (
        <div className="space-y-5">
          <dl className="overflow-hidden rounded-2xl border border-white/60 bg-white/65 shadow-soft backdrop-blur">
            <DetailRow icon={User} label="תלמיד/ה" value={view.studentName} />
            <DetailRow
              icon={Clock}
              label="מתי"
              value={formatILDateTime(new Date(view.startISO))}
            />
            {view.location && (
              <DetailRow icon={MapPin} label="כתובת" value={view.location} />
            )}
            {view.price != null && (
              <DetailRow
                icon={CircleDollarSign}
                label="מחיר"
                value={
                  <span className="text-base font-extrabold tracking-tight text-ink tabular-nums">
                    {formatShekels(view.price)}
                  </span>
                }
              />
            )}
            {view.notes && (
              <DetailRow icon={StickyNote} label="הערות" value={view.notes} />
            )}
          </dl>
          <ApproveActions token={token} />
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
  icon: typeof User;
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
        הקישור אינו תקין, פג תוקפו, או שהשיעור כבר טופל.
      </p>
    </div>
  );
}

function AlreadyHandled({
  status,
}: {
  status: React.ComponentProps<typeof StatusPill>['status'];
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20"
        aria-hidden="true"
      >
        <CheckCheck className="size-7" />
      </span>
      <StatusPill status={status} />
      <p className="text-sm text-muted">השיעור כבר טופל.</p>
    </div>
  );
}
