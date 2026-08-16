'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarX2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
//
// v4 layout note: the week reads as a vertical LIST of day rows rather than a
// grid of day cards. At 390px — where most of this traffic lands, arriving from
// a WhatsApp link — a day row gets the full column width, so each time pill is a
// comfortable half-width target instead of a ~100px sliver inside a 2-up card.
// The same markup fans out to 3–4 pills per row on wider screens.

interface Slot {
  startISO: string;
  endISO: string;
  label: string;
}

interface TokenBookingFormProps {
  token: string;
  studentName: string;
  /**
   * True for a GENERIC invite — the student is a blank placeholder, so the
   * recipient must fill in their own name/phone (and optional parent + email)
   * before booking. False when Ilanit sent a known student their personal link.
   */
  needsDetails?: boolean;
  /**
   * Permanent PUBLIC booking page (bare /book, no token). The visitor fills their
   * own details and books directly against the open endpoint; supports booking
   * several lessons in a row without re-entering details.
   */
  publicBooking?: boolean;
  /** Pre-fills the email field when the student already has one on file. */
  studentEmail?: string | null;
  studentGuardianName?: string | null;
  studentGuardianPhone?: string | null;
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

/** One of several students reachable at the entered phone (siblings). */
interface StudentChoice {
  id: string;
  name: string;
}

export function TokenBookingForm({
  token,
  studentName,
  needsDetails = false,
  publicBooking = false,
  studentEmail,
  studentGuardianName,
  studentGuardianPhone,
  initialWeek,
}: TokenBookingFormProps) {
  // The visitor fills their own details for a public booking or a blank invite.
  const requireDetails = needsDetails || publicBooking;

  const [view, setView] = React.useState<BookingWeekView>(initialWeek);
  const [navigating, setNavigating] = React.useState(false);
  const [navError, setNavError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Slot | null>(null);
  /** `yyyy-MM-dd` of the selected slot's day (for the confirm/done date label). */
  const [selectedDateISO, setSelectedDateISO] = React.useState<string | null>(null);

  const [phase, setPhase] = React.useState<Phase>('pick');
  // Visitor-supplied details. Prefilled from the student when known; empty for a
  // public/fresh booking. `detailsLocked` flips true after the first successful
  // booking so additional lessons don't re-ask for the same details.
  const [name, setName] = React.useState(requireDetails ? '' : studentName);
  const [phone, setPhone] = React.useState('');
  const [guardianName, setGuardianName] = React.useState(studentGuardianName ?? '');
  const [guardianPhone, setGuardianPhone] = React.useState(studentGuardianPhone ?? '');
  const [email, setEmail] = React.useState(studentEmail ?? '');
  const [notes, setNotes] = React.useState('');
  const [detailsLocked, setDetailsLocked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  /**
   * Set when the entered phone reaches more than one student — siblings under a
   * parent's number. Non-null means "the booking is paused on a question", not
   * "the booking failed".
   */
  const [candidates, setCandidates] = React.useState<StudentChoice[] | null>(null);

  // Identity shown in the header: public/fresh bookings have no real name yet.
  const headerName = requireDetails ? (name.trim() || 'תיאום שיעור') : studentName;

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

  /**
   * Books the selected slot. `studentIdOverride` carries the answer to "which
   * sibling?" on the re-submit after the visitor tapped a capsule.
   */
  async function doBook(studentIdOverride?: string) {
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Public page books against the open endpoint; a token page sends its token.
          ...(publicBooking ? { open: true } : { token }),
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
          startISO: selected.startISO,
          endISO: selected.endISO,
          ...(studentIdOverride ? { studentId: studentIdOverride } : {}),
          ...(requireDetails
            ? {
                name: name.trim(),
                phone: phone.trim(),
                guardianName: guardianName.trim() || undefined,
                guardianPhone: guardianPhone.trim() || undefined,
              }
            : {}),
        }),
      });
      const json = await res.json();

