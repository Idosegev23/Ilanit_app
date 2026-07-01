import { NextResponse } from 'next/server';
import { cancelByToken } from '@/lib/availability/cancel';

// Self-service cancel endpoint reached from /c/[token]. No login — the single-use
// 'cancel' token IS the authorization. Cancels the lesson + frees the slot.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const result = await cancelByToken(token);

  if (result.ok) {
    return NextResponse.json({ ok: true, datetime: result.datetime });
  }

  const status =
    result.error === 'invalid_token' ? 410 : result.error === 'wrong_state' ? 409 : 500;
  return NextResponse.json({ ok: false, error: result.message }, { status });
}
