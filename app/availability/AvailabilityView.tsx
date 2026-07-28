'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CalendarOff,
  CalendarCheck,
  CalendarClock,
  History,
  Unlock,
  Plane,
  Info,
  Check,
  X,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DayState, DaySlot, OverlappingLesson } from '@/lib/availability';
import {
  monthGridKeys,
  addMonthsKey,
  monthLabel,
  isSameMonthKey,
  dayLabel,
  HE_WEEKDAYS_SHORT,
} from '../lessons/calendar/calendar-lib';
import {
  loadMonth,
  loadDay,
  toggleSlot,
  toggleDay,
  closeRange,
  slotOccupants,
  toggleForceOpen,
} from './actions';

interface Props {
  today: string;
  initialMonthAnchor: string;
  initialStates: Record<string, DayState>;
}

function dayNum(key: string): string {
  return String(Number(key.split('-')[2]));
}

/*
  Slot-chip visual contract (v4).

  This grid is the signature interaction of the app on a phone, so each state
  has to be readable at a glance AND survive colorblindness — color is never the
  only carrier:

    open   blush-green fill + ✓
    closed rose fill + ✕ + the time struck through
    taken  blush fill + calendar glyph + the word "שיעור"
    forced amber fill + open-padlock glyph + the word "נפתח"
    past   muted, DASHED outline + a rewind glyph, non-interactive

  Chips are full pills, ≥52px tall, two per row at 390px.
*/
const SLOT_CHIP =
  'flex h-full min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full border px-2.5 py-1.5 text-sm font-semibold shadow-soft transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none';