      // Siblings share this number — ask who, then re-submit. This MUST be
      // checked before the generic 409 branch below, which is the slot-taken
      // path: falling through would throw the visitor back to slot selection
      // for what is really a question, not a conflict.
      if (!res.ok && json?.needsStudentChoice) {
        setCandidates(json.candidates ?? []);
        setFormError(null);
        return;
      }

      if (!res.ok || !json.ok) {
        setFormError(json.error ?? 'שגיאה בקביעת השיעור');
        if (res.status === 409) {
          // slot taken meanwhile — bounce back to picking and refresh the week
          setPhase('pick');
          setSelected(null);
          setSelectedDateISO(null);
          setCandidates(null);
          void refreshAfterConflict();
        }
        return;
      }
      // Details are saved now — don't re-ask when booking further lessons.
      if (requireDetails) setDetailsLocked(true);
      setCandidates(null);
      setPhase('done');
    } catch {
      setFormError('שגיאה בקביעת השיעור');
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (requireDetails) {
      if (!name.trim()) {
        setFormError('יש להזין שם מלא');
        return;
      }
      if (!phone.trim()) {
        setFormError('יש להזין מספר טלפון');
        return;
      }
    }
    await doBook();
  }

  // ── Success: the lesson is BOOKED ──────────────────────────────────────
  // Not "pending": bookLesson writes status 'confirmed' with confirmedAt set,
  // and dispatches booking_approved_student ("השיעור שלך אושר"). There is no
  // approval step and no code path that creates a pending lesson, so promising
  // one here left the student waiting for a second message that never comes.
  //
  // The one moment worth celebrating in the whole flow, so it gets the full
  // treatment: glass over the aurora, blush blobs, a haloed success medallion.
  if (phase === 'done') {
    return (
      <Card className="relative overflow-hidden shadow-pop animate-scale-in">
        <span aria-hidden="true" className="blob -top-24 -end-16 size-64 bg-primary" />
        <span aria-hidden="true" className="blob -bottom-28 -start-20 size-72 bg-accent" />

        <CardBody className="relative z-10 flex flex-col items-center gap-5 px-6 py-14 text-center">
          <span className="flex size-24 items-center justify-center rounded-full bg-white/70 shadow-glow ring-1 ring-white/70 backdrop-blur">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
              <CheckCircle2 className="size-9" aria-hidden="true" />
            </span>
          </span>

          <div className="flex flex-col items-center gap-3">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
              השיעור נקבע!
            </h2>
            <Badge tone="success" className="px-3.5 py-1.5 text-sm">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              מאושר
            </Badge>
          </div>

          <p className="max-w-sm text-base leading-relaxed text-muted">
            השיעור שלך ביום{' '}
            <span className="font-semibold text-ink">
              {selectedDateISO ? formatDateHe(selectedDateISO) : ''}
            </span>{' '}
            בשעה{' '}
            <span className="font-semibold text-ink tabular-nums" dir="ltr">
              {selected?.label}
            </span>{' '}
            נקבע ואושר.
          </p>
          <p className="max-w-sm text-sm text-muted">
            שלחנו לך הודעת וואטסאפ עם כל הפרטים, קישור להוספה ליומן וקישור לביטול.
          </p>

          <Button
            variant="secondary"
            size="lg"
            className="mt-2 w-full sm:w-auto"
            onClick={() => {
              setPhase('pick');
              setSelected(null);
              setSelectedDateISO(null);
              setNotes('');
            }}
          >
            <CalendarDays className="size-5" aria-hidden="true" />
            לקביעת שיעור נוסף
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-pop">
      {/* Blush header carrying the known student's identity — sets the tone and
          removes the "blank form" feeling. The blob sits at z-0, so the row of
          real content is explicitly lifted to z-10. */}
      <CardHeader
        variant="gradient"
        className="relative gap-0 overflow-hidden pb-5 pt-6"
      >
        <span aria-hidden="true" className="blob -top-20 -end-10 size-44 bg-primary" />
        <div className="relative z-10 flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-cta text-ink shadow-glow">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-700">
              {requireDetails ? 'קביעת שיעור עם אילנית' : 'קביעת שיעור עבור'}
            </p>
            <p className="truncate text-xl font-extrabold tracking-tight text-ink">
              {headerName}
            </p>
          </div>
          <Sparkles
            className="ms-auto size-5 shrink-0 text-primary-700 float-soft"
            aria-hidden="true"
          />
        </div>
      </CardHeader>

      <CardBody className="space-y-6 pt-5">
        {/* ── Confirm step — optional email + notes, then submit. ───────────── */}
        {phase === 'confirm' && selected ? (
          <form className="space-y-4" onSubmit={submit}>
            {/* Selected-slot recap — the anchor of the whole confirm screen. */}
            <div className="flex items-center gap-3.5 rounded-2xl bg-primary-soft px-4 py-4 shadow-soft ring-1 ring-white/60 animate-fade-in">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow">
                <Clock className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-700">
                  המועד שנבחר
                </p>
                <p className="text-base font-extrabold tracking-tight text-ink">
                  <span dir="ltr" className="tabular-nums">
                    {selected.label}
                  </span>{' '}
                  · {selectedDateISO ? formatDateHe(selectedDateISO) : ''}
                </p>
              </div>
            </div>

            {requireDetails && !detailsLocked && (
              <div className="space-y-4 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-soft backdrop-blur">
                <p className="text-sm font-bold text-ink">הפרטים שלכם</p>
                <div className="space-y-1.5">
                  <Label htmlFor="book-name" required>
                    שם מלא
                  </Label>
                  <Input
                    id="book-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="שם התלמיד/ה"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="book-phone" required>
                    טלפון
                  </Label>
                  <Input
                    id="book-phone"
                    type="tel"
                    dir="ltr"
                    className="text-end tabular-nums"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-123-4567"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="book-guardian-name">
                    שם הורה <span className="font-normal text-muted">(לילדים)</span>
                  </Label>
                  <Input
                    id="book-guardian-name"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="שם ההורה"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="book-guardian-phone">
                    טלפון הורה <span className="font-normal text-muted">(לילדים)</span>
                  </Label>
                  <Input
                    id="book-guardian-phone"
                    type="tel"
                    dir="ltr"
                    className="text-end tabular-nums"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="050-123-4567"
                    autoComplete="tel"
                  />
                  <p className="text-xs leading-relaxed text-muted">
                    אם מדובר בילד/ה — העדכונים יישלחו לטלפון ההורה.
                  </p>
                </div>
              </div>
            )}

            {requireDetails && detailsLocked && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm shadow-soft backdrop-blur">
                <span className="font-bold text-ink">{name}</span>
                <span dir="ltr" className="tabular-nums text-muted">
                  {phone}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailsLocked(false)}
                  className="ms-auto inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-primary-700 underline decoration-primary/60 underline-offset-4 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  שינוי פרטים
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="book-email">
                אימייל <span className="font-normal text-muted">(לא חובה)</span>
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
                רק אם תרצו לקבל תזכורות גם במייל — והשיעור ייכנס אוטומטית ליומן Google שלכם.
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

            {/*
              Sibling picker. Several students share one parent's phone, so the
              server refuses to guess and hands back the candidates. Tapping a
              capsule immediately re-submits with that student — the visitor
              already pressed "book", this is only the missing answer.
            */}
            {candidates && candidates.length > 0 && (
              <div className="rounded-2xl bg-primary-soft/70 p-4 ring-1 ring-primary-200">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Users className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
                  למי מיועד השיעור?
                </p>
                <p className="mt-1 text-xs text-muted">
                  המספר הזה רשום אצל יותר מתלמיד/ה אחד/ת.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => void doBook(c.id)}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink shadow-soft transition hover:-translate-y-px hover:border-primary-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div aria-live="polite">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger ring-1 ring-danger/20"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  setPhase('pick');
                  setSelected(null);
                  setSelectedDateISO(null);
                }}
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                חזרה לבחירת מועד
              </Button>
              {/* The single highest-emphasis action in the product → ink fill. */}
              <Button
                type="submit"
                variant="ink"
                size="lg"
                loading={submitting}
                className="w-full sm:ms-auto sm:w-auto"
              >
                {submitting ? 'שולח…' : 'אישור וקביעת השיעור'}
              </Button>
            </div>
          </form>
        ) : (
          /* ── Pick step — week navigation + 7-day list. ──────────────────── */
          <div className="space-y-5">
            {/* Week navigation — a glass strip with 44px pill controls. */}
            <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/65 p-1.5 shadow-soft backdrop-blur">
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

              <p className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm font-bold text-ink">
                <CalendarDays className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
                <span className="truncate">{formatWeekRangeHe(sundayISO, saturdayISO)}</span>
              </p>

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

            {week.isOpen && !navigating && totalSlots > 0 && (
              <p className="-mt-2 flex justify-center">
                <Badge tone="primary" className="tabular-nums">
                  {totalSlots} מועדים פנויים
                </Badge>
              </p>
            )}

            {navError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger ring-1 ring-danger/20"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{navError}</span>
              </div>
            )}

            {/* Loading skeleton while navigating between weeks */}
            {navigating ? (
              <div className="space-y-2.5" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
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
              /* The 7-day list (Sun→Sat) — one full-width row per day. */
              <ul
                aria-label="ימים ומועדים פנויים השבוע"
                className="stagger space-y-2.5"
              >
                {week.days.map((day, dayIndex) => {
                  const hasSlots = day.slots.length > 0;
                  return (
                    <li
                      key={day.dateISO}
                      style={{ ['--i' as string]: dayIndex } as React.CSSProperties}
                      className={cn(
                        'rounded-2xl border p-3 transition-colors duration-200 sm:p-3.5',
                        hasSlots
                          ? 'border-white/60 bg-white/70 shadow-soft backdrop-blur'
                          : 'border-dashed border-line bg-white/35',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Date tile — short weekday over the day-of-month. */}
                        <span
                          className={cn(
                            'flex size-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl ring-1',
                            hasSlots
                              ? 'bg-primary-soft text-ink ring-white/70'
                              : 'bg-white/60 text-muted ring-line',
                          )}
                        >
                          <span
                            className={cn(
                              'text-[10px] font-bold leading-none',
                              hasSlots ? 'text-primary-700' : 'text-muted',
                            )}
                          >
                            {WEEKDAY_SHORT[day.weekday]}
                          </span>
                          <span className="text-base font-extrabold leading-none tabular-nums">
                            {dayOfMonth(day.dateISO)}
                          </span>
                        </span>

                        <p
                          className={cn(
                            'min-w-0 truncate text-sm font-bold',
                            hasSlots ? 'text-ink' : 'text-muted',
                          )}
                        >
                          <span>יום </span>
                          {WEEKDAY_LABELS[day.weekday]}
                        </p>

                        {!hasSlots && (
                          <span className="ms-auto text-xs text-muted">אין מועדים</span>
                        )}
                      </div>

                      {hasSlots && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                                  'inline-flex h-12 animate-fade-in items-center justify-center gap-1.5 rounded-full border px-2 text-sm tabular-nums transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
                                  'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-ink',
                                  isSelected
                                    ? // Selection is carried by fill AND weight AND a check glyph,
                                      // never by color alone.
                                      'border-primary bg-primary font-extrabold text-primary-fg shadow-glow'
                                    : 'border-white/70 bg-white/85 font-semibold text-ink shadow-soft hover:border-primary-300 hover:bg-primary-50 hover:shadow-card',
                                )}
                              >
                                {isSelected && (
                                  <Check className="size-4 shrink-0" aria-hidden="true" />
                                )}
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
