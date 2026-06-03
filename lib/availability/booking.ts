import { db } from '@/lib/db';
import { lessons, type Lesson } from '@/db/schema';
import { and, eq, lt, gt, inArray } from 'drizzle-orm';
import { env } from '@/lib/env';
import { normalizePhoneIL } from '@/lib/utils';
import { getSettings } from '@/lib/settings';
import { findStudentByPhone, createStudent, updateStudent } from '@/lib/students';
import { isSlotBookable } from '@/lib/availability';
import { createActionToken } from '@/lib/tokens';
import { notify } from '@/lib/notifications/dispatch';
import { formatILDateTime } from '@/lib/time';

// Core booking service used by /api/book. Re-checks the slot, matches or creates
// a student by phone, creates a pending lesson with a price+location snapshot,
// mints an approve action-token, and fires the two WhatsApp notifications
// (pending → Ilanit, pending → student). External calls are mocked in tests.

const APPROVE_TTL_MIN = 14 * 24 * 60; // approval links valid for 2 weeks

export interface BookRequest {
  name: string;
  phone: string;
  email?: string;
  startISO: string;
  endISO: string;
  notes?: string;
}

export type BookResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: 'invalid_input' | 'slot_taken' | 'internal'; message: string };

/** Validates required booking fields; returns a normalized phone or throws. */
function validate(req: BookRequest): { name: string; e164: string; email?: string } {
  const name = (req.name ?? '').trim();
  if (!name) throw new Error('name required');
  if (!req.phone || !req.phone.trim()) throw new Error('phone required');
  const e164 = normalizePhoneIL(req.phone);
  const email = req.email?.trim() ? req.email.trim() : undefined;
  return { name, e164, email };
}

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
 * conditions (bad input, taken slot). Notifications failing do not fail the
 * booking — the lesson is already persisted and visible in the dashboard.
 */
export async function bookLesson(req: BookRequest): Promise<BookResult> {
  let parsed: { name: string; e164: string; email?: string };
  try {
    parsed = validate(req);
  } catch (err) {
    return { ok: false, error: 'invalid_input', message: (err as Error).message };
  }

  const start = new Date(req.startISO);
  const end = new Date(req.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'invalid_input', message: 'invalid slot times' };
  }

  // 1) re-check the slot (template + exceptions + freeBusy + lead-time + past)
  const bookable = await isSlotBookable(req.startISO, req.endISO);
  if (!bookable) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי' };
  }
  // 2) final conflict guard against a concurrent booking
  if (await hasConflict(start, end)) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי' };
  }

  const settings = await getSettings();

  // 3) match or create the student by phone (snapshot price from the student)
  let student = await findStudentByPhone(parsed.e164);
  if (!student) {
    student = await createStudent({
      name: parsed.name,
      phone: parsed.e164,
      email: parsed.email ?? null,
      defaultDurationMin: settings.defaultDurationMin,
    });
  } else if (parsed.email && !student.email) {
    // opportunistically record a newly-supplied email on the existing student
    student = await updateStudent(student.id, { email: parsed.email });
  }

  const price = student.defaultPrice ?? null;
  const location = settings.locationAddress || null;

  // 4) create the pending lesson with the price + location snapshot
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
        bookedByName: parsed.name,
        bookedByPhone: parsed.e164,
        notes: req.notes?.trim() || null,
      })
      .returning();
    lesson = inserted[0];
  } catch (err) {
    console.error('[booking] failed to create lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה ביצירת השיעור' };
  }

  // 5) approve action-token + notifications (best-effort; do not fail booking)
  try {
    const rawToken = await createActionToken('approve', lesson.id, APPROVE_TTL_MIN);
    const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const actionUrl = `${appUrl}/a/${rawToken}`;
    const datetime = formatILDateTime(start);

    await notify(
      'booking_pending_ilanit',
      env().ILANIT_PHONE,
      {
        studentName: parsed.name,
        phone: parsed.e164,
        datetime,
        price: price ?? 0,
        notes: req.notes?.trim() ?? '',
        actionUrl,
      },
      `pending-ilanit:${lesson.id}`,
      lesson.id,
    );

    await notify(
      'booking_pending_student',
      parsed.e164,
      { studentName: parsed.name, datetime },
      `pending-student:${lesson.id}`,
      lesson.id,
    );
  } catch (err) {
    console.error('[booking] notification step failed (lesson kept):', err);
  }

  return { ok: true, lessonId: lesson.id };
}
