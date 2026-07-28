'use client';

import * as React from 'react';
import { Check, X, CheckCircle2, CircleX, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Approve / reject buttons for /a/[token]. Posts the decision to /api/approve;
// the single-use token is consumed server-side. Shows the outcome inline.

type Outcome = 'idle' | 'approved' | 'rejected' | 'error';

export function ApproveActions({ token }: { token: string }) {
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome>('idle');
  const [message, setMessage] = React.useState<string>('');

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setOutcome('error');
        setMessage(json.error ?? 'אירעה שגיאה');
        return;
      }
      setOutcome(json.action === 'rejected' ? 'rejected' : 'approved');
    } catch {
      setOutcome('error');
      setMessage('אירעה שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (outcome === 'approved') {
    return (
      <div
        role="status"
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/70 bg-success-soft px-6 py-11 text-center shadow-pop animate-scale-in"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-1 bg-success/70"
        />
        <span
          className="flex size-20 items-center justify-center rounded-full bg-white/70 shadow-card ring-1 ring-white/70"
          aria-hidden="true"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-8" />
          </span>
        </span>
        <p className="text-2xl font-extrabold tracking-tight text-success">השיעור אושר</p>
        <p className="max-w-xs text-sm leading-relaxed text-ink">
          השיעור נכנס ליומן ונשלחה הודעת אישור לתלמיד/ה.
        </p>
      </div>
    );
  }

  if (outcome === 'rejected') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-3xl border border-white/60 bg-white/65 px-6 py-11 text-center shadow-card backdrop-blur animate-scale-in"
      >
        <span
          className="flex size-20 items-center justify-center rounded-full bg-primary-50 text-muted shadow-soft ring-1 ring-white/70"
          aria-hidden="true"
        >
          <CircleX className="size-8" />
        </span>
        <p className="text-2xl font-extrabold tracking-tight text-ink">השיעור נדחה</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          נשלח לתלמיד/ה לינק לקביעת מועד חדש.
        </p>
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
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {/* Ink, not pink: this is the decisive action AND it has to sit beside a
            red reject without two saturated warm fills competing. */}
        <Button
          variant="ink"
          size="lg"
          className="flex-1"
          loading={busy}
          onClick={() => decide('approve')}
        >
          {!busy && <Check className="size-5" aria-hidden="true" />}
          אישור השיעור
        </Button>
        <Button
          variant="danger"
          size="lg"
          className="flex-1"
          disabled={busy}
          onClick={() => decide('reject')}
        >
          <X className="size-5" aria-hidden="true" />
          דחייה
        </Button>
      </div>
    </div>
  );
}
