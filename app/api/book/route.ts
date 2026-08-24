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
    // Permanent public booking (no token) — visitor identified by their details.
    open: body.open === true,
    // Visitor-supplied details.
    name: str(body.name) || undefined,
    phone: str(body.phone) || undefined,
    guardianName: str(body.guardianName) || undefined,
    guardianPhone: str(body.guardianPhone) || undefined,
    // Set on the RE-submit, after the visitor picked which sibling.
    studentId: str(body.studentId) || undefined,
  };

  const result = await bookLesson(input);

  if (result.ok) {
    // `status` tells the form whether to celebrate a booking or explain that the
    // request is waiting on Ilanit.
    return NextResponse.json({ ok: true, lessonId: result.lessonId, status: result.status });
  }

  // The number belongs to several students. Not a failure — the caller has to
  // choose and re-submit, so the candidates travel back with the response.
  if (result.error === 'choose_student') {
    return NextResponse.json(
      { ok: false, needsStudentChoice: true, error: result.message, candidates: result.candidates },
      { status: 409 },
    );
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
