'use client';

import * as React from 'react';
import { useActionState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  User,
  CalendarClock,
  ArrowRight,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createManualLesson, type ActionResult } from './actions';
import { StudentPicker } from '@/components/ui/student-picker';
import type { StudentOption } from './data';

const initialState: ActionResult = { ok: false };

async function action(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return createManualLesson(formData);
}

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

// Section wrapper — groups related fields with a quiet eyebrow + icon so the
// form reads as a crafted, sectioned flow rather than a flat field stack.
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
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

// Single-lesson manual create form. Lives inside the lessons dialog. Preserves
// the exact form `name` fields and the createManualLesson server action; on a
// successful create it fires onSuccess so the host can close + reset.
export function ManualLessonForm({
  onSuccess,
  studentOptions,
}: {
  onSuccess?: () => void;
  studentOptions: StudentOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const succeeded = state.ok && !state.error;

  // Picking from the roster is the default. Creating someone is a separate mode
  // you have to opt into — the old form only offered free-text name + phone, so
  // scheduling for an existing student and inventing a duplicate looked
  // identical while you typed.
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  /*
    Written imperatively rather than through state: the offer button is a
    SUBMIT, so its onClick and the form submission happen in the same event and
    a setState would not have landed in time. Mutating the DOM value does,
    because the form is serialised after the click handler runs.
  */
  const siblingFlagRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    // Clear it whenever the offer is not on screen, so a later ordinary create
    // is never silently treated as adding a sibling.
    if (!state.sameNumberAs && siblingFlagRef.current) siblingFlagRef.current.value = '';
  }, [state.sameNumberAs]);

  React.useEffect(() => {
    if (succeeded) {
      const id = setTimeout(() => onSuccess?.(), 700);
      return () => clearTimeout(id);
    }
  }, [succeeded, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      <Section icon={User} title="פרטי התלמיד">
        {creating ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">תלמיד/ה חדש/ה</p>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName('');
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary-700 transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                בחירה מהרשימה
              </button>
            </div>
            <input type="hidden" name="createNew" value="1" />
            <input ref={siblingFlagRef} type="hidden" name="addAsSibling" defaultValue="" />
            <Field label="שם תלמיד" htmlFor="manual-name" required>
              <Input
                id="manual-name"
                name="name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            <Field
              label="טלפון"
              htmlFor="manual-phone"
              required
              hint="אם המספר או השם כבר קיימים — נעצור ונציע לבחור מהרשימה."
            >
              <Input
                id="manual-phone"
                name="phone"
                inputMode="tel"
                dir="ltr"
                className="text-start"
                required
                placeholder="0501234567"
              />
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" name="studentId" value={studentId ?? ''} />
            <StudentPicker
              id="manual-student"
              students={studentOptions}
              value={studentId}
              onChange={setStudentId}
              onCreateNew={(typed) => {
                setNewName(typed);
                setCreating(true);
              }}
            />
          </>
        )}
      </Section>

      <Section icon={CalendarClock} title="מועד ותמחור">
        <div className="grid grid-cols-2 gap-3">
          <Field label="תאריך" htmlFor="manual-date" required>
            <Input id="manual-date" name="date" type="date" required />
          </Field>
          <Field label="שעה" htmlFor="manual-time" required>
            <Input id="manual-time" name="time" type="time" required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משך (דק׳)" htmlFor="manual-duration">
            <Input
              id="manual-duration"
              name="durationMin"
              type="number"
              min={1}
              className="tabular-nums"
              placeholder="60"
            />
          </Field>
          <Field
            label="מחיר לשיעור (₪)"
            htmlFor="manual-price"
            hint="ריק = מחיר ברירת-המחדל של התלמיד"
          >
            <Input
              id="manual-price"
              name="price"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>
        </div>
        <Field label="הערות" htmlFor="manual-notes">
          <Textarea id="manual-notes" name="notes" rows={2} />
        </Field>
      </Section>

      {/*
        A number already in the roster is usually a SIBLING — one mother,
        several children, one phone. So it is a question, not a refusal, and it
        is answerable right here rather than sending Ilanit off to the students
        screen to add the child first.
      */}
      {state.sameNumberAs ? (
        <div className="animate-fade-in rounded-2xl border border-accent-600/40 bg-accent-soft px-3.5 py-3">
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <div className="min-w-0 text-sm text-ink">
              <p className="font-semibold">
                המספר הזה כבר רשום ל{state.sameNumberAs.names.join(', ')}
              </p>
              <p className="mt-0.5 text-accent-text">
                {state.sameNumberAs.guardianName
                  ? `אם זה עוד ילד/ה של ${state.sameNumberAs.guardianName}, אפשר להוסיף כאח/ות.`
                  : 'אם זה עוד ילד/ה באותה משפחה, אפשר להוסיף כאח/ות.'}
              </p>
              <Button
                type="submit"
                variant="secondary"
                size="md"
                className="mt-2.5"
                loading={pending}
                onClick={() => {
                  if (siblingFlagRef.current) siblingFlagRef.current.value = '1';
                }}
              >
                <Users className="size-4" aria-hidden="true" />
                כן, להוסיף כאח/ות ולקבוע
              </Button>
            </div>
          </div>
        </div>
      ) : (
        state.error && (
          <p
            className="flex animate-fade-in items-center gap-2 rounded-2xl border border-danger bg-danger-soft px-3.5 py-3 text-sm font-semibold text-danger"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        )
      )}
      {succeeded && (
        <p
          className="flex animate-fade-in items-center gap-2 rounded-2xl border border-success bg-success-soft px-3.5 py-3 text-sm font-semibold text-success"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          השיעור נוצר.
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? 'יוצר…' : 'צור שיעור'}
      </Button>
    </form>
  );
}
