'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatShekels } from '@/lib/utils';

type Method = 'bit' | 'cash' | 'transfer' | 'other';

const METHOD_LABELS: Record<Method, string> = {
  bit: 'ביט',
  cash: 'מזומן',
  transfer: 'העברה בנקאית',
  other: 'אחר',
};

interface Props {
  token: string;
  suggestedAmount: number;
}

type Phase = 'choose' | 'paid' | 'done-paid' | 'done-request';

/**
 * Client form for the payment action: choose paid/unpaid; for "paid" allow
 * editing the (integer-shekel) amount and selecting a payment method, then post
 * to /api/payment. Money is always whole shekels — the input rejects decimals.
 */
export function PaymentForm({ token, suggestedAmount }: Props) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [amount, setAmount] = useState<number>(suggestedAmount > 0 ? suggestedAmount : 0);
  const [method, setMethod] = useState<Method>('bit');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>('');

  async function submit(decision: 'paid' | 'request') {
    setSubmitting(true);
    setMessage('');
    try {
      const payload =
        decision === 'paid'
          ? { token, decision, amount: Math.round(amount), method }
          : { token, decision };
      const res = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setPhase(decision === 'paid' ? 'done-paid' : 'done-request');
      } else {
        // Keep the user on the screen they acted from so they can retry.
        setPhase(decision === 'paid' ? 'paid' : 'choose');
        setMessage(data.error ?? 'אירעה שגיאה. נסי שוב.');
      }
    } catch {
      setPhase(decision === 'paid' ? 'paid' : 'choose');
      setMessage('אירעה שגיאה ברשת. נסי שוב.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'done-paid') {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">
        התשלום עודכן והקבלה הופקה ונשלחה לתלמיד/ה כצרופה. עותק נשמר בתיק הלקוח.
      </div>
    );
  }

  if (phase === 'done-request') {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800" role="status">
        בקשת תשלום נשלחה לתלמיד/ה בוואטסאפ.
      </div>
    );
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">האם התקבל תשלום עבור השיעור?</p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setPhase('paid')} disabled={submitting}>
            שולם — הפקת קבלה
          </Button>
          <Button variant="outline" onClick={() => submit('request')} disabled={submitting}>
            טרם שולם — שליחת בקשת תשלום
          </Button>
        </div>
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </div>
    );
  }

  // phase === 'paid' — editable amount + method form
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="amount" className="text-sm font-medium text-slate-700">
          סכום (₪, שקלים שלמים)
        </label>
        <Input
          id="amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
        />
        <p className="text-xs text-slate-500">{formatShekels(Math.round(amount) || 0)}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">אמצעי תשלום</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={
                'rounded-lg border px-3 py-2 text-sm ' +
                (method === m
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
              }
              aria-pressed={method === m}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </fieldset>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => submit('paid')}
          disabled={submitting || !(Math.round(amount) > 0)}
        >
          {submitting ? 'מפיק קבלה…' : 'אישור והפקת קבלה'}
        </Button>
        <Button variant="ghost" onClick={() => setPhase('choose')} disabled={submitting}>
          חזרה
        </Button>
      </div>
    </div>
  );
}
