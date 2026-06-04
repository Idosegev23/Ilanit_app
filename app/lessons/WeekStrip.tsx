'use client';

import * as React from 'react';
import {
  CalendarRange,
  LockOpen,
  Lock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Owner-only WEEK STRIP for /lessons: the upcoming weeks (Sunday→Saturday,
// Asia/Jerusalem) within the booking horizon, each with a "פתוח/סגור לתיאום"
// toggle. Personal-link booking is gated on these weeks — weeks start CLOSED and
// Ilanit opens them manually. Recurring lessons & group sessions are NOT gated.
// Talks to the owner-only /api/weeks route (auth-guarded server-side).

interface WeekItem {
  weekStartISO: string; // Sunday yyyy-MM-dd
  isOpen: boolean;
}

const HE_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parses a `yyyy-MM-dd` string into its date parts (no timezone math needed
 *  for display — we only render the calendar date the server computed). */
function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Saturday `yyyy-MM-dd` for a given Sunday `weekStartISO` (UTC calendar math). */
function weekEndISO(weekStartISO: string): string {
  const { y, m, d } = parseISO(weekStartISO);
  const sat = new Date(Date.UTC(y, m - 1, d) + 6 * MS_PER_DAY);
  const yy = sat.getUTCFullYear();
  const mm = String(sat.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(sat.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Human Hebrew range label, e.g. "7–13 ביוני" or "28 ביוני – 4 ביולי". */
function weekRangeLabel(weekStartISO: string): string {
  const start = parseISO(weekStartISO);
  const end = parseISO(weekEndISO(weekStartISO));
  const startMonth = HE_MONTHS[start.m - 1];
  const endMonth = HE_MONTHS[end.m - 1];
  if (start.m === end.m) {
    return `${start.d}–${end.d} ב${endMonth}`;
  }
  return `${start.d} ב${startMonth} – ${end.d} ב${endMonth}`;
}

function WeekCard({
  week,
  busy,
  onToggle,
}: {
  week: WeekItem;
  busy: boolean;
  onToggle: (week: WeekItem) => void;
}) {
  const { isOpen } = week;
  return (
    <div
      className={cn(
        'flex shrink-0 snap-start flex-col gap-3 rounded-2xl border p-4 shadow-soft transition-[border-color,box-shadow,background-color] duration-200 ease-out',
        'w-44',
        isOpen
          ? 'border-success/40 bg-success-soft'
          : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink" dir="rtl">
          {weekRangeLabel(week.weekStartISO)}
        </span>
        <span
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
            isOpen ? 'bg-success/15 text-success' : 'bg-primary-50 text-muted',
          )}
          aria-hidden="true"
        >
          {isOpen ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
        </span>
      </div>

      <p className="text-xs tabular-nums text-muted" dir="ltr">
        {week.weekStartISO}
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={isOpen}
        aria-label={`${isOpen ? 'סגור' : 'פתח'} שבוע ${weekRangeLabel(week.weekStartISO)} לתיאום`}
        disabled={busy}
        onClick={() => onToggle(week)}
        className={cn(
          'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60',
          isOpen
            ? 'bg-success text-white shadow-soft hover:brightness-95'
            : 'border border-line bg-surface text-ink shadow-soft hover:bg-primary-50 hover:border-primary-200',
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : isOpen ? (
          <LockOpen className="size-4" aria-hidden="true" />
        ) : (
          <Lock className="size-4" aria-hidden="true" />
        )}
        {isOpen ? 'פתוח לתיאום' : 'סגור לתיאום'}
      </button>
    </div>
  );
}

export function WeekStrip() {
  const [weeks, setWeeks] = React.useState<WeekItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyWeek, setBusyWeek] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/weeks', { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      const json = (await res.json()) as { weeks: WeekItem[] };
      setWeeks(json.weeks);
    } catch {
      setError('שגיאה בטעינת השבועות. נסו לרענן את העמוד.');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(week: WeekItem) {
    setError(null);
    setBusyWeek(week.weekStartISO);
    const nextOpen = !week.isOpen;
    try {
      const res = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ weekStartISO: week.weekStartISO, open: nextOpen }),
      });
      if (!res.ok) throw new Error('toggle failed');
      // Optimistically reflect the new state (server echoes the same value).
      setWeeks((prev) =>
        prev
          ? prev.map((w) =>
              w.weekStartISO === week.weekStartISO ? { ...w, isOpen: nextOpen } : w,
            )
          : prev,
      );
    } catch {
      setError('שגיאה בעדכון סטטוס השבוע. נסו שוב.');
    } finally {
      setBusyWeek(null);
    }
  }

  const openCount = weeks?.filter((w) => w.isOpen).length ?? 0;

  return (
    <Card>
      <CardHeader variant="gradient">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-warm text-primary-fg shadow-soft"
              aria-hidden="true"
            >
              <CalendarRange className="size-5" />
            </span>
            <div>
              <CardTitle>שבועות פתוחים לתיאום</CardTitle>
              <p className="text-sm text-muted">
                אילנית פותחת שבוע ידנית — רק שבוע פתוח ניתן לתיאום בקישורים האישיים.
              </p>
            </div>
          </div>
          {weeks && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold tabular-nums text-success"
              aria-hidden="true"
            >
              <LockOpen className="size-3.5" />
              {openCount} פתוחים
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {weeks === null ? (
          <div
            className="flex items-center gap-2 px-1 py-6 text-sm text-muted"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            טוען שבועות…
          </div>
        ) : weeks.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted">
            אין שבועות בטווח האופק להצגה.
          </p>
        ) : (
          <div
            className="flex snap-x gap-3 overflow-x-auto pb-2"
            role="group"
            aria-label="שבועות לתיאום"
          >
            {weeks.map((week) => (
              <WeekCard
                key={week.weekStartISO}
                week={week}
                busy={busyWeek === week.weekStartISO}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
