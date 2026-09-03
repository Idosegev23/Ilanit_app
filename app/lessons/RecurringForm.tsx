'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CheckCircle2, AlertCircle, Repeat, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { createRecurringSeries, type ActionResult } from './actions';
import type { StudentOption, GroupOption } from './data';

const initialState: ActionResult = { ok: false };

async function action(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return createRecurringSeries(formData);
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

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Section wrapper — groups related fields with a quiet eyebrow + icon.
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Repeat;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/70 bg-gradient-tint p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-700 ring-1 ring-inset ring-white/70"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

// Weekly recurring-series create form (individual student or group). Lives in
// the lessons dialog. Preserves the exact form `name` fields and the
// createRecurringSeries server action; fires onSuccess only on a real create
// (a zero-count run is reported via state.error and keeps the form open).
export function RecurringForm({
  studentOptions,
  groupOptions,
  onSuccess,
}: {
  studentOptions: StudentOption[];
  groupOptions: GroupOption[];
  onSuccess?: () => void;
}) {
  const [kind, setKind] = React.useState<'individual' | 'group'>('individual');
  const [state, formAction, pending] = useActionState(action, initialState);

  /*
    Submitted by hand, not via `<form action={formAction}>`: React 19 resets a
    form given a function action once that action settles, INCLUDING on failure,
    so a rejected submit used to wipe everything typed.
  */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the form before the transition — currentTarget does not survive it.
    const data = new FormData(e.currentTarget);
    React.startTransition(() => formAction(data));
  }

  const succeeded = state.ok && !state.error;

  React.useEffect(() => {
    if (succeeded) {
      const id = setTimeout(() => onSuccess?.(), 700);
      return () => clearTimeout(id);
    }
  }, [succeeded, onSuccess]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section icon={Repeat} title="משתתפים">
        <Field label="סוג" htmlFor="rec-kind">
          <Select
            id="rec-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'individual' | 'group')}
          >
            <option value="individual">תלמיד יחיד</option>
            <option value="group">קבוצה</option>
          </Select>
        </Field>

        {kind === 'individual' ? (
          <Field label="תלמיד" htmlFor="rec-student" required>
            <Select id="rec-student" name="studentId" required>
              <option value="">— בחר/י —</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="קבוצה" htmlFor="rec-group" required>
            <Select id="rec-group" name="groupId" required>
              <option value="">— בחר/י —</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Section>

      <Section icon={CalendarClock} title="מועד, משך ותמחור">
        <div className="grid grid-cols-2 gap-3">
          <Field label="יום בשבוע" htmlFor="rec-weekday">
            <Select id="rec-weekday" name="weekday" defaultValue={0}>
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="שעה" htmlFor="rec-time" required>
            <Input id="rec-time" name="startTime" type="time" required />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="משך (דק׳)" htmlFor="rec-duration">
            <Input
              id="rec-duration"
              name="durationMin"
              type="number"
              min={1}
              className="tabular-nums"
              placeholder="60"
            />
          </Field>
          <Field label="מחיר (₪)" htmlFor="rec-price">
            <Input
              id="rec-price"
              name="price"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>
          <Field label="אופק (ימים)" htmlFor="rec-horizon">
            <Input
              id="rec-horizon"
              name="horizonDays"
              type="number"
              min={1}
              className="tabular-nums"
              placeholder="30"
            />
          </Field>
        </div>
      </Section>

      {state.error && (
        <p
          className="flex animate-fade-in items-center gap-2 rounded-2xl border border-danger bg-danger-soft px-3.5 py-3 text-sm font-semibold text-danger"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}
      {succeeded && (
        <p
          className="flex animate-fade-in items-center gap-2 rounded-2xl border border-success bg-success-soft px-3.5 py-3 text-sm font-semibold text-success"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          הסדרה נוצרה.
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? 'יוצר…' : 'צור סדרה'}
      </Button>
    </form>
  );
}
