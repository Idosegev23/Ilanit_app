'use client';

import { useState } from 'react';
import {
  ReceiptText,
  Send,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Banknote,
  Landmark,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatShekels } from '@/lib/utils';

type Method = 'bit' | 'cash' | 'transfer' | 'other';

const METHODS: { value: Method; label: string; icon: LucideIcon }[] = [
  { value: 'bit', label: 'ביט', icon: Smartphone },
  { value: 'cash', label: 'מזומן', icon: Banknote },
  { value: 'transfer', label: 'העברה בנקאית', icon: Landmark },
  { value: 'other', label: 'אחר', icon: Wallet },
];

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
        <p className="text-lg font-bold text-success">הקבלה הופקה ונשלחה</p>
        <p className="max-w-xs text-sm leading-relaxed text-ink">
          התשלום עודכן, הקבלה נשלחה לתלמיד/ה כצרופה ועותק נשמר בתיק הלקוח.
        </p>
      </div>
    );
  }

  if (phase === 'done-request') {
    return (
      <div
        role="status"
        className="relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-accent/25 bg-accent-soft px-6 py-9 text-center shadow-card animate-fade-in"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-1 bg-accent-600/70"
        />
        <span
          className="flex size-16 items-center justify-center rounded-full bg-accent-600 text-white shadow-card ring-4 ring-accent-600/15"
          aria-hidden="true"
        >
          <Send className="size-8" />
        </span>
        <p className="text-lg font-bold text-accent-text">בקשת תשלום נשלחה</p>
        <p className="max-w-xs text-sm leading-relaxed text-ink">
          הבקשה נשלחה לתלמיד/ה בוואטסאפ.
        </p>
      </div>
    );
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">האם התקבל תשלום עבור השיעור?</p>
        <div className="flex flex-col gap-2.5">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={() => setPhase('paid')}
          >
            <ReceiptText className="size-5" aria-hidden="true" />
            שולם — הפקת קבלה
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            loading={submitting}
            onClick={() => submit('request')}
          >
            {!submitting && <Send className="size-5" aria-hidden="true" />}
            טרם שולם — שליחת בקשת תשלום
          </Button>
        </div>
        {message ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm text-danger">{message}</p>
          </div>
        ) : null}
      </div>
    );
  }

  // phase === 'paid' — editable amount + method form
  const roundedAmount = Math.round(amount) || 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-gradient-tint p-4">
        <Label htmlFor="amount" className="text-muted">
          סכום שהתקבל (₪, שקלים שלמים)
        </Label>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-2xl font-bold leading-none text-primary-600"
            aria-hidden="true"
          >
            ₪
          </span>
          <Input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="h-14 flex-1 border-0 bg-transparent px-0 text-3xl font-bold tabular-nums text-ink shadow-none focus:ring-0"
            value={Number.isFinite(amount) ? amount : ''}
            onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
          />
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted">
          לקבלה: {formatShekels(roundedAmount)}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 block text-sm font-medium text-ink">אמצעי תשלום</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {METHODS.map(({ value, label, icon: Icon }) => {
            const selected = method === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                aria-pressed={selected}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  selected
                    ? 'border-primary bg-primary text-primary-fg shadow-card'
                    : 'border-line bg-surface text-ink hover:border-primary-200 hover:bg-primary-50',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {message ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={submitting || !(roundedAmount > 0)}
          onClick={() => submit('paid')}
        >
          {!submitting && <Check className="size-5" aria-hidden="true" />}
          אישור והפקת קבלה
        </Button>
        <Button
          variant="ghost"
          size="md"
          className="w-full"
          disabled={submitting}
          onClick={() => setPhase('choose')}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          חזרה
        </Button>
      </div>
    </div>
  );
}
