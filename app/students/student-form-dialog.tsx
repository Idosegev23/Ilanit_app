'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  UserPlus,
  Pencil,
  AlertCircle,
  User,
  Phone,
  Mail,
  CircleDollarSign,
  Clock,
  StickyNote,
  Archive,
  HandCoins,
  CalendarClock,
  UserCog,
  PhoneCall,
  ReceiptText,
  CalendarPlus,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createStudentAction, updateStudentAction } from './actions';
import { ScheduleLessonDialog, type ScheduleStudentInfo } from './schedule-lesson-dialog';

// Create / edit dialog for a student record. The "מחיר לשיעור פרטי (₪)" field
// (students.defaultPrice, integer shekels) lives here as the canonical place to
// set a student's private-lesson price. Posts through the colocated server
// actions; on success it refreshes the route so the directory / client file
// reflect the change. RTL Hebrew, design-system primitives, lucide icons only.

export interface StudentFormValues {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  receiptLabel: string | null;
  defaultPrice: number | null;
  defaultDurationMin: number;
  notes: string | null;
  archived: boolean;
  autoCollect: boolean;
  collectFromDay: number | null;
}

interface StudentFormDialogProps {
  /** Existing student to edit; omit for a create form. */
  student?: StudentFormValues;
  /** Default private-lesson price from settings — shown as a hint when none set. */
  settingsDefaultPrice?: number | null;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'ghost' | 'gradient';
  triggerClassName?: string;
  /** Render the trigger as a compact (sm) button. */
  triggerSize?: 'sm' | 'md';
}

