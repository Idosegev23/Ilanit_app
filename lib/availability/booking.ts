import { db } from '@/lib/db';
import { lessons, type Lesson, type Student } from '@/db/schema';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { getStudent, updateStudent, findStudentByPhone, createStudent } from '@/lib/students';
import { normalizePhoneIL } from '@/lib/utils';
import { resolveBookingLink } from '@/lib/booking-links';
import { isSlotBookable, isSlotForceOpen, overlappingLessons } from '@/lib/availability';
import { insertEvent, cancelEvent } from '@/lib/google-calendar';
import { addToCalendarUrl } from '@/lib/calendar-link';
import { createCancelUrl } from '@/lib/availability/cancel';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime } from '@/lib/time';

// Core booking service used by /api/book. The student is identified from a
// personal booking-link token or the permanent public link. We re-check the
// slot, insert the Google Calendar event, create a CONFIRMED lesson immediately
// (NO approval step), then fire two WhatsApp messages: "lesson scheduled" →
// Ilanit, and a confirmation with an add-to-calendar + cancel link → the
// student. External calls are mocked in tests.

export interface BookRequest {
  /** Raw booking-link token identifying the student. */
  token: string;
  startISO: string;
  endISO: string;
  /** Optional email — only when the student wants email/calendar reminders. */
  email?: string;
  notes?: string;
  /**
   * Permanent PUBLIC booking (no token): the visitor is identified purely by the
   * details below. When set, name + phone are required and the student is matched
   * by phone (or created).
   */
  open?: boolean;
  // ── Visitor-supplied details. Required (name + phone) for a public/open
  //    booking or a blank invite placeholder. ──
  name?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
}

export type BookResult =
  | { ok: true; lessonId: string }
  | {
      ok: false;
      error: 'invalid_input' | 'invalid_token' | 'slot_taken' | 'internal';
      message: string;
    };

/**
 * Race guard: after the slot passed isSlotBookable, re-check for a real
 * overlapping pending/confirmed lesson (empty group sessions excluded) before
 * inserting. A force-opened slot is a deliberate override → not a conflict, so a
 * booking there is allowed (a double-book Ilanit explicitly enabled).
 */
async function hasConflict(startISO: string, endISO: string): Promise<boolean> {
  if (await isSlotForceOpen(startISO, endISO)) return false;
  const overlaps = await overlappingLessons(startISO, endISO);
  return overlaps.length > 0;
}

/**
 * Performs the booking. Returns a typed result; never throws for expected
 * conditions (bad input, invalid token, taken slot). Notifications failing do
 * not fail the booking — the lesson is already persisted and visible in the
 * dashboard.
 */
