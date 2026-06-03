import { NextResponse } from 'next/server';
import { assignStudent, type AssignInput } from '@/lib/availability/assign';

// Action-token endpoint backing /m/[token]. POST { token, studentId, alias? }.
// Binds a student to a needs_match (calendar-imported) lesson and remembers the
// alias for future auto-matching. No login (the token IS the authorization).

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const aliasRaw = body.alias as { type?: unknown; value?: unknown } | undefined;
  let alias: AssignInput['alias'];
  if (
    aliasRaw &&
    (aliasRaw.type === 'email' || aliasRaw.type === 'title') &&
    typeof aliasRaw.value === 'string' &&
    aliasRaw.value.trim()
  ) {
    alias = { type: aliasRaw.type, value: aliasRaw.value };
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'בקשה חסרה' }, { status: 400 });
  }

  const result = await assignStudent({ token, studentId, alias });

  if (result.ok) {
    return NextResponse.json({ ok: true, lessonId: result.lessonId, studentId: result.studentId });
  }

  const status =
    result.error === 'invalid_token'
      ? 410
      : result.error === 'wrong_state'
        ? 409
        : result.error === 'unknown_student'
          ? 400
          : 500;
  return NextResponse.json({ ok: false, error: result.message }, { status });
}
