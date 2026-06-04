import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { normalizePhoneIL } from '@/lib/utils';
import { getSettings } from '@/lib/settings';
import { findStudentByPhone, createStudent, getStudent, contactPhoneFor } from '@/lib/students';
import { createBookingLink } from '@/lib/booking-links';
import { notify } from '@/lib/notifications/dispatch';

// Owner-only endpoint backing the "שלח לינק לתיאום" dialog. Ilanit either picks
// an existing student ({ studentId }) or adds a new one ({ name, phone }); we
// find-or-create the student, mint a personalized booking link, and WhatsApp it
// to the student's phone. Returns { ok, url }.

export const dynamic = 'force-dynamic';

const bodySchema = z.union([
  z.object({ studentId: z.string().uuid('מזהה תלמיד לא תקין') }),
  z.object({
    name: z.string().trim().min(1, 'יש להזין שם'),
    phone: z.string().trim().min(1, 'יש להזין טלפון'),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  // Owner-only — defense-in-depth on top of middleware.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? 'נתונים לא תקינים' },
      { status: 400 },
    );
  }

  // ── Resolve the student (existing by id, or find-or-create by phone) ──
  let studentId: string;
  let studentName: string;
  let studentPhone: string;

  try {
    if ('studentId' in parsed.data) {
      const student = await getStudent(parsed.data.studentId);
      if (!student) {
        return NextResponse.json({ ok: false, error: 'התלמיד לא נמצא' }, { status: 404 });
      }
      studentId = student.id;
      studentName = student.name;
      studentPhone = contactPhoneFor(student); // guardian phone when present
    } else {
      let e164: string;
      try {
        e164 = normalizePhoneIL(parsed.data.phone);
      } catch {
        return NextResponse.json({ ok: false, error: 'מספר טלפון לא תקין' }, { status: 400 });
      }
      const name = parsed.data.name.trim();
      let student = await findStudentByPhone(e164);
      if (!student) {
        const settings = await getSettings();
        student = await createStudent({
          name,
          phone: e164,
          defaultDurationMin: settings.defaultDurationMin,
        });
      }
      studentId = student.id;
      studentName = student.name;
      studentPhone = contactPhoneFor(student); // guardian phone when present
    }
  } catch (err) {
    console.error('[booking-link] failed to resolve student:', err);
    return NextResponse.json({ ok: false, error: 'שגיאה באיתור התלמיד' }, { status: 500 });
  }

  // ── Mint the personalized link ──
  let url: string;
  try {
    const created = await createBookingLink(studentId);
    url = created.url;
  } catch (err) {
    console.error('[booking-link] failed to create link:', err);
    return NextResponse.json({ ok: false, error: 'שגיאה ביצירת הקישור' }, { status: 500 });
  }

  // ── WhatsApp the link to the student (best-effort: report a soft failure but
  //    still return the URL so Ilanit can copy/share it manually). ──
  let sent = true;
  try {
    const result = await notify(
      'booking_link_student',
      studentPhone,
      { studentName, bookingUrl: url },
    );
    sent = result.ok;
  } catch (err) {
    console.error('[booking-link] WhatsApp send failed (link kept):', err);
    sent = false;
  }

  return NextResponse.json({ ok: true, url, sent });
}
