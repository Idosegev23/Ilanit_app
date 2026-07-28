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
      <header className="mb-6 flex items-start gap-3.5 rise">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-cta text-ink shadow-glow"
          aria-hidden="true"
        >
          <CalendarClock className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink">
            שינוי או ביטול מועד
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            ביטול המועד הקיים וקביעת מועד חדש
          </p>
        </div>
      </header>

      {!view ? (
        <InvalidLink />
      ) : !view.cancellable ? (
        <AlreadyHandled status={view.status} />
      ) : (
        <div className="space-y-5">
          <dl className="overflow-hidden rounded-2xl bg-primary-soft shadow-soft ring-1 ring-white/60">
            <div className="flex items-center gap-3.5 px-4 py-4 text-sm">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow"
                aria-hidden="true"
              >
                <Clock className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-700">
                  המועד הנוכחי
                </dt>
                <dd className="mt-0.5 text-base font-extrabold leading-snug tracking-tight text-ink tabular-nums">
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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-primary-50 text-muted ring-1 ring-white/70"
        aria-hidden="true"
      >
        <Link2Off className="size-7" />
      </span>
      <p className="max-w-xs text-sm leading-relaxed text-muted">
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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20"
        aria-hidden="true"
      >
        <CheckCheck className="size-7" />
      </span>
      <StatusPill status={status} />
      <p className="text-sm text-muted">המועד כבר בוטל או שאינו פעיל.</p>
    </div>
  );
}
