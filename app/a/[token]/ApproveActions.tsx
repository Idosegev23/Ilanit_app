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
        className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm font-medium text-success">
          השיעור אושר ונכנס ליומן. נשלחה הודעה לתלמיד/ה.
        </p>
      </div>
    );
  }

  if (outcome === 'rejected') {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-line bg-primary-50 p-4"
      >
        <CircleX className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">
          השיעור נדחה. נשלח לתלמיד/ה לינק לקביעה מחדש.
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
