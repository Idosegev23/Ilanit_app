import { db } from '@/lib/db';
import { lessons, type Lesson, type Student } from '@/db/schema';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import {
  getStudent,
  updateStudent,
  findStudentsByContactPhone,
  createStudent,
} from '@/lib/students';
import { normalizePhoneIL } from '@/lib/utils';
import { resolveBookingLink } from '@/lib/booking-links';
import { isSlotBookable, isSlotForceOpen, overlappingLessons } from '@/lib/availability';
import { insertEvent, cancelEvent } from '@/lib/google-calendar';
import { addToCalendarUrl } from '@/lib/calendar-link';
import { createCancelUrl } from '@/lib/availability/cancel';
import { createActionToken } from '@/lib/tokens';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime, ilHour, ilMinute, nowIL, toILDateStr, toILTimeStr } from '@/lib/time';
import { unforceOpenSlot } from '@/lib/availability/blocks';

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
  /**
   * Disambiguates a phone shared by siblings. Only honoured when it is one of
   * the students actually reachable at `phone` — a caller cannot book under an
   * arbitrary student by guessing an id.
   */
  studentId?: string;
}

/** A student the booking could belong to. Name + id only — no other details. */
export interface StudentChoice {
  id: string;
  name: string;
}

export type BookResult =
  | {
      ok: true;
      lessonId: string;
      /**
       * 'pending' when the slot fell after the approval cutoff — the lesson is
       * NOT booked yet and Ilanit has to approve it.
       */
      status: 'confirmed' | 'pending';
    }
  | {
      ok: false;
      error: 'invalid_input' | 'invalid_token' | 'slot_taken' | 'internal';
      message: string;
    }
  | {
      /**
       * The phone belongs to more than one student (siblings under one parent
       * number). The caller must re-submit with `studentId` set. Nothing has
       * been written at this point.
       */
      ok: false;
      error: 'choose_student';
      message: string;
      candidates: StudentChoice[];
    };

// Approve links stay usable for two weeks — the same horizon the payment and
// assign links use. The lesson holds its slot for that whole time, so this is
// deliberately generous rather than a few hours.
const APPROVE_TTL_MIN = 60 * 24 * 14;

/**
 * Whether a booking MADE at `bookedAt` needs Ilanit's approval.
 *
 * The gate is on when the request is submitted, NOT on when the lesson is: a
 * booking placed at 19:00 for a lesson three weeks away still needs approval,
 * because the point is that Ilanit is off in the evening and does not want
 * lessons confirming themselves while she is not looking. The slot's own time is
 * irrelevant here.
 *
 * `cutoff` is a Postgres `time` — 'HH:MM' or 'HH:MM:SS'. NULL means the gate is
 * off and everything self-confirms. The comparison uses the ISRAEL-LOCAL hour
 * and minute, not UTC: Israel is +2/+3 depending on DST, so comparing UTC hours
 * would silently shift the cutoff by an hour twice a year.
 *
 * "After 18:00" is read as AT or after — a booking made at 18:00 needs approval.
 */
export function requiresApproval(bookedAt: Date, cutoff: string | null): boolean {
  if (!cutoff) return false;
  const [h, m] = cutoff.split(':');
  const cutoffMin = Number(h) * 60 + Number(m ?? 0);
  if (!Number.isFinite(cutoffMin)) return false;
  return ilHour(bookedAt) * 60 + ilMinute(bookedAt) >= cutoffMin;
}

/**
 * Race guard: after the slot passed isSlotBookable, re-check for a real
 * overlapping pending/confirmed lesson (empty group sessions excluded) before
 * inserting. A force-opened slot is a deliberate override → not a conflict, so a
 * booking there is allowed (a double-book Ilanit explicitly enabled).
 */
