import { CalendarClock, Link2Off, Hourglass } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { peekStandbyOffer, weekdaysLabel } from '@/lib/standby';
import { formatILDateTime } from '@/lib/time';
import { StandbyApproval } from './StandbyApproval';

// Owner-only (token-authorized) approval page reached from the WhatsApp alert.
// Shows the freed slot + the waitlisted people who match it; Ilanit picks one to
// place on the slot. Read-only peek — approving happens via the client action.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'רשימת המתנה — אילנית' };

export default async function StandbyApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekStandbyOffer(token);

  return (
    <AuthLayout
      eyebrow="רשימת המתנה"
      valueProp="התפנתה משבצת — אפשר לשבץ אליה מישהו מרשימת ההמתנה שמתאים לטווח."
      highlights={[
        'בחירת מי מקבל את המקום',
        'השיעור נקבע ונכנס ליומן',
        'התלמיד/ה מקבל/ת אישור ותזכורת',
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
            שיבוץ מרשימת המתנה
          </h1>
          {view && (
            <p className="mt-1 text-sm leading-relaxed text-muted">
              התפנה מקום ל־
              <span dir="ltr" className="font-semibold text-ink tabular-nums">
                {formatILDateTime(view.offer.startsAt)}
              </span>
            </p>
          )}
        </div>
      </header>

      {!view ? (
        <InvalidLink />
      ) : view.matches.length === 0 ? (
        <NoMatches />
      ) : (
        <StandbyApproval
          token={token}
          slotLabel={formatILDateTime(view.offer.startsAt)}
          candidates={view.matches.map((m) => ({
            id: m.id,
            name: m.name,
            phone: m.phone,
            pref: `${weekdaysLabel(m.weekdays.split(',').map(Number))} · ${m.startTime}–${m.endTime}`,
          }))}
        />
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
        הקישור אינו תקין, פג תוקפו, או שהמקום כבר שובץ.
      </p>
    </div>
  );
}

function NoMatches() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-6 py-12 text-center shadow-soft backdrop-blur animate-fade-in">
      <span
        className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-700 ring-1 ring-white/70"
        aria-hidden="true"
      >
        <Hourglass className="size-7 float-soft" />
      </span>
      <p className="max-w-xs text-sm leading-relaxed text-muted">
        אין כרגע אף אחד ברשימת ההמתנה שמתאים למשבצת הזו.
      </p>
    </div>
  );
}
