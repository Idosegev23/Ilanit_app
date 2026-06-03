'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createManualLesson, type ActionResult } from './actions';

const initialState: ActionResult = { ok: false };

async function action(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return createManualLesson(formData);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function ManualLessonForm() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>שיעור חד-פעמי</CardTitle>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'סגור' : 'הוסף'}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <form action={formAction} className="space-y-3">
            <Field label="שם תלמיד">
              <Input name="name" required />
            </Field>
            <Field label="טלפון">
              <Input name="phone" inputMode="tel" required placeholder="0501234567" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="תאריך">
                <Input name="date" type="date" required />
              </Field>
              <Field label="שעה">
                <Input name="time" type="time" required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="משך (דק׳)">
                <Input name="durationMin" type="number" min={1} placeholder="60" />
              </Field>
              <Field label="מחיר (₪)">
                <Input name="price" type="number" min={0} step={1} />
              </Field>
            </div>
            <Field label="הערות">
              <Input name="notes" />
            </Field>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            {state.ok && !state.error && (
              <p className="text-sm text-emerald-600">השיעור נוצר.</p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'יוצר…' : 'צור שיעור'}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
