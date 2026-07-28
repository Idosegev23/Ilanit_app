'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CheckCircle2, AlertCircle, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitStandby } from './actions';
import type { StandbyResult } from '@/lib/standby';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

const initial: StandbyResult = { ok: false };

async function action(_prev: StandbyResult, formData: FormData): Promise<StandbyResult> {
  return submitStandby(_prev, formData);
}

export function StandbyForm() {
  const [state, formAction, pending] = useActionState(action, initial);

  if (state.ok) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-2 px-6 py-10 text-center shadow-card animate-fade-in"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-success text-white shadow-card ring-4 ring-success/15">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold text-ink">נרשמת לרשימת ההמתנה 🎉</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          ברגע שיתפנה מקום בטווח שביקשת — נעדכן אותך בהודעה.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sb-name" required>
            שם
          </Label>
          <Input id="sb-name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-phone" required>
            טלפון
          </Label>
          <Input
            id="sb-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="05X-XXXXXXX"
            autoComplete="tel"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sb-email">אימייל (לא חובה)</Label>
        <Input id="sb-email" name="email" type="email" dir="ltr" autoComplete="email" />
        <p className="text-xs text-muted">רק אם תרצו לקבל תזכורות גם במייל.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">אילו ימים מתאימים לך?</legend>
        <div className="flex flex-wrap gap-2">
          {HE_DAYS.map((label, i) => (
            <label key={i} className="cursor-pointer">
              <input type="checkbox" name="weekdays" value={i} className="peer sr-only" />
              <span className="flex items-center justify-center rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 peer-checked:border-primary-300 peer-checked:bg-primary-50 peer-checked:text-primary-700 peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sb-start" required>
            משעה
          </Label>
          <Input
            id="sb-start"
            name="startTime"
            type="time"
            dir="ltr"
            defaultValue="14:00"
            className="tabular-nums"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-end" required>
            עד שעה
          </Label>
          <Input
            id="sb-end"
            name="endTime"
            type="time"
            dir="ltr"
            defaultValue="17:00"
            className="tabular-nums"
            required
          />
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{state.error}</p>
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        {!pending && <Hourglass className="size-5" aria-hidden="true" />}
        הצטרפות לרשימת ההמתנה
      </Button>
    </form>
  );
}
