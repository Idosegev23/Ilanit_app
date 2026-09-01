'use client';

import * as React from 'react';
import { Banknote, Smartphone, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { declareIntentAction } from './actions';

/*
  What the parent taps. Two buttons, matching the two situations they are
  actually in:

    שילמתי       — already settled, and they should not have to remember or
                   declare HOW. Ilanit is the one who needs bit-vs-cash for her
                   books, so the method is captured from her instead.
    לתשלום בביט  — not paid yet; open Ilanit's link and pay now.

  The wording is past tense throughout: a promise to pay is not trackable, and
  the money is confirmed by Ilanit either way. Her Bit link carries no amount,
  so the sum is stated on screen and in the message for them to type in.
*/
export function PayActions({
  token,
  amount,
  bitLink,
}: {
  token: string;
  amount: number;
  bitLink: string | null;
}) {
  const [phase, setPhase] = React.useState<'choose' | 'done'>('choose');
  const [chosen, setChosen] = React.useState<'paid' | 'bit' | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function pick(intent: 'paid' | 'bit') {
    setBusy(true);
    setError(null);
    try {
      const res = await declareIntentAction(token, intent);
      if (!res.ok) {
        setError(res.error ?? 'שגיאה');
        return;
      }
      setChosen(intent);
      setPhase('done');
      // Hand off to Bit only after the choice is safely recorded, so leaving the
      // page for the app cannot lose it.
      if (intent === 'bit' && bitLink) window.open(bitLink, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'done') {
    return (
      <Card className="text-center shadow-pop animate-scale-in">
        <CardBody className="flex flex-col items-center gap-4 py-10">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">תודה!</h2>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            {chosen === 'bit'
              ? 'נפתח עבורך ביט. אחרי שתשלמו, אילנית תאשר את קבלת התשלום.'
              : 'רשמנו שהתשלום בוצע. אילנית תאשר את קבלתו.'}
          </p>
          {chosen === 'bit' && bitLink && (
            <a
              href={bitLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white/70 px-5 text-sm font-semibold text-ink transition hover:bg-white"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              פתיחת ביט שוב
            </a>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {bitLink && (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          onClick={() => pick('bit')}
        >
          <Smartphone className="size-5" aria-hidden="true" />
          תשלום בביט · {amount}₪
        </Button>
      )}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy}
        onClick={() => pick('paid')}
      >
        <Banknote className="size-5" aria-hidden="true" />
        שילמתי כבר
      </Button>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
