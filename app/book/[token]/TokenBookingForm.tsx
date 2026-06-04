'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { loadBookingWeek, type BookingWeekView } from '@/app/book/[token]/actions';

// Token-based booking flow (RTL Hebrew). The student is ALREADY known (resolved
// server-side from the personal link), so there is NO name/phone entry.
//
// The picker is a 7-day WEEK grid (Sunday→Saturday, Asia/Jerusalem): each day
// lists its bookable slots as selectable pills, with prev/next-week navigation
// clamped to the booking horizon. A week is only bookable if Ilanit OPENED it —
// a closed week shows a warm notice (and the initial load already auto-jumps to
// the nearest open week, server-side). Pick a slot → optional email + notes →
// submit { token, startISO, endISO, email?, notes? } to /api/book → the normal
// "pending approval" confirmation.

interface Slot {
  startISO: string;
  endISO: string;
  label: string;
}

interface TokenBookingFormProps {
  token: string;
  studentName: string;
  /** Pre-fills the email field when the student already has one on file. */
  studentEmail?: string | null;
  /** Week view resolved server-side (already jumped to the nearest open week). */
  initialWeek: BookingWeekView;
}

// Hebrew weekday headers, Sunday→Saturday (index = weekday 0..6).
const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

const CLOSED_WEEK_NOTICE = 'השבוע הזה עדיין לא נפתח לתיאום — נסו שבוע אחר';

/** Day-of-month from a `yyyy-MM-dd` string (display only). */
function dayOfMonth(iso: string): string {
  const d = iso.split('-')[2];
  return d ? String(Number(d)) : iso;
}

/**
 * Adds `deltaWeeks` to a `yyyy-MM-dd` Sunday, returning a `yyyy-MM-dd`. Uses
 * UTC-noon arithmetic to stay DST-safe; the SERVER re-normalizes this to the
 * exact Asia/Jerusalem Sunday and clamps it to the booking horizon, so this is
 * only a navigation hint, never the source of truth.
 */
function addWeeksISO(iso: string, deltaWeeks: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  base.setUTCDate(base.getUTCDate() + deltaWeeks * 7);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Friendly Hebrew date label (e.g. "יום שלישי, 3 ביוני") for a `yyyy-MM-dd`.
function formatDateHe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}

// Friendly Hebrew label for a week range, e.g. "7–13 ביוני".
function formatWeekRangeHe(sundayISO: string, saturdayISO: string): string {
  const [, sm, sd] = sundayISO.split('-').map(Number);
  const [, em, ed] = saturdayISO.split('-').map(Number);
  if (!sd || !ed) return sundayISO;
  try {
    const monthName = (mIdx: number) =>
      new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(2000, mIdx - 1, 1));
    if (sm === em) return `${sd}–${ed} ב${monthName(em)}`;
    return `${sd} ב${monthName(sm)} – ${ed} ב${monthName(em)}`;
  } catch {
    return `${sundayISO} – ${saturdayISO}`;
  }
}

type Phase = 'pick' | 'confirm' | 'done';