export function AvailabilityView({ today, initialMonthAnchor, initialStates }: Props) {
  const [anchor, setAnchor] = React.useState(initialMonthAnchor);
  const [states, setStates] = React.useState<Record<string, DayState>>(initialStates);
  const [loadingMonth, setLoadingMonth] = React.useState(false);

  const [selected, setSelected] = React.useState<string>(today);
  const [day, setDay] = React.useState<{ slots: DaySlot[]; fullDayBlocked: boolean } | null>(null);
  const [loadingDay, setLoadingDay] = React.useState(false);
  const [busySlot, setBusySlot] = React.useState<string | null>(null);
  const [busyDay, setBusyDay] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // "Open over a taken slot?" confirmation.
  const [confirm, setConfirm] = React.useState<{
    slot: DaySlot;
    occupants: OverlappingLesson[];
    loading: boolean;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);

  const [vacFrom, setVacFrom] = React.useState(today);
  const [vacTo, setVacTo] = React.useState(today);
  const [vacBusy, setVacBusy] = React.useState(false);

  const grid = React.useMemo(() => monthGridKeys(anchor), [anchor]);

  const refreshMonth = React.useCallback(async (a: string) => {
    const g = monthGridKeys(a);
    try {
      setStates(await loadMonth(g[0], g[g.length - 1]));
    } catch {
      /* keep */
    }
  }, []);

  const refreshDay = React.useCallback(async (date: string) => {
    try {
      setDay(await loadDay(date));
    } catch {
      /* keep */
    }
  }, []);

  async function goMonth(delta: number) {
    const next = addMonthsKey(anchor, delta);
    setAnchor(next);
    setLoadingMonth(true);
    await refreshMonth(next);
    setLoadingMonth(false);
  }

  async function selectDay(key: string) {
    setSelected(key);
    setError(null);
    setLoadingDay(true);
    setDay(null);
    await refreshDay(key);
    setLoadingDay(false);
  }

  // Load the initially-selected day (today) once on mount.
  React.useEffect(() => {
    void selectDay(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route a slot click by its state.
  function onSlotClick(slot: DaySlot) {
    if (slot.state === 'past') return;
    if (slot.state === 'taken') {
      void openTakenConfirm(slot);
    } else if (slot.state === 'forced') {
      void onForce(slot, false); // revert override → back to taken
    } else {
      void onToggleSlot(slot); // open ↔ closed
    }
  }

  async function openTakenConfirm(slot: DaySlot) {
    setConfirm({ slot, occupants: [], loading: true });
    try {
      const occupants = await slotOccupants(slot.startISO, slot.endISO);
      setConfirm({ slot, occupants, loading: false });
    } catch {
      setConfirm({ slot, occupants: [], loading: false });
    }
  }

  async function onForce(slot: DaySlot, open: boolean) {
    if (open) setConfirmBusy(true);
    else setBusySlot(slot.startISO);
    setError(null);
    try {
      const res = await toggleForceOpen(selected, slot.startISO, slot.endISO, open);
      if (!res.ok) setError(res.error ?? 'הפעולה נכשלה');
      await refreshDay(selected);
      void refreshMonth(anchor);
    } catch {
      setError('שגיאה — נסי שוב');
    } finally {
      setConfirmBusy(false);
      setBusySlot(null);
      setConfirm(null);
    }
  }

  async function onToggleSlot(slot: DaySlot) {
    if (slot.state !== 'open' && slot.state !== 'closed') return;
    const close = slot.state === 'open';
    setBusySlot(slot.startISO);
    setError(null);
    // optimistic
    setDay((d) =>
      d
        ? {
            ...d,
            slots: d.slots.map((s) =>
              s.startISO === slot.startISO ? { ...s, state: close ? 'closed' : 'open' } : s,
            ),
          }
        : d,
    );
    try {
      const res = await toggleSlot(selected, slot.startISO, slot.endISO, close);
      if (!res.ok) {
        setError(res.error ?? 'הפעולה נכשלה');
        await refreshDay(selected);
      } else {
        void refreshMonth(anchor);
      }
    } catch {
      setError('שגיאה — נסי שוב');
      await refreshDay(selected);
    } finally {
      setBusySlot(null);
    }
  }

  async function onToggleDay(close: boolean) {
    setBusyDay(true);
    setError(null);
    try {
      const res = await toggleDay(selected, close);
      if (!res.ok) setError(res.error ?? 'הפעולה נכשלה');
      await refreshDay(selected);
      void refreshMonth(anchor);
    } catch {
      setError('שגיאה — נסי שוב');
    } finally {
      setBusyDay(false);
    }
  }

  async function onCloseRange() {
    setVacBusy(true);
    setError(null);
    try {
      const res = await closeRange(vacFrom, vacTo);
      if (!res.ok) {
        setError(res.error ?? 'הפעולה נכשלה');
        return;
      }
      await refreshMonth(anchor);
      if (selected >= vacFrom && selected <= vacTo) await refreshDay(selected);
    } catch {
      setError('שגיאה — נסי שוב');
    } finally {
      setVacBusy(false);
    }
  }

  return (
    <div className="stagger space-y-6">
      {/* ── How this screen works ── */}
      <section
        style={{ '--i': 0 } as React.CSSProperties}
        className="glass flex items-start gap-3.5 rounded-2xl p-4 sm:p-5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/60">
          <Info className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          בתוך <span className="font-semibold text-ink">שעות הפעילות</span> (מוגדרות ב״הגדרות״) הכל
          פתוח. לוחצים על יום ואז על משבצת שעה כדי לסמן <span className="font-semibold text-success">פנוי</span> או{' '}
          <span className="font-semibold text-danger">סגור</span>. שיעורים שנקבעו מסומנים{' '}
          <span className="font-semibold text-primary-700">תפוס</span> — אפשר לפתוח אותם ידנית לתיאום
          נוסף (עם התראה מה כבר קבוע שם).
        </p>
      </section>

      {error && (
        <div
          role="alert"
          style={{ '--i': 1 } as React.CSSProperties}
          className="flex items-center gap-2.5 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3.5 text-sm font-medium text-danger shadow-soft"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div
        style={{ '--i': 2 } as React.CSSProperties}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]"
      >
        {/* ── Month grid ──
            Solid surface: 42 dense cells of small tabular text is exactly where a
            live aurora bleeding through costs more legibility than it buys. */}
        <Card solid className="overflow-hidden">
          <CardHeader variant="gradient" className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-11 shrink-0 px-0"
                onClick={() => void goMonth(-1)}
                aria-label="חודש קודם"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </Button>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                {loadingMonth && <Loader2 className="size-4 animate-spin text-primary-700" aria-hidden="true" />}
                {monthLabel(anchor)}
              </CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-11 shrink-0 px-0"
                onClick={() => void goMonth(1)}
                aria-label="חודש הבא"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-3 pt-3 sm:p-5">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {HE_WEEKDAYS_SHORT.map((w) => (
                <div
                  key={w}
                  className="pb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted"
                >
                  {w}
                </div>
              ))}
              {grid.map((key) => {
                const st = states[key];
                const inMonth = isSameMonthKey(key, anchor);
                const isSel = key === selected;
                const isToday = key === today;
                const noHours = !st || st.total === 0;
                const closed = st?.fullyClosed;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void selectDay(key)}
                    aria-current={isSel ? 'date' : undefined}
                    className={cn(
                      // Selection is carried by an INK ring (13.4:1), never by pink
                      // alone — a blush ring on a blush cell is 2.15:1.
                      'flex min-h-[72px] flex-col items-center gap-1 overflow-hidden rounded-xl border p-1 text-center transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none sm:p-1.5',
                      !inMonth && 'opacity-40',
                      isSel
                        ? 'border-transparent bg-primary-50 shadow-card ring-2 ring-ink'
                        : 'border-line bg-surface hover:-translate-y-px hover:border-primary-200 hover:bg-primary-50 hover:shadow-soft',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full text-[13px] font-bold tabular-nums',
                        isToday
                          ? 'bg-primary text-primary-fg shadow-glow'
                          : 'text-ink',
                      )}
                    >
                      {dayNum(key)}
                    </span>
                    {/* 9px on the phone, 10px from `sm:` — a 7-column grid at
                        390px leaves ~36px of usable width per cell, and the
                        counts have to survive two digits without overflowing. */}
                    {noHours ? (
                      <span className="text-[10px] leading-none text-muted">—</span>
                    ) : closed ? (
                      <span className="rounded-full bg-danger-soft px-0.5 py-0.5 text-[9px] font-bold leading-none text-danger ring-1 ring-inset ring-danger/20 sm:px-1.5 sm:text-[10px]">
                        סגור
                      </span>
                    ) : (
                      <span className="rounded-full bg-success-soft px-0.5 py-0.5 text-[9px] font-bold leading-none tabular-nums text-success ring-1 ring-inset ring-success/20 sm:px-1.5 sm:text-[10px]">
                        {st.open} פנוי
                      </span>
                    )}
                    {!noHours && st.taken > 0 && (
                      <span className="text-[9px] font-semibold leading-none tabular-nums text-primary-700 sm:text-[10px]">
                        {st.taken} שיעור
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* ── Selected-day slots ── */}
        <Card className="overflow-hidden lg:sticky lg:top-24 lg:self-start">
          <CardHeader variant="gradient" className="p-4 sm:p-5">
            <CardTitle className="text-base sm:text-lg">{dayLabel(selected)}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4 p-4 pt-4 sm:p-5">
            {loadingDay ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                טוען…
              </div>
            ) : !day || day.slots.length === 0 ? (
              <p className="rounded-2xl bg-primary-50/70 px-4 py-8 text-center text-sm leading-relaxed text-muted">
                אין שעות פעילות ביום זה. אפשר להגדיר שעות פעילות ב״הגדרות״.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {day.fullDayBlocked ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      loading={busyDay}
                      onClick={() => void onToggleDay(false)}
                    >
                      <CalendarCheck className="size-4" aria-hidden="true" />
                      פתח את כל היום
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full border border-danger/20 text-danger hover:bg-danger-soft"
                      loading={busyDay}
                      onClick={() => void onToggleDay(true)}
                    >
                      <CalendarOff className="size-4" aria-hidden="true" />
                      סגור את כל היום
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {day.slots.map((s) => {
                    const busy = busySlot === s.startISO;
                    const disabled = s.state === 'past' || busy;
                    return (
                      <button
                        key={s.startISO}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSlotClick(s)}
                        className={cn(
                          SLOT_CHIP,
                          !disabled &&
                            'hover:-translate-y-0.5 hover:shadow-card active:translate-y-0',
                          s.state === 'open' &&
                            'border-success/45 bg-success-soft text-success',
                          s.state === 'closed' &&
                            'border-danger/35 bg-danger-soft text-danger',
                          // Ink on the pink fill (8.9:1). primary-700 on a blush
                          // chip lands at ~4.2:1 — under AA for 14px text.
                          s.state === 'taken' &&
                            'border-primary bg-primary-200 text-ink',
                          s.state === 'forced' &&
                            'border-warning/45 bg-warning-soft text-warning',
                          s.state === 'past' &&
                            'cursor-not-allowed border-dashed border-line bg-surface-2/50 text-muted opacity-70 shadow-none',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {busy ? (
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                          ) : s.state === 'open' ? (
                            <Check className="size-4 shrink-0" aria-hidden="true" />
                          ) : s.state === 'closed' ? (
                            <X className="size-4 shrink-0" aria-hidden="true" />
                          ) : s.state === 'taken' ? (
                            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                          ) : s.state === 'forced' ? (
                            <Unlock className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <History className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          <span
                            dir="ltr"
                            className={cn(
                              'tabular-nums',
                              // Second, non-color signal for "closed".
                              s.state === 'closed' && 'line-through decoration-2',
                            )}
                          >
                            {s.label}
                          </span>
                        </span>
                        {s.state === 'taken' && (
                          <span className="text-[10px] font-bold leading-none">שיעור</span>
                        )}
                        {s.state === 'forced' && (
                          <span className="text-[10px] font-bold leading-none">נפתח</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend — mirrors the chips 1:1 (same fill, same glyph). */}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/45 bg-success-soft px-2 py-1 text-[11px] font-semibold text-success">
                    <Check className="size-3" aria-hidden="true" /> פנוי
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-danger/35 bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger">
                    <X className="size-3" aria-hidden="true" /> סגור
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary-200 px-2 py-1 text-[11px] font-semibold text-ink">
                    <CalendarClock className="size-3" aria-hidden="true" /> שיעור
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/45 bg-warning-soft px-2 py-1 text-[11px] font-semibold text-warning">
                    <Unlock className="size-3" aria-hidden="true" /> נפתח על תפוס
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  לחיצה על משבצת <span className="font-semibold text-primary-700">שיעור</span> תאפשר לפתוח
                  אותה לתיאום למרות שהיא תפוסה (עם אישור). לחיצה על משבצת{' '}
                  <span className="font-semibold text-warning">נפתח</span> מבטלת את הפתיחה.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Vacation range ── */}
      <Card style={{ '--i': 3 } as React.CSSProperties} className="overflow-hidden">
        <CardHeader variant="gradient" className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2.5 text-base sm:text-lg">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/60">
              <Plane className="size-5" aria-hidden="true" />
            </span>
            סגירת תקופה (חופשה)
          </CardTitle>
        </CardHeader>
        <CardBody className="p-4 pt-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="vac-from">מתאריך</Label>
              <Input
                id="vac-from"
                type="date"
                value={vacFrom}
                onChange={(e) => setVacFrom(e.target.value)}
                className="date-field tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vac-to">עד תאריך</Label>
              <Input
                id="vac-to"
                type="date"
                value={vacTo}
                onChange={(e) => setVacTo(e.target.value)}
                className="date-field tabular-nums"
              />
            </div>
            <Button
              type="button"
              variant="ink"
              size="lg"
              className="w-full sm:w-auto"
              loading={vacBusy}
              onClick={() => void onCloseRange()}
            >
              <Plane className="size-4" aria-hidden="true" />
              סגור את התקופה
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── "Open a taken slot?" confirmation ── */}
      {confirm &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="סגור"
              className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
              onClick={() => setConfirm(null)}
            />
            <div className="glass-strong animate-fade-in relative z-10 w-full max-w-sm rounded-t-3xl p-6 shadow-pop sm:rounded-3xl">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning shadow-soft">
                  <AlertCircle className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-ink">לפתוח משבצת תפוסה?</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    <span dir="ltr" className="font-semibold tabular-nums text-ink">
                      {confirm.slot.label}
                    </span>{' '}
                    כבר תפוסה. פתיחה תאפשר לתאם שיעור נוסף באותה שעה.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-line bg-surface-2/70 p-4 text-sm text-ink">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                  מה כבר קיים בשעה זו:
                </p>
                {confirm.loading ? (
                  <p className="text-muted">טוען…</p>
                ) : confirm.occupants.length > 0 ? (
                  <ul className="space-y-1">
                    {confirm.occupants.map((o) => (
                      <li key={o.id} dir="rtl" className="flex flex-wrap items-center gap-1.5">
                        <span
                          dir="ltr"
                          className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-ink shadow-soft"
                        >
                          {o.timeLabel}
                        </span>{' '}
                        · {o.isGroup ? 'קבוצה: ' : ''}
                        {o.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">אירוע ביומן (ללא פירוט).</p>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:flex-1"
                  onClick={() => setConfirm(null)}
                >
                  ביטול
                </Button>
                <Button
                  type="button"
                  className="sm:flex-1"
                  loading={confirmBusy}
                  onClick={() => void onForce(confirm.slot, true)}
                >
                  פתח בכל זאת
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
