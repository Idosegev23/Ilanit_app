'use client';

import * as React from 'react';
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
    return <p className="text-sm font-medium text-green-700">השיעור אושר ונכנס ליומן. נשלחה הודעה לתלמיד/ה. ✅</p>;
  }
  if (outcome === 'rejected') {
    return <p className="text-sm font-medium text-slate-700">השיעור נדחה. נשלח לתלמיד/ה לינק לקביעה מחדש.</p>;
  }

  return (
    <div className="space-y-3">
      {outcome === 'error' && <p className="text-sm text-red-600">{message}</p>}
      <div className="flex gap-2">
        <Button onClick={() => decide('approve')} disabled={busy}>
          {busy ? 'מעדכן…' : 'אישור השיעור'}
        </Button>
        <Button variant="destructive" onClick={() => decide('reject')} disabled={busy}>
          דחייה
        </Button>
      </div>
    </div>
  );
}