export async function bookLesson(req: BookRequest): Promise<BookResult> {
  const start = new Date(req.startISO);
  const end = new Date(req.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'invalid_input', message: 'invalid slot times' };
  }

  const email = req.email?.trim() ? req.email.trim() : undefined;

  // 1) Identify the student. Two entry points:
  //    • personal / invite link → resolve the student from the token;
  //    • permanent PUBLIC link (req.open) → no token; the student is identified
  //      purely from the details the visitor fills in below.
  let student: Student | null = null;
  if (!req.open) {
    const token = (req.token ?? '').trim();
    if (!token) {
      return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין' };
    }
    const resolved = await resolveBookingLink(token);
    if (!resolved) {
      return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין או שפג תוקפו' };
    }
    student = await getStudent(resolved.studentId);
    if (!student) {
      return { ok: false, error: 'invalid_token', message: 'התלמיד לא נמצא' };
    }
  }

  // 1b) When there is no student yet (public link) or the student is a blank
  // invite placeholder (no phone), the visitor supplies their own details. Match
  // an existing student by phone, else fill the placeholder, else create one.
  if (!student || !student.phone) {
    const name = req.name?.trim();
    const phoneRaw = req.phone?.trim();
    if (!name) {
      return { ok: false, error: 'invalid_input', message: 'יש להזין שם מלא' };
    }
    if (!phoneRaw) {
      return { ok: false, error: 'invalid_input', message: 'יש להזין מספר טלפון' };
    }
    let phone: string;
    try {
      phone = normalizePhoneIL(phoneRaw);
    } catch {
      return { ok: false, error: 'invalid_input', message: 'מספר טלפון לא תקין' };
    }
    let guardianPhone: string | null = null;
    if (req.guardianPhone?.trim()) {
      try {
        guardianPhone = normalizePhoneIL(req.guardianPhone.trim());
      } catch {
        return { ok: false, error: 'invalid_input', message: 'מספר טלפון הורה לא תקין' };
      }
    }
    const guardianName = req.guardianName?.trim() || null;

    try {
      const existing = await findStudentByPhone(phone);
      if (existing) {
        // The phone already belongs to a real student — book under them, filling
        // any blank fields rather than creating a duplicate.
        const patch: Partial<Omit<Student, 'id' | 'createdAt'>> = {};
        if (!existing.name?.trim()) patch.name = name;
        if (guardianName && !existing.guardianName) patch.guardianName = guardianName;
        if (guardianPhone && !existing.guardianPhone) patch.guardianPhone = guardianPhone;
        if (email && !existing.email) patch.email = email;
        student =
          Object.keys(patch).length > 0 ? await updateStudent(existing.id, patch) : existing;
      } else if (student) {
        // Invite placeholder → fill it in.
        student = await updateStudent(student.id, {
          name,
          phone,
          guardianName,
          guardianPhone,
          ...(email ? { email } : {}),
        });
      } else {
        // Public link, brand-new person → create the student.
        student = await createStudent({
          name,
          phone,
          guardianName,
          guardianPhone,
          ...(email ? { email } : {}),
        });
      }
    } catch (err) {
      console.error('[booking] failed to save booking details:', err);
      return { ok: false, error: 'internal', message: 'שגיאה בשמירת הפרטים' };
    }
  }

  if (!student) {
    return { ok: false, error: 'internal', message: 'שגיאה בזיהוי התלמיד' };
  }

  // 2) re-check the slot (template + exceptions + freeBusy + lead-time + past)
  const bookable = await isSlotBookable(req.startISO, req.endISO);
  if (!bookable) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי' };
  }
  // 3) final conflict guard against a concurrent booking
  if (await hasConflict(req.startISO, req.endISO)) {
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
  const datetime = formatILDateTime(start);

  // 5) Insert the Google Calendar event FIRST — a confirmed lesson must be backed
  //    by a real calendar entry (Ilanit's source of truth). If this fails the
  //    booking fails rather than leaving a confirmed lesson off her calendar.
  let googleEventId: string;
  try {
    const event = await insertEvent({
      summary: `שיעור – ${student.name}`,
      startISO: req.startISO,
      endISO: req.endISO,
      location: location || undefined,
      attendeeEmail: student.email ?? undefined,
      description: req.notes?.trim() || undefined,
      extendedPrivate: { type: 'individual', student_id: student.id },
    });
    googleEventId = event.id;
  } catch (err) {
    console.error('[booking] calendar insert failed:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בהוספה ליומן Google' };
  }

  // 6) Create the CONFIRMED lesson (no approval step) with price + location snapshot.
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
        status: 'confirmed',
        needsMatch: false,
        price,
        location,
        googleEventId,
        confirmedAt: new Date(),
        bookedByName: student.name,
        bookedByPhone: student.phone,
        notes: req.notes?.trim() || null,
      })
      .returning();
    lesson = inserted[0];
  } catch (err) {
    console.error('[booking] failed to create lesson:', err);
    // Don't strand the calendar event we just created.
    try {
      await cancelEvent(googleEventId);
    } catch {
      /* best-effort cleanup */
    }
    return { ok: false, error: 'internal', message: 'שגיאה ביצירת השיעור' };
  }

  // 7) Notify (best-effort; a persisted lesson is never lost on notify failure):
  //    Ilanit that a lesson was scheduled, and the student a confirmation with an
  //    add-to-calendar link + a cancel link.
  try {
    await notify(
      'booking_scheduled_ilanit',
      env().ILANIT_PHONE,
      {
        studentName: student.name,
        phone: student.phone ?? '',
        datetime,
        price: price ?? 0,
        notes: req.notes?.trim() ?? '',
      },
      `scheduled-ilanit:${lesson.id}`,
      lesson.id,
    );

    const cancelUrl = await createCancelUrl(lesson.id);
    await notifyStudent(
      student,
      'booking_approved_student',
      {
        studentName: student.name,
        datetime,
        location: location ?? '',
        calendarUrl: addToCalendarUrl({ title: 'שיעור עם אילנית', start, end, location }),
        cancelUrl,
      },
      `approved:${lesson.id}`,
      lesson.id,
    );
  } catch (err) {
    console.error('[booking] notification step failed (lesson kept):', err);
  }

  return { ok: true, lessonId: lesson.id };
}
