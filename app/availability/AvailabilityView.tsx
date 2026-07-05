'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CalendarOff,
  CalendarCheck,
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
import type { DayState, DaySlot } from '@/lib/availability';
import {
  monthGridKeys,
  addMonthsKey,
  monthLabel,
  isSameMonthKey,
  dayLabel,
  HE_WEEKDAYS_SHORT,
} from '../lessons/calendar/calendar-lib';
import { loadMonth, loadDay, toggleSlot, toggleDay, closeRange } from './actions';

interface Props {
  today: string;
  initialMonthAnchor: string;
  initialStates: Record<string, DayState>;
}

function dayNum(key: string): string {
  return String(Number(key.split('-')[2]));
}

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

  // Only free/closed slots are editable here. A taken slot is NOT openable to the
  // public — Ilanit schedules over it via "קבע שיעור" (admin) if she wants.
  function onSlotClick(slot: DaySlot) {
    if (slot.state !== 'open' && slot.state !== 'closed') return;
    void onToggleSlot(slot);
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
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-gradient-tint p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-600 shadow-soft">
          <Info className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          בתוך <span className="font-semibold text-ink">שעות הפעילות</span> (מוגדרות ב״הגדרות״) הכל
          פתוח. לוחצים על יום ואז על משבצת שעה כדי לסמן <span className="font-semibold text-success">פנוי</span> או{' '}
          <span className="font-semibold text-danger">סגור</span>. שיעורים שנקבעו תפוסים ולא ניתן לשנותם.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ── Month grid ── */}
        <Card className="overflow-hidden">
          <CardHeader variant="gradient">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-10 px-0"
                onClick={() => void goMonth(-1)}
                aria-label="חודש קודם"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </Button>
              <CardTitle className="flex items-center gap-2">
                {loadingMonth && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {monthLabel(anchor)}
              </CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="size-10 px-0"
                onClick={() => void goMonth(1)}
                aria-label="חודש הבא"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-7 gap-1.5">
              {HE_WEEKDAYS_SHORT.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-bold text-muted">
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
                    className={cn(
                      'flex min-h-16 flex-col items-center gap-1 rounded-xl border p-1.5 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      !inMonth && 'opacity-40',
                      isSel
                        ? 'border-primary bg-primary-50 ring-1 ring-primary-200'
                        : 'border-line bg-surface hover:bg-primary-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        isToday ? 'bg-primary text-primary-fg' : 'text-ink',
                      )}
                    >
                      {dayNum(key)}
                    </span>
                    {noHours ? (
                      <span className="text-[10px] text-muted">—</span>
                    ) : closed ? (
                      <span className="rounded-full bg-danger-soft px-1.5 text-[10px] font-medium text-danger">
                        סגור
                      </span>
                    ) : (
                      <span className="rounded-full bg-success-soft px-1.5 text-[10px] font-semibold tabular-nums text-success">
                        {st.open} פנוי
                      </span>
                    )}
                    {!noHours && st.taken > 0 && (
                      <span className="text-[10px] tabular-nums text-primary-600">
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
        <Card className="overflow-hidden">
          <CardHeader variant="gradient">
            <CardTitle className="text-base">{dayLabel(selected)}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {loadingDay ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                טוען…
              </div>
            ) : !day || day.slots.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                אין שעות פעילות ביום זה. אפשר להגדיר שעות פעילות ב״הגדרות״.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {day.fullDayBlocked ? (
                    <Button
                      type="button"
                      variant="secondary"
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
                      loading={busyDay}
                      onClick={() => void onToggleDay(true)}
                      className="text-danger hover:bg-danger-soft"
                    >
                      <CalendarOff className="size-4" aria-hidden="true" />
                      סגור את כל היום
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {day.slots.map((s) => {
                    const busy = busySlot === s.startISO;
                    const disabled = busy || (s.state !== 'open' && s.state !== 'closed');
                    return (
                      <button
                        key={s.startISO}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSlotClick(s)}
                        dir="ltr"
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums shadow-soft transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          s.state === 'open' &&
                            'border-success/40 bg-success-soft text-success hover:brightness-95',
                          s.state === 'closed' &&
                            'border-danger/30 bg-danger-soft text-danger hover:brightness-95',
                          s.state === 'taken' &&
                            'cursor-not-allowed border-primary-200 bg-primary-50 text-primary-600',
                          s.state === 'past' &&
                            'cursor-not-allowed border-line bg-surface-2/50 text-muted opacity-70',
                        )}
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : s.state === 'open' ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : s.state === 'closed' ? (
                          <X className="size-3.5" aria-hidden="true" />
                        ) : null}
                        <span>{s.label}</span>
                        {s.state === 'taken' && <span className="text-[10px]">שיעור</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-3 rounded bg-success-soft ring-1 ring-success/40" /> פנוי
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-3 rounded bg-danger-soft ring-1 ring-danger/30" /> סגור
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-3 rounded bg-primary-50 ring-1 ring-primary-200" /> שיעור
                    (תפוס)
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  משבצת <span className="font-medium text-primary-600">שיעור</span> תפוסה ולא ניתן
                  לפתוח אותה לתיאום ציבורי. לקביעת שיעור נוסף באותה שעה — דרך ״קבע שיעור״ בכרטיס
                  התלמיד/ה.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Vacation range ── */}
      <Card className="overflow-hidden">
        <CardHeader variant="gradient">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
              <Plane className="size-5" aria-hidden="true" />
            </span>
            סגירת תקופה (חופשה)
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vac-from">מתאריך</Label>
              <Input
                id="vac-from"
                type="date"
                value={vacFrom}
                onChange={(e) => setVacFrom(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vac-to">עד תאריך</Label>
              <Input
                id="vac-to"
                type="date"
                value={vacTo}
                onChange={(e) => setVacTo(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <Button type="button" variant="secondary" loading={vacBusy} onClick={() => void onCloseRange()}>
              <Plane className="size-4" aria-hidden="true" />
              סגור את התקופה
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
