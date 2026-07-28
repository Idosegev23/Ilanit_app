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
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/60 bg-white/70 px-6 py-11 text-center shadow-pop backdrop-blur animate-scale-in"
      >
        <span aria-hidden="true" className="blob -top-20 -end-14 size-52 bg-primary" />
        <span
          className="relative z-10 flex size-20 items-center justify-center rounded-full bg-white/70 shadow-card ring-1 ring-white/70"
          aria-hidden="true"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-8" />
          </span>
        </span>
        <p className="relative z-10 text-2xl font-extrabold tracking-tight text-ink">
          המועד בוטל
        </p>
        <p className="relative z-10 max-w-xs text-sm leading-relaxed text-muted">
          המועד בוטל. אפשר לקבוע מועד חדש שמתאים לך בלחיצה כאן.
        </p>
        {/* Hero CTA — the whole point of landing here is rebooking. */}
        <Button
          variant="gradient"
          size="lg"
          className="relative z-10 w-full"
          onClick={() => (window.location.href = '/book')}
        >
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
          className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
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
