'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  CalendarPlus,
  CalendarClock,
  Repeat,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  CircleDollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  scheduleStudentLesson,
  scheduleStudentSeries,
  checkSlotConflictAction,
  type ScheduleResult,
} from './actions';
import type { OverlappingLesson } from '@/lib/availability';

// ADMIN scheduling dialog — Ilanit (owner) directly SETS a lesson for an
// existing student. One-off → ONE confirmed lesson + immediate calendar event;
// weekly → a confirmed recurring series. NOT the student self-booking flow:
// no booking link, no approval, not gated by open-weeks. Double-booking is
// WARNED (debounced conflict check) but never blocked — she can proceed anyway.
// RTL Hebrew, design-system primitives, lucide icons only, 44px targets.

export interface ScheduleStudentInfo {
  id: string;
  name: string;
  defaultPrice: number | null;
  defaultDurationMin: number;
}

interface ScheduleLessonDialogProps {
  student: ScheduleStudentInfo;
  /** Default private-lesson price from settings — used as a placeholder hint. */
  settingsDefaultPrice?: number | null;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'ghost' | 'gradient';
  triggerSize?: 'sm' | 'md';
  triggerClassName?: string;
  /** Controlled open state (used by the add→schedule hand-off). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in trigger button (when opened programmatically). */
  hideTrigger?: boolean;
}

// 0 = Sunday … 6 = Saturday (matches lib/time.ilWeekday + schema weekday).
const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

type Mode = 'one-off' | 'recurring';

