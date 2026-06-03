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
        className="flex flex-col items-center gap-3 rounded-2xl border border-success/20 bg-success-soft px-6 py-8 text-center animate-fade-in"
      >
        <span
          className="flex size-14 items-center justify-center rounded-full bg-success text-white shadow-soft"
          aria-hidden="true"
        >
          <CheckCircle2 className="size-7" />
        </span>
        <p className="text-base font-semibold text-success">השיעור אושר</p>
        <p className="text-sm leading-relaxed text-success/90">
          השיעור נכנס ליומן ונשלחה הודעת אישור לתלמיד/ה.
        </p>
      </div>
    );
  }

  if (outcome === 'rejected') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/60 px-6 py-8 text-center animate-fade-in"
      >
        <span
          className="flex size-14 items-center justify-center rounded-full bg-primary-50 text-muted shadow-soft"
          aria-hidden="true"
        >
          <CircleX className="size-7" />
        </span>
        <p className="text-base font-semibold text-ink">השיעור נדחה</p>
        <p className="text-sm leading-relaxed text-muted">
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
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
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
