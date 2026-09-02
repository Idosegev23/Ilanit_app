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

// Quick presets for the receipt description line; Ilanit can also type freely.
const RECEIPT_PRESETS = ['שיעור פרטי', 'חוג', 'הוראה מתקנת'] as const;
const DEFAULT_RECEIPT_LABEL = 'שיעור פרטי';

interface Props {
  token: string;
  suggestedAmount: number;
  /** Default receipt description for this student (students.receiptLabel). */
  defaultDescription?: string | null;
  /**
   * Whether settling also issues an official Morning receipt. Off by default:
   * Ilanit confirms money arrived far more often than she is ready to put a
   * numbered tax document behind it, so the screen must not promise one.
   */
  receiptsEnabled?: boolean;
}

type Phase = 'choose' | 'paid' | 'done-paid' | 'done-request';

/**
 * Client form for the payment action: choose paid/unpaid; for "paid" allow
 * editing the (integer-shekel) amount and selecting a payment method, then post
 * to /api/payment. Money is always whole shekels — the input rejects decimals.
 */
export function PaymentForm({
  token,
  suggestedAmount,
  defaultDescription,
  receiptsEnabled = false,
}: Props) {
  const initialDescription = defaultDescription?.trim() || DEFAULT_RECEIPT_LABEL;
  const [phase, setPhase] = useState<Phase>('choose');
  const [amount, setAmount] = useState<number>(suggestedAmount > 0 ? suggestedAmount : 0);
  const [method, setMethod] = useState<Method>('bit');
  const [description, setDescription] = useState<string>(initialDescription);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>('');

  async function submit(decision: 'paid' | 'request') {
    setSubmitting(true);
    setMessage('');
    try {
      const trimmedDescription = description.trim();
      const payload =
        decision === 'paid'
          ? {
              token,
              decision,
              amount: Math.round(amount),
              method,
              description: trimmedDescription || DEFAULT_RECEIPT_LABEL,
            }
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
        <p className="text-2xl font-extrabold tracking-tight text-success">
          {receiptsEnabled ? 'הקבלה הופקה ונשלחה' : 'התשלום נרשם'}
        </p>
        <p className="max-w-xs text-sm leading-relaxed text-ink">
          {receiptsEnabled
            ? 'התשלום עודכן, הקבלה נשלחה לתלמיד/ה כצרופה ועותק נשמר בתיק הלקוח.'
            : 'התשלום נרשם בתיק הלקוח. לא הופקה קבלה.'}
        </p>
      </div>
    );
  }

  if (phase === 'done-request') {
    return (
      <div
        role="status"
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/70 bg-accent-soft px-6 py-11 text-center shadow-pop animate-scale-in"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-1 bg-accent-600/70"
        />
        {/* Peach is a SURFACE, never a white-text fill (white on #f3bd97 ≈ 1.8:1).
            The glyph is ink. */}
        <span
          className="flex size-20 items-center justify-center rounded-full bg-white/70 shadow-card ring-1 ring-white/70"
          aria-hidden="true"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-600 text-ink">
            <Send className="size-7" />
          </span>
        </span>
        <p className="text-2xl font-extrabold tracking-tight text-accent-text">
          בקשת תשלום נשלחה
        </p>
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
            {receiptsEnabled ? 'שולם — הפקת קבלה' : 'שולם — אישור קבלת התשלום'}
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
            className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
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
      {/* Amount hero — the number is the subject of this screen, so it gets the
          blush surface, the biggest type in the flow and tabular figures. */}
      <div className="rounded-2xl bg-primary-soft p-4 shadow-soft ring-1 ring-white/60">
        <Label htmlFor="amount" className="text-muted">
          סכום שהתקבל (₪, שקלים שלמים)
        </Label>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-2xl font-extrabold leading-none text-primary-700"
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
            className="h-14 flex-1 border-0 bg-transparent px-0 text-4xl font-extrabold tracking-tight tabular-nums text-ink shadow-none focus:bg-transparent focus:ring-0"
            value={Number.isFinite(amount) ? amount : ''}
            onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
          />
        </div>
        <p className="mt-1 text-xs tabular-nums text-muted">
          {receiptsEnabled ? 'לקבלה: ' : 'יירשם: '}
          {formatShekels(roundedAmount)}
        </p>
      </div>

      {receiptsEnabled && (
        <fieldset className="space-y-2">
          <legend className="mb-2 block text-sm font-semibold text-ink">תיאור לקבלה</legend>
          <div className="flex flex-wrap gap-2">
            {RECEIPT_PRESETS.map((preset) => {
              const selected = description.trim() === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDescription(preset)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    selected
                      ? 'border-primary bg-primary font-bold text-primary-fg shadow-glow'
                      : 'border-white/70 bg-white/80 font-medium text-ink shadow-soft backdrop-blur hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50',
                  )}
                >
                  {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  {preset}
                </button>
              );
            })}
          </div>
          <Label htmlFor="receipt-description" className="sr-only">
            תיאור חופשי לקבלה
          </Label>
          <Input
            id="receipt-description"
            type="text"
            value={description}
            maxLength={120}
            placeholder="תיאור חופשי לקבלה"
            onChange={(e) => setDescription(e.target.value)}
            className="text-ink"
          />
          <p className="text-xs text-muted">השורה שתופיע בקבלה. אפשר לבחור מהקיצורים או להקליד חופשי.</p>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 block text-sm font-semibold text-ink">אמצעי תשלום</legend>
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
                  'flex min-h-12 items-center justify-center gap-2 rounded-full border px-3 py-2.5 text-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  selected
                    ? 'border-primary bg-primary font-bold text-primary-fg shadow-glow'
                    : 'border-white/70 bg-white/80 font-medium text-ink shadow-soft backdrop-blur hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50',
                )}
              >
                {selected ? (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Icon className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
                )}
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {message ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {/* Final confirmation of a money action → ink, the highest emphasis. */}
        <Button
          variant="ink"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={submitting || !(roundedAmount > 0)}
          onClick={() => submit('paid')}
        >
          {!submitting && <Check className="size-5" aria-hidden="true" />}
          {receiptsEnabled ? 'אישור והפקת קבלה' : 'אישור קבלת התשלום'}
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
