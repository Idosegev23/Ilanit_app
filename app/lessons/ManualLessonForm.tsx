'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createManualLesson, type ActionResult } from './actions';

const initialState: ActionResult = { ok: false };

async function action(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return createManualLesson(formData);
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
    </div>
  );
}

// Single-lesson manual create form. Lives inside the lessons dialog. Preserves
// the exact form `name` fields and the createManualLesson server action; on a
// successful create it fires onSuccess so the host can close + reset.
export function ManualLessonForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const succeeded = state.ok && !state.error;

  React.useEffect(() => {
    if (succeeded) {
      const id = setTimeout(() => onSuccess?.(), 700);
      return () => clearTimeout(id);
    }
  }, [succeeded, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="שם תלמיד" htmlFor="manual-name" required>
        <Input id="manual-name" name="name" required />
      </Field>
      <Field label="טלפון" htmlFor="manual-phone" required>
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
        <Field label="מחיר (₪)" htmlFor="manual-price">
          <Input
            id="manual-price"
            name="price"
            type="number"
            min={0}
            step={1}
            className="tabular-nums"
          />
        </Field>
      </div>
      <Field label="הערות" htmlFor="manual-notes">
        <Textarea id="manual-notes" name="notes" rows={2} />
      </Field>

      {state.error && (
        <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}
      {succeeded && (
        <p className="flex items-center gap-1.5 text-sm text-success" role="status">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          השיעור נוצר.
        </p>
      )}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? 'יוצר…' : 'צור שיעור'}
      </Button>
    </form>
  );
}
