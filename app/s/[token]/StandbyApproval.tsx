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
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/60 bg-white/70 px-6 py-11 text-center shadow-pop backdrop-blur animate-scale-in"
      >
        <span aria-hidden="true" className="blob -top-20 -end-14 size-52 bg-primary" />
        <span className="relative z-10 flex size-20 items-center justify-center rounded-full bg-white/70 shadow-card ring-1 ring-white/70">
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </span>
        </span>
        <p className="relative z-10 text-2xl font-extrabold tracking-tight text-ink">
          השיעור נקבע 🎉
        </p>
        <p className="relative z-10 max-w-xs text-sm leading-relaxed text-muted">
          {who} שובץ/ה ל־
          <span dir="ltr" className="font-semibold text-ink tabular-nums">
            {slotLabel}
          </span>{' '}
          — נכנס ליומן והתלמיד/ה קיבל/ה אישור.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-ink">מי מקבל/ת את המקום?</p>

      <div className="stagger space-y-2.5">
        {candidates.map((c, i) => (
          <label
            key={c.id}
            style={{ ['--i' as string]: i } as React.CSSProperties}
            className="flex min-h-[3.25rem] cursor-pointer items-start gap-3 rounded-2xl border border-white/60 bg-white/65 px-4 py-3.5 shadow-soft backdrop-blur transition-[background-color,border-color,box-shadow] duration-200 hover:border-primary-300 hover:bg-primary-50 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:shadow-glow"
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
              className="mt-1 size-4 shrink-0 accent-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{c.name}</span>
              <span className="block text-xs tabular-nums text-muted" dir="ltr">
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
          className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
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
