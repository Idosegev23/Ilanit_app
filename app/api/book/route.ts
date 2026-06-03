import { NextResponse } from 'next/server';
import { bookLesson, type BookRequest } from '@/lib/availability/booking';

// Public booking endpoint. POST /api/book with { name, phone, email?, startISO,
// endISO, notes? }. Re-checks the slot, matches/creates the student, creates a
// pending lesson and fires the approval flow. No auth (booking is public).

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
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email) || undefined,
    startISO: str(body.startISO),
    endISO: str(body.endISO),
    notes: str(body.notes) || undefined,
  };

  const result = await bookLesson(input);

  if (result.ok) {
    return NextResponse.json({ ok: true, lessonId: result.lessonId });
  }

  const status = result.error === 'invalid_input' ? 400 : result.error === 'slot_taken' ? 409 : 500;
  return NextResponse.json({ ok: false, error: result.message }, { status });
}