export function TokenBookingForm({
  token,
  studentName,
  studentEmail,
  initialWeek,
}: TokenBookingFormProps) {
  const [view, setView] = React.useState<BookingWeekView>(initialWeek);
  const [navigating, setNavigating] = React.useState(false);
  const [navError, setNavError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Slot | null>(null);
  /** `yyyy-MM-dd` of the selected slot's day (for the confirm/done date label). */
  const [selectedDateISO, setSelectedDateISO] = React.useState<string | null>(null);

  const [phase, setPhase] = React.useState<Phase>('pick');
  const [email, setEmail] = React.useState(studentEmail ?? '');
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const { week, firstWeekStart, lastWeekStart } = view;
  const sundayISO = week.days[0]?.dateISO ?? week.weekStartISO;
  const saturdayISO = week.days[6]?.dateISO ?? week.weekStartISO;
  const canPrev = !navigating && week.weekStartISO > firstWeekStart;
  const canNext = !navigating && week.weekStartISO < lastWeekStart;
  const totalSlots = week.days.reduce((sum, d) => sum + d.slots.length, 0);

  const navigateWeek = React.useCallback(
    async (delta: number) => {
      setNavigating(true);
      setNavError(null);
      setSelected(null);
      setSelectedDateISO(null);
      setPhase('pick');
      try {
        const targetWeekStart = addWeeksISO(view.week.weekStartISO, delta);
        const next = await loadBookingWeek(targetWeekStart);
        setView(next);
      } catch {
        setNavError('שגיאה בטעינת השבוע');
      } finally {
        setNavigating(false);
      }
    },
    [view.week.weekStartISO],
  );

  function pickSlot(slot: Slot, dateISO: string) {
    setSelected(slot);
    setSelectedDateISO(dateISO);
    setPhase('confirm');
    setFormError(null);
  }

  async function refreshAfterConflict() {
    // Reload the current week so the now-taken slot disappears.
    try {
      const fresh = await loadBookingWeek(view.week.weekStartISO);
      setView(fresh);
    } catch {
      /* keep stale view; the user can navigate to refresh */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
          startISO: selected.startISO,
          endISO: selected.endISO,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error ?? 'שגיאה בקביעת השיעור');
        if (res.status === 409) {
          // slot taken meanwhile — bounce back to picking and refresh the week
          setPhase('pick');
          setSelected(null);
          setSelectedDateISO(null);
          void refreshAfterConflict();
        }
        return;
      }
      setPhase('done');
    } catch {
      setFormError('שגיאה בקביעת השיעור');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success: "ממתין לאישור" ────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <Card className="overflow-hidden shadow-pop">
        <CardBody className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/15">
            <span className="flex size-14 items-center justify-center rounded-full bg-surface text-success shadow-soft">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
          </span>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-ink">הבקשה התקבלה!</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning">
              <Clock className="size-3.5" aria-hidden="true" />
              ממתין לאישור
            </span>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-muted">
            הבקשה לשיעור ביום{' '}
            <span className="font-semibold text-ink">
              {selectedDateISO ? formatDateHe(selectedDateISO) : ''}
            </span>{' '}
            בשעה{' '}
            <span className="font-semibold text-ink tabular-nums" dir="ltr">
              {selected?.label}
            </span>{' '}
            התקבלה וממתינה לאישור של אילנית.
          </p>
          <p className="max-w-sm text-sm text-muted">
            תקבל/י הודעת וואטסאפ ברגע שהשיעור יאושר.
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="mt-2"
            onClick={() => {
              setPhase('pick');
              setSelected(null);
              setSelectedDateISO(null);
              setNotes('');
            }}
          >
            לקביעת שיעור נוסף
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-pop">
      {/* Gradient header carrying the known student's identity — sets the tone
          and removes the "blank form" feeling. */}
      <CardHeader variant="gradient" className="gap-0 pb-5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-card">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-text">
              קביעת שיעור עבור
            </p>
            <p className="truncate text-lg font-bold text-ink">{studentName}</p>
          </div>
          <Sparkles
            className="ms-auto size-5 shrink-0 text-primary-300"
            aria-hidden="true"
          />
        </div>
      </CardHeader>

      <CardBody className="space-y-6 pt-5">
        {/* ── Confirm step — optional email + notes, then submit. ───────────── */}
        {phase === 'confirm' && selected ? (
          <form className="space-y-4" onSubmit={submit}>
            {/* Selected-slot recap */}
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-tint px-4 py-3.5 ring-1 ring-line">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-soft">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-accent-text">
                  המועד שנבחר
                </p>
                <p className="text-sm font-semibold text-ink">
                  <span dir="ltr" className="tabular-nums">
                    {selected.label}
                  </span>{' '}
                  · {selectedDateISO ? formatDateHe(selectedDateISO) : ''}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-email">
                אימייל <span className="font-normal text-accent-text">(מומלץ)</span>
              </Label>
              <Input
                id="book-email"
                type="email"
                dir="ltr"
                className="text-end"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                aria-describedby="book-email-help"
              />
              <p id="book-email-help" className="text-xs leading-relaxed text-muted">
                אם תזינו אימייל, השיעור ייכנס אוטומטית ליומן Google שלכם.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-notes">הערות</Label>
              <Textarea
                id="book-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="נושא השיעור, בקשות מיוחדות…"
              />
            </div>

            <div aria-live="polite">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhase('pick');
                  setSelected(null);
                  setSelectedDateISO(null);
                }}
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                חזרה לבחירת מועד
              </Button>
              <Button type="submit" size="lg" loading={submitting} className="sm:ms-auto">
                {submitting ? 'שולח…' : 'אישור וקביעת השיעור'}
              </Button>
            </div>
          </form>
        ) : (
          /* ── Pick step — week navigation + 7-day grid. ──────────────────── */
          <div className="space-y-5">
            {/* Week navigation header */}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-11 shrink-0 px-0"
                onClick={() => void navigateWeek(-1)}
                disabled={!canPrev}
                aria-label="השבוע הקודם"
              >
                {/* RTL: "previous" points to the right. */}
                <ChevronRight className="size-5" aria-hidden="true" />
              </Button>

              <div className="min-w-0 flex-1 text-center">
                <p className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                  <CalendarDays className="size-4 text-primary-600" aria-hidden="true" />
                  <span className="truncate">{formatWeekRangeHe(sundayISO, saturdayISO)}</span>
                </p>
                {week.isOpen && !navigating && totalSlots > 0 && (
                  <span className="mt-1 inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary-600">
                    {totalSlots} מועדים פנויים
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-11 shrink-0 px-0"
                onClick={() => void navigateWeek(1)}
                disabled={!canNext}
                aria-label="השבוע הבא"
              >
                {/* RTL: "next" points to the left. */}
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
            </div>

            {navError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{navError}</span>
              </div>
            )}

            {/* Loading skeleton while navigating between weeks */}
            {navigating ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-2xl" />
                ))}
              </div>
            ) : !week.isOpen ? (
              /* Closed week → friendly notice (per contract copy). */
              <div aria-live="polite">
                <EmptyState
                  icon={Lock}
                  title="השבוע הזה עדיין לא נפתח לתיאום"
                  description={CLOSED_WEEK_NOTICE}
                />
              </div>
            ) : totalSlots === 0 ? (
              /* Open but fully booked / no template windows this week. */
              <div aria-live="polite">
                <EmptyState
                  icon={CalendarX2}
                  title="אין מועדים פנויים בשבוע זה"
                  description="נסו לעבור לשבוע אחר — ייתכן שיתפנו מועדים בקרוב."
                />
              </div>
            ) : (
              /* The 7-day grid (Sun→Sat). */
              <div
                role="group"
                aria-label="ימים ומועדים פנויים השבוע"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {week.days.map((day) => (
                  <div
                    key={day.dateISO}
                    className={cn(
                      'flex flex-col gap-2 rounded-2xl border p-3',
                      day.slots.length > 0
                        ? 'border-line bg-surface shadow-soft'
                        : 'border-dashed border-line bg-gradient-tint',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-sm font-semibold text-ink">
                        <span className="hidden sm:inline">יום </span>
                        <span className="sm:hidden">{WEEKDAY_SHORT[day.weekday]}</span>
                        <span className="hidden sm:inline">{WEEKDAY_LABELS[day.weekday]}</span>
                      </span>
                      <span className="text-xs font-medium tabular-nums text-muted">
                        {dayOfMonth(day.dateISO)}
                      </span>
                    </div>

                    {day.slots.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted">אין מועדים</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {day.slots.map((s, i) => {
                          const isSelected = selected?.startISO === s.startISO;
                          return (
                            <button
                              key={s.startISO}
                              type="button"
                              onClick={() => pickSlot(s, day.dateISO)}
                              aria-pressed={isSelected}
                              dir="ltr"
                              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                              className={cn(
                                'group inline-flex h-11 animate-fade-in items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums shadow-soft transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
                                'hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50 hover:shadow-card active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-primary',
                                isSelected
                                  ? 'border-primary bg-primary text-primary-fg shadow-card hover:bg-primary-600'
                                  : 'border-line bg-surface text-ink',
                              )}
                            >
                              <Clock
                                className={cn(
                                  'size-3.5 transition-colors',
                                  isSelected
                                    ? 'text-primary-fg/90'
                                    : 'text-primary-300 group-hover:text-primary-600',
                                )}
                                aria-hidden="true"
                              />
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
