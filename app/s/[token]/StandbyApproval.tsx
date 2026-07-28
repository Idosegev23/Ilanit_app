'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveStandby } from './actions';

interface Candidate {
  id: string;
  name: string;
  phone: string;
  pref: string;
}

export function StandbyApproval({
  token,
  slotLabel,
  candidates,
}: {
  token: string;
  slotLabel: string;
  candidates: Candidate[];
}) {
  const [selected, setSelected] = React.useState<string>(candidates[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<'idle' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    const res = await approveStandby(token, selected);
    if (!res.ok) {
      setOutcome('error');
      setMessage(res.error ?? 'אירעה שגיאה');
      setBusy(false);
      return;
    }
    setOutcome('done');
    setBusy(false);
  }

  if (outcome === 'done') {
    const who = candidates.find((c) => c.id === selected)?.name ?? '';
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-2 px-6 py-9 text-center shadow-card animate-fade-in"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-success text-white shadow-card ring-4 ring-success/15">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold text-ink">השיעור נקבע 🎉</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          {who} שובץ/ה ל־
          <span dir="ltr" className="tabular-nums">
            {slotLabel}
          </span>{' '}
          — נכנס ליומן והתלמיד/ה קיבל/ה אישור.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink">מי מקבל/ת את המקום?</p>

      <div className="space-y-2">
        {candidates.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors duration-150 hover:bg-surface-2 has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50"
          >
            <input
              type="radio"
              name="candidate"
              value={c.id}
              checked={selected === c.id}
              onChange={() => {
                setSelected(c.id);
                if (outcome === 'error') setOutcome('idle');
              }}
              className="mt-1 accent-primary-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{c.name}</span>
              <span className="block text-xs text-muted" dir="ltr">
                {c.phone}
              </span>
              <span className="mt-0.5 block text-xs text-muted">מבוקש: {c.pref}</span>
            </span>
          </label>
        ))}
      </div>

      {outcome === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
      )}

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={!selected}
        onClick={confirm}
      >
        {!busy && <CalendarCheck className="size-5" aria-hidden="true" />}
        אשר וקבע את השיעור
      </Button>
    </div>
  );
}
