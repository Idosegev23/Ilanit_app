'use client';

import * as React from 'react';
import { Check, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { answerRescheduleAction } from './actions';

/*
  Accept or decline a moved lesson.

  Declining does not move the lesson back — Ilanit is told instead, because she
  is the one who knows what else can give. The copy says so, so a parent who
  cannot make it does not assume the slot has been released.
*/
export function RescheduleActions({ token }: { token: string }) {
  const [done, setDone] = React.useState<null | boolean>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function answer(accepted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await answerRescheduleAction(token, accepted);
      if (!res.ok) {
        setError(res.error ?? 'שגיאה');
        return;
      }
      setDone(accepted);
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold text-ink">תודה!</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          {done
            ? 'נתראה במועד החדש. השיעור מעודכן ביומן.'
            : 'העברנו לאילנית שהמועד לא מתאים, והיא תחזור אליך לתאם מועד אחר.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        loading={busy}
        onClick={() => answer(true)}
      >
        <Check className="size-5" aria-hidden="true" />
        מתאים לי
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy}
        onClick={() => answer(false)}
      >
        <X className="size-5" aria-hidden="true" />
        לא מתאים לי
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
