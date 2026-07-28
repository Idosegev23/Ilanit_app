'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Check, CheckCircle2, AlertCircle, Hourglass } from 'lucide-react';
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
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/60 bg-white/70 px-6 py-12 text-center shadow-pop backdrop-blur animate-scale-in"
      >
        <span aria-hidden="true" className="blob -top-20 -end-14 size-52 bg-primary" />
        <span aria-hidden="true" className="blob -bottom-24 -start-16 size-56 bg-accent" />
        <span className="relative z-10 flex size-20 items-center justify-center rounded-full bg-white/70 shadow-glow ring-1 ring-white/70">
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </span>
        </span>
        <p className="relative z-10 text-2xl font-extrabold tracking-tight text-ink">
          נרשמת לרשימת ההמתנה 🎉
        </p>
        <p className="relative z-10 max-w-xs text-sm leading-relaxed text-muted">
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
            className="text-end tabular-nums"
            placeholder="05X-XXXXXXX"
            autoComplete="tel"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sb-email">אימייל (לא חובה)</Label>
        <Input
          id="sb-email"
          name="email"
          type="email"
          dir="ltr"
          className="text-end"
          autoComplete="email"
        />
        <p className="text-xs text-muted">רק אם תרצו לקבל תזכורות גם במייל.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-ink">אילו ימים מתאימים לך?</legend>
        <div className="flex flex-wrap gap-2">
          {HE_DAYS.map((label, i) => (
            <label key={i} className="cursor-pointer">
              <input type="checkbox" name="weekdays" value={i} className="peer sr-only" />
              {/*
                Checked state is carried by fill + weight + a check glyph that
                widens in, never by hue alone. The glyph lives inside the pill,
                so the peer variant is combined with a child selector.
              */}
              <span className="flex min-h-11 items-center justify-center gap-1 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-medium text-ink shadow-soft backdrop-blur transition-[background-color,border-color,color,box-shadow] duration-200 hover:border-primary-300 hover:bg-primary-50 peer-checked:border-primary peer-checked:bg-primary peer-checked:font-bold peer-checked:text-primary-fg peer-checked:shadow-glow peer-checked:[&>svg]:w-4 peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cream">
                <Check
                  className="h-4 w-0 shrink-0 opacity-0 transition-all duration-200"
                  aria-hidden="true"
                />
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
          className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
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