export function StudentFormDialog({
  student,
  settingsDefaultPrice,
  triggerLabel,
  triggerVariant = 'primary',
  triggerClassName,
  triggerSize = 'md',
}: StudentFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(student);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // After a NEW student is created we offer "קבע שיעור עכשיו" — a smooth
  // add→schedule hand-off. `justCreated` holds the new student so the colocated
  // ScheduleLessonDialog (opened via `scheduleOpen`) can be pre-filled.
  const [justCreated, setJustCreated] = React.useState<ScheduleStudentInfo | null>(null);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const titleId = React.useId();

  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    if (pending) return;
    setOpen(false);
    setError(null);
    setJustCreated(null);
    // A create that ended at the "schedule now?" offer still wrote a student —
    // refresh the route so the directory reflects it even if she skips scheduling.
    router.refresh();
  }, [pending, router]);

  // Close on Escape + trap Tab focus inside the dialog so keyboard users can't
  // tab out into the page behind the scrim.
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

  // Move initial focus to the first field when the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled])',
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = isEdit
        ? await updateStudentAction(formData)
        : await createStudentAction(formData);
      if (!result.ok) {
        setError(result.error ?? 'אירעה שגיאה');
        return;
      }
      if (!isEdit && result.id) {
        // Add→schedule hand-off: surface the "קבע שיעור עכשיו" offer in-place
        // using the values she just typed (price/duration default the dialog).
        const priceRaw = String(formData.get('defaultPrice') ?? '').replace(/[^\d]/g, '');
        const durationRaw = String(formData.get('defaultDurationMin') ?? '').replace(/[^\d]/g, '');
        setJustCreated({
          id: result.id,
          name: String(formData.get('name') ?? '').trim(),
          defaultPrice: priceRaw ? Number(priceRaw) : null,
          defaultDurationMin: durationRaw ? Number(durationRaw) : 60,
        });
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const Icon = isEdit ? Pencil : UserPlus;
  const label = triggerLabel ?? (isEdit ? 'עריכה' : 'תלמיד חדש');

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize === 'sm' ? 'sm' : 'md'}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={triggerClassName}
      >
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </Button>

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
              Blush header band. Every glyph and every word on it is ink or sits
              on an ink chip — white on #f493be is 2.15:1, ink on it is 6.2:1.
            */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-warm px-5 py-5 sm:px-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/50 blur-2xl"
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-card">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={titleId} className="truncate text-lg font-extrabold tracking-tight text-ink">
                      {isEdit ? 'עריכת תלמיד' : 'הוספת תלמיד חדש'}
                    </h2>
                    <p className="truncate text-sm font-medium text-ink">
                      {isEdit ? student?.name : 'פרטי קשר, מחיר ומשך שיעור'}
                    </p>
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

            {justCreated ? (
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                <div className="flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-4 text-success ring-1 ring-inset ring-white/60">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-bold">{justCreated.name} נוסף/ה למאגר</p>
                    <p className="mt-0.5 text-sm text-success">
                      אפשר לקבוע שיעור עכשיו, או לסיים ולקבוע מאוחר יותר.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={close}
                    className="sm:flex-1"
                  >
                    סיום
                  </Button>
                  <Button
                    type="button"
                    variant="gradient"
                    onClick={() => setScheduleOpen(true)}
                    className="sm:flex-[2]"
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    קבע שיעור עכשיו
                  </Button>
                </div>
              </div>
            ) : (
            <form action={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                {isEdit && <input type="hidden" name="id" value={student!.id} />}

                <Field id={`${titleId}-name`} label="שם מלא" icon={User} required>
                  <Input
                    id={`${titleId}-name`}
                    name="name"
                    defaultValue={student?.name ?? ''}
                    placeholder="שם התלמיד/ה"
                    autoComplete="name"
                    required
                  />
                </Field>

                <Field id={`${titleId}-phone`} label="טלפון" icon={Phone} required>
                  <Input
                    id={`${titleId}-phone`}
                    name="phone"
                    type="tel"
                    dir="ltr"
                    className="text-end"
                    defaultValue={student?.phone ?? ''}
                    placeholder="050-123-4567"
                    autoComplete="tel"
                    required
                  />
                </Field>

                <Field id={`${titleId}-email`} label="דוא״ל" icon={Mail} hint="לא חובה">
                  <Input
                    id={`${titleId}-email`}
                    name="email"
                    type="email"
                    dir="ltr"
                    className="text-end"
                    defaultValue={student?.email ?? ''}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </Field>

                {/* Guardian (parent) contact — recommended for children. When a
                    guardian phone is set, all WhatsApp for this student goes there. */}
                <div className="space-y-4 rounded-2xl border border-line bg-primary-50/60 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
                      <UserCog className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-bold tracking-tight text-ink">פרטי הורה</p>
                      <p className="text-xs text-muted">
                        מומלץ לילדים — כל ההודעות (לינק, תזכורות, קבלות) יישלחו לטלפון ההורה.
                      </p>
                    </div>
                  </div>

                  <Field id={`${titleId}-guardian-name`} label="שם הורה" icon={User} hint="לא חובה">
                    <Input
                      id={`${titleId}-guardian-name`}
                      name="guardianName"
                      defaultValue={student?.guardianName ?? ''}
                      placeholder="שם ההורה"
                      autoComplete="name"
                    />
                  </Field>

                  <Field
                    id={`${titleId}-guardian-phone`}
                    label="טלפון הורה"
                    icon={PhoneCall}
                    hint="מומלץ לילדים"
                  >
                    <Input
                      id={`${titleId}-guardian-phone`}
                      name="guardianPhone"
                      type="tel"
                      dir="ltr"
                      className="text-end"
                      defaultValue={student?.guardianPhone ?? ''}
                      placeholder="050-123-4567"
                      autoComplete="tel"
                    />
                  </Field>
                </div>

                {/* Pricing — the canonical place to set the private-lesson price */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id={`${titleId}-price`}
                    label="מחיר לשיעור פרטי (₪)"
                    icon={CircleDollarSign}
                    hint={
                      settingsDefaultPrice != null
                        ? `ברירת מחדל מההגדרות: ₪${settingsDefaultPrice}`
                        : 'אם ריק — לפי ברירת המחדל בהגדרות'
                    }
                  >
                    <Input
                      id={`${titleId}-price`}
                      name="defaultPrice"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      dir="ltr"
                      className="text-end tabular-nums"
                      defaultValue={student?.defaultPrice ?? ''}
                      placeholder={settingsDefaultPrice != null ? String(settingsDefaultPrice) : '150'}
                    />
                  </Field>

                  <Field
                    id={`${titleId}-duration`}
                    label="משך שיעור (דק׳)"
                    icon={Clock}
                  >
                    <Input
                      id={`${titleId}-duration`}
                      name="defaultDurationMin"
                      type="number"
                      inputMode="numeric"
                      // min IS the step base: a number input accepts only
                      // min + n*step. With min=1/step=5 the valid values were
                      // 1, 6, 11 … 56, 61 — so 60 was rejected, and the field's
                      // own default of 60 failed validation on first touch.
                      min={5}
                      step={5}
                      dir="ltr"
                      className="text-end tabular-nums"
                      defaultValue={student?.defaultDurationMin ?? 60}
                      placeholder="60"
                    />
                  </Field>
                </div>

                <Field
                  id={`${titleId}-receipt-label`}
                  label="תיאור לקבלה (ברירת מחדל)"
                  icon={ReceiptText}
                  hint="לא חובה"
                >
                  <Input
                    id={`${titleId}-receipt-label`}
                    name="receiptLabel"
                    defaultValue={student?.receiptLabel ?? ''}
                    placeholder="למשל: שיעור פרטי / הוראה מתקנת"
                  />
                </Field>

                <Field id={`${titleId}-notes`} label="הערות" icon={StickyNote} hint="לא חובה">
                  <Textarea
                    id={`${titleId}-notes`}
                    name="notes"
                    rows={3}
                    defaultValue={student?.notes ?? ''}
                    placeholder="העדפות, מקצוע, הורה מלווה…"
                  />
                </Field>

                {/*
                  Some parents pay on a fixed date — a salary date, usually.
                  Asking earlier is not a reminder, it is a fortnight of
                  nagging, so the charge is recorded on time and only the
                  asking waits.
                */}
                <div className="rounded-2xl border border-line bg-primary-50/60 px-3.5 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
                      <CalendarClock className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`${titleId}-collect-day`}>
                        לא לבקש תשלום לפני יום בחודש
                      </Label>
                      <Input
                        id={`${titleId}-collect-day`}
                        name="collectFromDay"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={28}
                        step={1}
                        className="mt-1.5"
                        defaultValue={student?.collectFromDay ?? ''}
                        placeholder="ריק = בכל יום"
                      />
                      <p className="mt-1 text-xs text-muted">
                        למשל 15 למי שמשלמ/ת באמצע החודש. החיוב עדיין נרשם בזמן
                        ומופיע בדוחות — רק הבקשה ממתינה.
                      </p>
                    </div>
                  </div>
                </div>

                {/*
                  Shown for new students too, unlike the archive toggle: the
                  families Ilanit settles with privately are usually known to
                  be that way the moment she adds them.
                */}
                <label className="flex min-h-[52px] cursor-pointer items-start justify-between gap-3 rounded-2xl border border-line bg-primary-50/60 px-3.5 py-3 transition-colors duration-150 hover:bg-primary-50">
                  <span className="flex items-start gap-2.5 text-sm font-medium text-ink">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
                      <HandCoins className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      גבייה ידנית בלבד
                      <span className="mt-0.5 block text-xs font-normal text-muted">
                        לא יישלחו דרישות תשלום או תזכורות חוב. החוב עדיין נרשם ומופיע
                        בדוחות שלך.
                      </span>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="manualBilling"
                    defaultChecked={student ? !student.autoCollect : false}
                    className="mt-1 size-5 shrink-0 cursor-pointer rounded-md border-line accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                  />
                </label>

                {isEdit && (
                  <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-primary-50/60 px-3.5 py-3 transition-colors duration-150 hover:bg-primary-50">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
                        <Archive className="size-4" aria-hidden="true" />
                      </span>
                      העברה לארכיון
                    </span>
                    {/*
                      accent-ink, not accent-primary: the UA paints the checkmark
                      white on the accent color, and white on #f493be is 2.15:1.
                    */}
                    <input
                      type="checkbox"
                      name="archived"
                      defaultChecked={student?.archived ?? false}
                      className="size-5 shrink-0 cursor-pointer rounded-md border-line accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                    />
                  </label>
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
                <Button type="submit" loading={pending} className="sm:flex-[2]">
                  {pending ? 'שומר…' : isEdit ? 'שמירת שינויים' : 'הוספת התלמיד'}
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* Add→schedule hand-off: controlled schedule dialog for the new student.
          Closing it ends the whole create flow (refresh + reset). */}
      {justCreated && (
        <ScheduleLessonDialog
          student={justCreated}
          settingsDefaultPrice={settingsDefaultPrice}
          open={scheduleOpen}
          hideTrigger
          onOpenChange={(next) => {
            setScheduleOpen(next);
            if (!next) {
              // She finished (or dismissed) scheduling — tidy up the create dialog.
              setOpen(false);
              setJustCreated(null);
              router.refresh();
            }
          }}
        />
      )}
    </>
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
