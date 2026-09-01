import { CheckCircle2, CalendarClock, Wallet, MapPin, Users } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';

/*
  Confirmation after a group is created.

  Creating a group also generates its recurring sessions, which is a lot to
  happen behind a redirect that lands on a page looking like any other. This
  states plainly what was saved — when it meets, what it costs, and how many
  sessions went into the diary — so "did that work?" is answered before it is
  asked.
*/

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export interface CreatedSlot {
  weekday: number;
  startTime: string;
  durationMin: number;
}

export function GroupCreatedBanner({
  name,
  monthlyPrice,
  location,
  maxMembers,
  slots,
  sessionCount,
}: {
  name: string;
  monthlyPrice: number;
  location: string;
  maxMembers: number;
  slots: CreatedSlot[];
  sessionCount: number;
}) {
  return (
    <Card className="border-success/30 shadow-pop animate-scale-in">
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success ring-1 ring-success/20"
          >
            <CheckCircle2 className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-success">
              נשמר בהצלחה
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink">
              הקבוצה «{name}» נוצרה
            </h2>
          </div>
        </div>

        <dl className="grid gap-2.5 sm:grid-cols-2">
          <Row icon={CalendarClock} label="מפגשים שבועיים">
            {slots.length === 0 ? (
              <span className="text-muted">לא הוגדר מועד קבוע</span>
            ) : (
              <span className="flex flex-col gap-0.5">
                {slots.map((s, i) => (
                  <span key={i}>
                    יום {WEEKDAYS[s.weekday] ?? s.weekday} ·{' '}
                    <span dir="ltr" className="tabular-nums">
                      {s.startTime.slice(0, 5)}
                    </span>{' '}
                    · {s.durationMin} דק׳
                  </span>
                ))}
              </span>
            )}
          </Row>
          <Row icon={Wallet} label="מחיר לחבר / חודש">
            <span className="tabular-nums">{monthlyPrice}₪</span>
          </Row>
          <Row icon={MapPin} label="מיקום">
            {location || <span className="text-muted">לא הוגדר</span>}
          </Row>
          <Row icon={Users} label="קיבולת">
            <span className="tabular-nums">עד {maxMembers} תלמידים</span>
          </Row>
        </dl>

        <p className="rounded-xl bg-success-soft/60 px-3.5 py-2.5 text-sm text-ink ring-1 ring-success/20">
          {sessionCount > 0
            ? `נוצרו ${sessionCount} מפגשים ביומן. עכשיו אפשר לצרף תלמידים — הם יקבלו תזכורת לפני כל מפגש ודרישת תשלום ב-1 לחודש.`
            : 'עכשיו אפשר לצרף תלמידים לקבוצה.'}
        </p>
      </CardBody>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Users;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/60 p-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-700"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="text-sm font-semibold text-ink">{children}</dd>
      </div>
    </div>
  );
}
