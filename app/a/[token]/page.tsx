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
      <header className="mb-6 flex items-start gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft"
          aria-hidden="true"
        >
          <CalendarClock className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-ink">אישור שיעור</h1>
          <p className="mt-0.5 text-sm text-muted">
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
          <dl className="overflow-hidden rounded-2xl border border-line bg-gradient-tint">
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
                  <span className="tabular-nums font-semibold text-ink">
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
    <div className="flex items-start gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-b-0">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-primary-600 shadow-soft"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-6 py-10 text-center">
      <span
        className="flex size-14 items-center justify-center rounded-full bg-primary-50 text-muted"
        aria-hidden="true"
      >
        <Link2Off className="size-6" />
      </span>
      <p className="text-sm leading-relaxed text-muted">
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-6 py-10 text-center">
      <span
        className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success"
        aria-hidden="true"
      >
        <CheckCheck className="size-6" />
      </span>
      <StatusPill status={status} />
      <p className="text-sm text-muted">השיעור כבר טופל.</p>
    </div>
  );
}
