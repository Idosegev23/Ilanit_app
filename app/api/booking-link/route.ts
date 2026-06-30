import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getSettings } from '@/lib/settings';
import { createStudent, getStudent, contactPhoneFor } from '@/lib/students';
import { createBookingLink } from '@/lib/booking-links';
import { notify } from '@/lib/notifications/dispatch';

// Owner-only endpoint backing the "שלח לינק לתיאום" dialog. Two modes:
//   { studentId }    → mint a personal link for an EXISTING student and WhatsApp
//                      it to the recipient (guardian phone when set).
//   { newInvite }    → a GENERIC invite: Ilanit fills nothing. We create a blank
//                      placeholder student (no phone) + a link; the RECIPIENT
//                      fills in all their details (name, phone, parent, email)
//                      when they open it. Nothing is sent — Ilanit shares the URL.
// Returns { ok, url, sent }.

export const dynamic = 'force-dynamic';

const bodySchema = z.union([
  z.object({ studentId: z.string().uuid('מזהה תלמיד לא תקין') }),
  z.object({ newInvite: z.literal(true) }),
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

  // ── Resolve the student: existing by id, or a fresh placeholder for a generic
  //    invite the recipient completes themselves. ──
  let studentId: string;
  let studentName: string;
  let studentPhone: string | null;

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
      // Generic invite — no details from Ilanit. The placeholder carries no phone
      // (nullable) until the recipient fills it in on the booking page.
      const settings = await getSettings();
      const placeholder = await createStudent({
        name: 'תלמיד/ה חדש/ה',
        phone: null,
        defaultDurationMin: settings.defaultDurationMin,
      });
      studentId = placeholder.id;
      studentName = placeholder.name;
      studentPhone = null; // nothing to WhatsApp — Ilanit shares the link herself
    }
  } catch (err) {
    console.error('[booking-link] failed to resolve student:', err);
    return NextResponse.json({ ok: false, error: 'שגיאה ביצירת ההזמנה' }, { status: 500 });
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

  // ── WhatsApp the link only when we have a recipient phone (existing student).
  //    A generic invite has no phone — Ilanit copies/shares the URL herself. ──
  let sent = false;
  if (studentPhone) {
    try {
      const result = await notify('booking_link_student', studentPhone, {
        studentName,
        bookingUrl: url,
      });
      sent = result.ok;
    } catch (err) {
      console.error('[booking-link] WhatsApp send failed (link kept):', err);
      sent = false;
    }
  }

  return NextResponse.json({ ok: true, url, sent });
}
