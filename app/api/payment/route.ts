import { NextResponse } from 'next/server';
import { consumeActionToken } from '@/lib/tokens';
import {
  markLessonPaidAndIssueReceipt,
  sendPaymentRequest,
  type PaymentMethod,
} from '@/lib/morning/receipt-service';

export const runtime = 'nodejs';

const METHODS: readonly PaymentMethod[] = ['bit', 'cash', 'transfer', 'other'];

interface PaymentBody {
  token?: string;
  decision?: 'paid' | 'request';
  amount?: number;
  method?: string;
}

/**
 * Handles the WhatsApp-link → web action for a lesson payment.
 *   decision = 'paid'    → mark paid, issue Morning receipt, attach PDF, archive
 *   decision = 'request' → send a payment request to the student
 * Auth is the single-use action token (no login).
 */
export async function POST(req: Request): Promise<Response> {
  let body: PaymentBody;
  try {
    body = (await req.json()) as PaymentBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const { token, decision } = body;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing token' }, { status: 400 });
  }
  if (decision !== 'paid' && decision !== 'request') {
    return NextResponse.json({ ok: false, error: 'invalid decision' }, { status: 400 });
  }

  // For 'paid' we validate amount + method up front (before consuming the token,
  // so a bad request can be retried with the same link).
  let amount = 0;
  let method: PaymentMethod = 'other';
  if (decision === 'paid') {
    amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: 'amount must be a positive integer (shekels)' },
        { status: 400 },
      );
    }
    if (!METHODS.includes(body.method as PaymentMethod)) {
      return NextResponse.json({ ok: false, error: 'invalid payment method' }, { status: 400 });
    }
    method = body.method as PaymentMethod;
  }

  // Single-use token consumption (atomic). Must be a 'payment' token.
  const consumed = await consumeActionToken(token);
  if (!consumed || consumed.type !== 'payment') {
    return NextResponse.json(
      { ok: false, error: 'הקישור אינו תקף או שכבר נעשה בו שימוש' },
      { status: 410 },
    );
  }

  try {
    if (decision === 'paid') {
      const result = await markLessonPaidAndIssueReceipt({
        lessonId: consumed.lessonId,
        amount,
        method,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
      }
      return NextResponse.json({
        ok: true,
        decision: 'paid',
        docNumber: result.docNumber,
        pdfUrl: result.pdfUrl,
        sent: result.sent,
      });
    }

    const result = await sendPaymentRequest(consumed.lessonId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, decision: 'request' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
