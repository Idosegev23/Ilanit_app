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
        className="relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-success/25 bg-success-soft px-6 py-9 text-center shadow-card animate-fade-in"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-1 bg-success/70"
        />
        <span
          className="flex size-16 items-center justify-center rounded-full bg-success text-white shadow-card ring-4 ring-success/15"
          aria-hidden="true"
        >
          <CheckCircle2 className="size-8" />
        </span>
        <p className="text-lg font-bold text-success">השיעור אושר</p>
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
        className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2 px-6 py-9 text-center shadow-card animate-fade-in"
      >
        <span
          className="flex size-16 items-center justify-center rounded-full bg-surface text-muted shadow-soft ring-1 ring-line"
          aria-hidden="true"
        >
          <CircleX className="size-8" />
        </span>
        <p className="text-lg font-bold text-ink">השיעור נדחה</p>
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
