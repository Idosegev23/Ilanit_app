import { NextResponse } from 'next/server';
import { decideLesson } from '@/lib/availability/approval';

// Action-token endpoint backing /a/[token]. POST { token, decision:'approve'|'reject' }.
// Consumes the single-use token, inserts the calendar event on approval, and
// notifies the student. No login (the token IS the authorization).

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const decision = body.decision === 'reject' ? 'reject' : body.decision === 'approve' ? 'approve' : null;

  if (!token || !decision) {
    return NextResponse.json({ ok: false, error: 'בקשה חסרה' }, { status: 400 });
  }

  const result = await decideLesson(token, decision);

  if (result.ok) {
    return NextResponse.json({ ok: true, action: result.action });
  }

  const status =
    result.error === 'invalid_token'
      ? 410
      : result.error === 'wrong_state'
        ? 409
        : result.error === 'slot_taken'
          ? 409
          : 500;
  return NextResponse.json({ ok: false, error: result.message }, { status });
}
