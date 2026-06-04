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
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={close}
          />

          <div
            ref={panelRef}
            className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop sm:rounded-3xl"
          >
            {/* Gradient header band */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-warm px-6 py-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/15 blur-2xl"
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-white/20 text-white ring-1 ring-white/30">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id={titleId} className="text-lg font-bold text-white">
                      {isEdit ? 'עריכת תלמיד' : 'הוספת תלמיד חדש'}
                    </h2>
                    <p className="text-sm text-white/80">
                      {isEdit ? student?.name : 'פרטי קשר, מחיר ומשך שיעור'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="סגירת החלון"
                  className="flex size-9 items-center justify-center rounded-xl text-white/90 transition-colors duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {justCreated ? (
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                <div className="flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-4 text-success">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">{justCreated.name} נוסף/ה למאגר</p>
                    <p className="mt-0.5 text-sm text-success/90">
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
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
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
                <div className="space-y-4 rounded-2xl border border-line bg-cream/40 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-600">
                      <UserCog className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">פרטי הורה</p>
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
                      min={1}
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

                {isEdit && (
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-cream/50 px-3.5 py-3 transition-colors duration-150 hover:bg-cream">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary-600">
                        <Archive className="size-4" aria-hidden="true" />
                      </span>
                      העברה לארכיון
                    </span>
                    <input
                      type="checkbox"
                      name="archived"
                      defaultChecked={student?.archived ?? false}
                      className="size-5 shrink-0 cursor-pointer rounded-md border-line text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                    />
                  </label>
                )}

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface/80 p-5 sm:flex-row">
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
