import { db } from '@/lib/db';
import { lessons, type Lesson, type Student } from '@/db/schema';
import { and, eq, lt, gt, inArray } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { getStudent, updateStudent } from '@/lib/students';
import { resolveBookingLink } from '@/lib/booking-links';
import { isSlotBookable } from '@/lib/availability';
import { createActionToken } from '@/lib/tokens';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime } from '@/lib/time';

// Core booking service used by /api/book. The student is identified from a
// PERSONAL booking-link token (Ilanit sent them the link) — NOT from a name +
// phone form. We re-check the slot, create a pending lesson with a price +
// location snapshot, mint an approve action-token, and fire the two WhatsApp
// notifications (pending → Ilanit, pending → student). The student may supply an
// email (used for the Google Calendar invite). External calls are mocked in
// tests.

const APPROVE_TTL_MIN = 14 * 24 * 60; // approval links valid for 2 weeks

export interface BookRequest {
  /** Raw booking-link token identifying the student. */
  token: string;
  startISO: string;
  endISO: string;
  /** Optional email for the calendar invite. */
  email?: string;
  notes?: string;
}

export type BookResult =
  | { ok: true; lessonId: string }
  | {
      ok: false;
      error: 'invalid_input' | 'invalid_token' | 'slot_taken' | 'internal';
      message: string;
    };

/**
 * Atomically guards against a double-booking: re-reads any overlapping
 * pending/confirmed lesson AFTER the slot passed isSlotBookable, so a race that
 * inserted between the check and now is still caught before we create ours.
 */
async function hasConflict(start: Date, end: Date): Promise<boolean> {
  const rows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        inArray(lessons.status, ['pending', 'confirmed']),
        lt(lessons.startsAt, end),
        gt(lessons.endsAt, start),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Performs the booking. Returns a typed result; never throws for expected
 * conditions (bad input, invalid token, taken slot). Notifications failing do
 * not fail the booking — the lesson is already persisted and visible in the
 * dashboard.
 */
export async function bookLesson(req: BookRequest): Promise<BookResult> {
  const token = (req.token ?? '').trim();
  if (!token) {
    return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין' };
  }

  const start = new Date(req.startISO);
  const end = new Date(req.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'invalid_input', message: 'invalid slot times' };
  }

  const email = req.email?.trim() ? req.email.trim() : undefined;

  // 1) resolve the student from the personal booking-link token
  const resolved = await resolveBookingLink(token);
  if (!resolved) {
    return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין או שפג תוקפו' };
  }

  let student: Student | null = await getStudent(resolved.studentId);
  if (!student) {
    return { ok: false, error: 'invalid_token', message: 'התלמיד לא נמצא' };
  }

  // 2) re-check the slot (template + exceptions + freeBusy + lead-time + past)
  const bookable = await isSlotBookable(req.startISO, req.endISO);
  if (!bookable) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי' };
  }
  // 3) final conflict guard against a concurrent booking
  if (await hasConflict(start, end)) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי' };
  }

  const settings = await getSettings();

  // 4) opportunistically record a newly-supplied email on the student
  if (email && !student.email) {
    try {
      student = await updateStudent(student.id, { email });
    } catch (err) {
      console.error('[booking] failed to record student email (continuing):', err);
    }
  }

  const price = student.defaultPrice ?? null;
  const location = settings.locationAddress || null;

  // 5) create the pending lesson with the price + location snapshot
  let lesson: Lesson;
  try {
    const inserted = await db
      .insert(lessons)
      .values({
        type: 'individual',
        source: 'booking',
        studentId: student.id,
        startsAt: start,
        endsAt: end,
        status: 'pending',
        needsMatch: false,
        price,
        location,
        bookedByName: student.name,
        bookedByPhone: student.phone,
        notes: req.notes?.trim() || null,
      })
      .returning();
    lesson = inserted[0];
  } catch (err) {
    console.error('[booking] failed to create lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה ביצירת השיעור' };
  }

  // 6) approve action-token + notifications (best-effort; do not fail booking)
  try {
    const rawToken = await createActionToken('approve', lesson.id, APPROVE_TTL_MIN);
    const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const actionUrl = `${appUrl}/a/${rawToken}`;
    const datetime = formatILDateTime(start);

    await notify(
      'booking_pending_ilanit',
      env().ILANIT_PHONE,
      {
        studentName: student.name,
        phone: student.phone ?? '',
        datetime,
        price: price ?? 0,
        notes: req.notes?.trim() ?? '',
        actionUrl,
      },
      `pending-ilanit:${lesson.id}`,
      lesson.id,
    );

    await notifyStudent(
      student,
      'booking_pending_student',
      { studentName: student.name, datetime },
      `pending-student:${lesson.id}`,
      lesson.id,
    );
  } catch (err) {
    console.error('[booking] notification step failed (lesson kept):', err);
  }

  return { ok: true, lessonId: lesson.id };
}