async function hasConflict(
  startISO: string,
  endISO: string,
  forceOpened: boolean,
): Promise<boolean> {
  if (forceOpened) return false;
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
      // Everyone reachable at this number — the student themselves OR any child
      // whose guardian uses it. Siblings share a parent's phone, so this can
      // legitimately return several people.
      const matches = await findStudentsByContactPhone(phone);

      let existing: Student | null = null;
      if (matches.length > 1) {
        // Ambiguous. Picking one here is what filed a parent's booking under
        // whichever sibling happened to hold the number, so refuse to guess:
        // either the caller already told us who, or they have to.
        const chosen = req.studentId
          ? matches.find((m) => m.id === req.studentId)
          : undefined;
        if (!chosen) {
          return {
            ok: false,
            error: 'choose_student',
            message: 'למי מיועד השיעור?',
            candidates: matches.map((m) => ({ id: m.id, name: m.name })),
          };
        }
        existing = chosen;
      } else {
        existing = matches[0] ?? null;
      }

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
  // 3) final conflict guard against a concurrent booking. A force-opened slot is a
  //    deliberate ONE-SHOT override by Ilanit: it lets exactly ONE booking land on
  //    an already-taken slot, and is consumed below so the slot re-locks.
  const forceOpened = await isSlotForceOpen(req.startISO, req.endISO);
  if (await hasConflict(req.startISO, req.endISO, forceOpened)) {
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

  // 5) Bookings placed in the evening need Ilanit's approval instead of
  //    confirming themselves. This is keyed on NOW — the moment the request is
  //    made — not on when the lesson is: a 19:00 booking for a lesson next month
  //    still waits, because she is off and is not watching the diary.
  const needsApproval = requiresApproval(nowIL(), settings.approvalFromTime);

  // 6) A CONFIRMED lesson must be backed by a real calendar entry (Ilanit's
  //    source of truth), so the event goes in first and a failure fails the
  //    booking rather than leaving a confirmed lesson off her calendar.
  //    A PENDING lesson deliberately gets NO event: decideLesson() creates it on
  //    approval, and writing one here would put an unapproved request on her
  //    calendar and make the slot look taken to her.
  let googleEventId: string | null = null;
  if (!needsApproval) {
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
  }

  // 7) Create the lesson with a price + location snapshot. Pending lessons still
  //    occupy the slot (overlappingLessons counts them), so nobody else can take
  //    it while the request is waiting on Ilanit.
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
        status: needsApproval ? 'pending' : 'confirmed',
        needsMatch: false,
        price,
        location,
        googleEventId,
        confirmedAt: needsApproval ? null : new Date(),
        bookedByName: student.name,
        bookedByPhone: student.phone,
        notes: req.notes?.trim() || null,
      })
      .returning();
    lesson = inserted[0];
  } catch (err) {
    console.error('[booking] failed to create lesson:', err);
    // Don't strand the calendar event we just created. A pending booking never
    // made one, so there is nothing to clean up.
    if (googleEventId) {
      try {
        await cancelEvent(googleEventId);
      } catch {
        /* best-effort cleanup */
      }
    }
    return { ok: false, error: 'internal', message: 'שגיאה ביצירת השיעור' };
  }

  // 8) Notify (best-effort; a persisted lesson is never lost on notify failure).
  try {
    const cancelUrl = await createCancelUrl(lesson.id);

    if (needsApproval) {
      // Ilanit gets a one-click approve/reject link; the student is told the
      // request is waiting, NOT that the lesson is booked.
      const rawToken = await createActionToken('approve', lesson.id, APPROVE_TTL_MIN);
      const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
      await notify(
        'booking_pending_ilanit',
        env().ILANIT_PHONE,
        {
          studentName: student.name,
          phone: student.phone ?? '',
          datetime,
          price: price ?? 0,
          notes: req.notes?.trim() ?? '',
          actionUrl: `${appUrl}/a/${rawToken}`,
        },
        `pending-ilanit:${lesson.id}`,
        lesson.id,
      );
      await notifyStudent(
        student,
        'booking_pending_student',
        { studentName: student.name, datetime, cancelUrl },
        `pending:${lesson.id}`,
        lesson.id,
      );
    } else {
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
      await notifyStudent(
        student,
        'booking_approved_student',
        {
          studentName: student.name,
          datetime,
          location: location ?? '',
          price: price ?? 0,
          calendarUrl: addToCalendarUrl({ title: 'שיעור עם אילנית', start, end, location }),
          cancelUrl,
        },
        `approved:${lesson.id}`,
        lesson.id,
      );
    }
  } catch (err) {
    console.error('[booking] notification step failed (lesson kept):', err);
  }

  // Consume the one-shot force-open: Ilanit opened this already-taken slot for
  // exactly ONE extra booking. Now that it is filled, drop the override so the
  // slot re-locks and nobody else can keep piling onto the same session.
  if (forceOpened) {
    try {
      await unforceOpenSlot(toILDateStr(start), toILTimeStr(start), toILTimeStr(end));
    } catch (err) {
      console.error('[booking] failed to consume force-open (slot stays open):', err);
    }
  }

  return { ok: true, lessonId: lesson.id, status: needsApproval ? 'pending' : 'confirmed' };
}
