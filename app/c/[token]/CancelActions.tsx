'use client';

import * as React from 'react';
import { CalendarX2, CheckCircle2, AlertTriangle, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Cancel / reschedule button for /c/[token]. Posts to /api/cancel (single-use
// token consumed server-side). On success it offers the permanent booking link
// so the student can immediately pick a new time — i.e. reschedule = cancel +
// rebook.

type Outcome = 'idle' | 'cancelled' | 'error';

export function CancelActions({ token }: { token: string }) {
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome>('idle');
  const [message, setMessage] = React.useState<string>('');

  async function cancel() {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setOutcome('error');
        setMessage(json.error ?? 'אירעה שגיאה');
        return;
      }
      setOutcome('cancelled');
    } catch {
      setOutcome('error');
      setMessage('אירעה שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (outcome === 'cancelled') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-2 px-6 py-9 text-center shadow-card animate-fade-in"
      >
        <span
          className="flex size-16 items-center justify-center rounded-full bg-success text-white shadow-card ring-4 ring-success/15"
          aria-hidden="true"
        >
          <CheckCircle2 className="size-8" />
        </span>
        <p className="text-lg font-bold text-ink">המועד בוטל</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          המועד בוטל. אפשר לקבוע מועד חדש שמתאים לך בלחיצה כאן.
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={() => (window.location.href = '/book')}>
          <CalendarPlus className="size-5" aria-hidden="true" />
          קביעת מועד חדש
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {outcome === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
      )}
      <Button variant="danger" size="lg" className="w-full" loading={busy} onClick={cancel}>
        {!busy && <CalendarX2 className="size-5" aria-hidden="true" />}
        ביטול המועד
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        לאחר הביטול תוכל/י לקבוע מועד חדש מיד.
      </p>
    </div>
  );
}
