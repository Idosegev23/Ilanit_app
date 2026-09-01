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
  description?: string;
}

// Receipt description line is free text; cap length and fall back to a sensible
// default so the Morning document always has a usable description.
const MAX_DESCRIPTION_LEN = 120;
const DEFAULT_DESCRIPTION = 'שיעור פרטי';

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
  let description = DEFAULT_DESCRIPTION;
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
    const trimmed = typeof body.description === 'string' ? body.description.trim() : '';
    description = (trimmed || DEFAULT_DESCRIPTION).slice(0, MAX_DESCRIPTION_LEN);
  }

  // Single-use token consumption (atomic). Must be a 'payment' token.
  const consumed = await consumeActionToken(token);
  // A token now addresses either a lesson or a group charge; this screen settles
  // lessons, so a group-charge token is not valid here.
  if (!consumed || consumed.type !== 'payment' || !consumed.lessonId) {
    return NextResponse.json(
      { ok: false, error: 'הקישור אינו תקף או שכבר נעשה בו שימוש' },
      { status: 410 },
    );
  }
  const lessonId = consumed.lessonId;

  try {
    if (decision === 'paid') {
      const result = await markLessonPaidAndIssueReceipt({
        lessonId,
        amount,
        method,
        description,
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
