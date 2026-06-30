import { NextResponse } from 'next/server';
import { bookLesson, type BookRequest } from '@/lib/availability/booking';

// Token-based booking endpoint. POST /api/book with { token, startISO, endISO,
// email?, notes? }. The student is identified from the PERSONAL booking-link
// token (no name/phone form). Re-checks the slot, creates a pending lesson and
// fires the approval flow. No login (the token IS the authorization).

export const dynamic = 'force-dynamic';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const input: BookRequest = {
    token: str(body.token),
    email: str(body.email) || undefined,
    startISO: str(body.startISO),
    endISO: str(body.endISO),
    notes: str(body.notes) || undefined,
    // Recipient-supplied details (generic invite — placeholder student).
    name: str(body.name) || undefined,
    phone: str(body.phone) || undefined,
    guardianName: str(body.guardianName) || undefined,
    guardianPhone: str(body.guardianPhone) || undefined,
  };

  const result = await bookLesson(input);

  if (result.ok) {
    return NextResponse.json({ ok: true, lessonId: result.lessonId });
  }

  const status =
    result.error === 'invalid_input'
      ? 400
      : result.error === 'invalid_token'
        ? 410
        : result.error === 'slot_taken'
          ? 409
          : 500;
  return NextResponse.json({ ok: false, error: result.message }, { status });
}