export function ScheduleLessonDialog({
  student,
  settingsDefaultPrice,
  triggerLabel = 'קבע שיעור',
  triggerVariant = 'primary',
  triggerSize = 'md',
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: ScheduleLessonDialogProps) {
  const router = useRouter();
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const [mode, setMode] = React.useState<Mode>('one-off');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  // Conflict warning (one-off only): debounced, advisory, never blocks submit.
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [duration, setDuration] = React.useState<string>(
    String(student.defaultDurationMin || 60),
  );
  const [conflict, setConflict] = React.useState(false);
  const [conflictItems, setConflictItems] = React.useState<OverlappingLesson[]>([]);

  const close = React.useCallback(() => {
    if (pending) return;
    setOpen(false);
    setError(null);
  }, [pending, setOpen]);

  // Reset transient state whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setMode('one-off');
    setError(null);
    setDone(null);
    setConflict(false);
    setConflictItems([]);
    setDate('');
    setTime('');
    setDuration(String(student.defaultDurationMin || 60));
  }, [open, student.defaultDurationMin]);

  // Escape + Tab focus trap.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled])',
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Debounced double-booking check for the one-off slot (advisory only).
  React.useEffect(() => {
    if (mode !== 'one-off' || !date || !time) {
      setConflict(false);
      setConflictItems([]);
      return;
    }
    const minutes = Number(duration) || 60;
    const handle = setTimeout(async () => {
      try {
        const res = await checkSlotConflictAction(date, time, minutes);
        setConflict(Boolean(res.conflict));
        setConflictItems(res.items ?? []);
      } catch {
        setConflict(false);
        setConflictItems([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [mode, date, time, duration]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setDone(null);
    setPending(true);
    try {
      const run: (fd: FormData) => Promise<ScheduleResult> =
        mode === 'one-off' ? scheduleStudentLesson : scheduleStudentSeries;
      const result = await run(formData);
      if (!result.ok) {
        setError(result.error ?? 'אירעה שגיאה');
        return;
      }
      // A zero-count series is a soft notice (kept open so she can widen horizon).
      if (mode === 'recurring' && result.count === 0) {
        setError(result.error ?? 'לא נוצרו שיעורים בטווח שנבחר');
        return;
      }
      const msg =
        mode === 'one-off'
          ? 'השיעור נקבע ונוסף ליומן.'
          : `נקבעה סדרה — ${result.count ?? 0} שיעורים נוספו ליומן.`;
      setDone(msg);
      router.refresh();
      // Brief success beat, then close.
      setTimeout(() => setOpen(false), 900);
    } finally {
      setPending(false);
    }
  }

  const pricePlaceholder =
    student.defaultPrice != null
      ? String(student.defaultPrice)
      : settingsDefaultPrice != null
        ? String(settingsDefaultPrice)
        : '150';
  const priceHint =
    student.defaultPrice != null
      ? `ברירת מחדל של התלמיד/ה: ₪${student.defaultPrice}`
      : settingsDefaultPrice != null
        ? `ברירת מחדל מההגדרות: ₪${settingsDefaultPrice}`
        : 'ריק = ללא מחיר';

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize === 'sm' ? 'sm' : 'md'}
          onClick={() => setOpen(true)}
          className={triggerClassName}
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            aria-label="סגירת החלון"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={close}
          />

          <div
            ref={panelRef}
            className="relative z-10 flex max-h-[92vh] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-surface/95 shadow-pop backdrop-blur-2xl sm:rounded-3xl"
          >
            {/*
              Blush header band — ink text throughout. White on the pink stop is
              2.15:1; ink is 6.2:1 there and 9.7:1 on the peach end.
            */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-warm px-5 py-5 sm:px-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/50 blur-2xl"
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-card">
                    <CalendarPlus className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
                      קביעת שיעור
                    </h2>
                    <p className="truncate text-sm font-medium text-ink">{student.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="סגירת החלון"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-200 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Mode switch */}
            <div className="shrink-0 border-b border-line bg-primary-50/50 p-3">
              <div
                role="tablist"
                aria-label="סוג קביעה"
                className="flex gap-1.5 rounded-full border border-line bg-surface p-1.5 shadow-soft"
              >
                <ModeTab
                  active={mode === 'one-off'}
                  icon={CalendarClock}
                  label="חד-פעמי"
                  onClick={() => {
                    setMode('one-off');
                    setError(null);
                  }}
                />
                <ModeTab
                  active={mode === 'recurring'}
                  icon={Repeat}
                  label="מחזורי (שבועי)"
                  onClick={() => {
                    setMode('recurring');
                    setError(null);
                  }}
                />
              </div>
            </div>

            {/* The form re-mounts per mode (key) so native fields reset cleanly. */}
            <form
              key={mode}
              action={onSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <input type="hidden" name="studentId" value={student.id} />

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                {mode === 'one-off' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`${titleId}-date`} label="תאריך" icon={CalendarDays} required>
                        <Input
                          id={`${titleId}-date`}
                          name="date"
                          type="date"
                          required
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </Field>
                      <Field id={`${titleId}-time`} label="שעה" icon={Clock} required>
                        <Input
                          id={`${titleId}-time`}
                          name="time"
                          type="time"
                          required
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`${titleId}-duration`} label="משך (דק׳)" icon={Clock}>
                        <Input
                          id={`${titleId}-duration`}
                          name="durationMin"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          value={duration}
                          onChange={(e) => setDuration(e.target.value)}
                        />
                      </Field>
                      <Field
                        id={`${titleId}-price`}
                        label="מחיר (₪)"
                        icon={CircleDollarSign}
                        hint={priceHint}
                      >
                        <Input
                          id={`${titleId}-price`}
                          name="price"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          placeholder={pricePlaceholder}
                        />
                      </Field>
                    </div>
                    <Field id={`${titleId}-notes`} label="הערות" icon={CalendarClock} hint="לא חובה">
                      <Textarea id={`${titleId}-notes`} name="notes" rows={2} />
                    </Field>

                    {conflict && !done && (
                      <div
                        className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-warning ring-1 ring-inset ring-white/50"
                        role="status"
                      >
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <div className="space-y-1">
                          {conflictItems.length > 0 ? (
                            <>
                              <p className="font-semibold">בשעה זו כבר קיים:</p>
                              <ul className="space-y-0.5">
                                {conflictItems.map((it) => (
                                  <li key={it.id} className="tabular-nums" dir="rtl">
                                    <span dir="ltr">{it.timeLabel}</span> ·{' '}
                                    {it.isGroup ? 'קבוצה: ' : ''}
                                    {it.name}
                                  </li>
                                ))}
                              </ul>
                              <p>אפשר לקבוע בכל זאת.</p>
                            </>
                          ) : (
                            <span>קיים אירוע ביומן בחפיפה לשעה זו. אפשר לקבוע בכל זאת.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`${titleId}-weekday`} label="יום בשבוע" icon={CalendarDays} required>
                        <Select id={`${titleId}-weekday`} name="weekday" defaultValue={0}>
                          {WEEKDAYS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field id={`${titleId}-rec-time`} label="שעה" icon={Clock} required>
                        <Input id={`${titleId}-rec-time`} name="time" type="time" required />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field id={`${titleId}-rec-duration`} label="משך (דק׳)" icon={Clock}>
                        <Input
                          id={`${titleId}-rec-duration`}
                          name="durationMin"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          defaultValue={student.defaultDurationMin || 60}
                        />
                      </Field>
                      <Field
                        id={`${titleId}-rec-price`}
                        label="מחיר (₪)"
                        icon={CircleDollarSign}
                      >
                        <Input
                          id={`${titleId}-rec-price`}
                          name="price"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          placeholder={pricePlaceholder}
                        />
                      </Field>
                      <Field id={`${titleId}-rec-horizon`} label="אופק (ימים)" icon={CalendarDays}>
                        <Input
                          id={`${titleId}-rec-horizon`}
                          name="horizonDays"
                          type="number"
                          min={1}
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          placeholder="30"
                        />
                      </Field>
                    </div>
                    {/* primary-700, not primary-600 — #e06b9f on the blush tint is 2.8:1. */}
                    <p className="flex items-start gap-2 rounded-2xl bg-primary-soft/70 px-3.5 py-3 text-sm text-primary-700 ring-1 ring-inset ring-white/60">
                      <Repeat className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        ייווצרו שיעורים מאושרים שבועיים, ואירוע מחזורי אחד ביומן עד תום האופק.
                      </span>
                    </p>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger ring-1 ring-inset ring-white/50"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
                {done && (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-2xl bg-success-soft px-3.5 py-3 text-sm text-success ring-1 ring-inset ring-white/50"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{done}</span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-gradient-tint p-4 sm:flex-row sm:p-5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={close}
                  className="sm:flex-1"
                  disabled={pending}
                >
                  ביטול
                </Button>
                <Button type="submit" variant="gradient" loading={pending} className="sm:flex-[2]">
                  {pending
                    ? 'קובע…'
                    : conflict && mode === 'one-off'
                      ? 'קבע בכל זאת'
                      : 'קביעת שיעור'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ModeTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
        // Pink fill carries INK text (6.2:1) — never white (2.15:1).
        active
          ? 'bg-primary text-primary-fg shadow-glow'
          : 'text-muted hover:bg-primary-50 hover:text-ink',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

// Labeled field row with a tinted lucide icon chip and an optional hint.
function Field({
  id,
  label,
  icon: FieldIcon,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} required={required} className="flex items-center gap-1.5">
          <FieldIcon className="size-3.5 text-muted" aria-hidden="true" />
          {label}
        </Label>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
