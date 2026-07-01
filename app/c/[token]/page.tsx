import { CalendarClock, Clock, Link2Off, CheckCheck } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { StatusPill } from '@/components/ui/badge';
import { peekCancelToken } from '@/lib/availability/cancel';
import { formatILDateTime } from '@/lib/time';
import { CancelActions } from '@/app/c/[token]/CancelActions';

// Self-service cancel / reschedule landing page reached from the WhatsApp link
// (no login). Shows the lesson and a cancel button; the token is consumed only
// when the student confirms (via /api/cancel), so reloading the page is safe.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שינוי או ביטול מועד — אילנית' };

export default async function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekCancelToken(token);

  return (
    <AuthLayout
      eyebrow="שינוי מועד"
      valueProp="אפשר לבטל את המועד הקיים ולקבוע מועד חדש שמתאים לך — הכל מהנייד."
      highlights={[
        'ביטול המועד משחרר את הזמן ביומן',
        'קביעת מועד חדש בקישור הקבוע',
        'הבקשה החדשה תעבור לאישור אילנית',
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
          <h1 className="text-xl font-bold leading-tight text-ink">שינוי או ביטול מועד</h1>
          <p className="mt-0.5 text-sm text-muted">ביטול המועד הקיים וקביעת מועד חדש</p>
        </div>
      </header>

      {!view ? (
        <InvalidLink />
      ) : !view.cancellable ? (
        <AlreadyHandled status={view.status} />
      ) : (
        <div className="space-y-5">
          <dl className="overflow-hidden rounded-2xl border border-line bg-gradient-tint">
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-primary-600 shadow-soft"
                aria-hidden="true"
              >
                <Clock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-xs font-medium text-muted">המועד הנוכחי</dt>
                <dd className="mt-0.5 leading-snug text-ink">
                  {formatILDateTime(new Date(view.startISO))}
                </dd>
              </div>
            </div>
          </dl>
          <CancelActions token={token} />
        </div>
      )}
    </AuthLayout>
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
        הקישור אינו תקין, פג תוקפו, או שהמועד כבר טופל.
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
      <p className="text-sm text-muted">המועד כבר בוטל או שאינו פעיל.</p>
    </div>
  );
}
