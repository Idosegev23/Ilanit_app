import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { lessons, students, actionTokens, type Lesson } from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { consumeActionToken } from '@/lib/tokens';
import { createBookingLink } from '@/lib/booking-links';
import { insertEvent } from '@/lib/google-calendar';
import { notify } from '@/lib/notifications/dispatch';
import { hasSlotConflict } from '@/lib/availability';
import { createCancelUrl } from '@/lib/availability/cancel';
import { formatILDateTime } from '@/lib/time';
import { addToCalendarUrl } from '@/lib/calendar-link';

// Approval service used by /a/[token] + /api/approve. Approving inserts the
// lesson into Google Calendar (inviting the student if they have an email),
// flips the lesson to confirmed, and notifies the student. Rejecting frees the
// slot and sends a re-book link. The Google Calendar client + notifications are
// mocked in tests.

export interface LessonWithStudent {
  lesson: Lesson;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
}

/** Loads a lesson + its student fields (falling back to booked-by snapshot). */
export async function loadLessonForAction(
  lessonId: string,
): Promise<LessonWithStudent | null> {
  const rows = await db
    .select({
      lesson: lessons,
      sName: students.name,
      sPhone: students.phone,
      sGuardianPhone: students.guardianPhone,
      sEmail: students.email,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  // Route to the guardian (parent) phone when present, else the student's own
  // phone, else the booked-by snapshot phone.
  const guardianPhone = r.sGuardianPhone?.trim();
  const studentPhone = guardianPhone || r.sPhone || r.lesson.bookedByPhone || null;
  return {
    lesson: r.lesson,
    studentName: r.sName ?? r.lesson.bookedByName ?? 'תלמיד/ה',
    studentPhone,
    studentEmail: r.sEmail ?? null,
  };
}

export interface ApproveTokenView {
  lessonId: string;
  studentName: string;
  startISO: string;
  endISO: string;
  price: number | null;
  location: string | null;
  notes: string | null;
  status: Lesson['status'];
}

/**
 * Read-only peek (does NOT consume the token) used to render /a/[token] before
 * the teacher decides. Returns null when the token is unknown, expired or used,
 * or of the wrong type.
 */
export async function peekApproveToken(rawToken: string): Promise<ApproveTokenView | null> {
  if (!rawToken) return null;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await db
    .select({ type: actionTokens.type, lessonId: actionTokens.lessonId })
    .from(actionTokens)
    .where(
      and(
        eq(actionTokens.tokenHash, tokenHash),
        eq(actionTokens.type, 'approve'),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].lessonId) return null;

  const data = await loadLessonForAction(rows[0].lessonId);
  if (!data) return null;
  const { lesson } = data;
  return {
    lessonId: lesson.id,
    studentName: data.studentName,
    startISO: lesson.startsAt.toISOString(),
    endISO: lesson.endsAt.toISOString(),
    price: lesson.price ?? null,
    location: lesson.location ?? null,
    notes: lesson.notes ?? null,
    status: lesson.status,
  };
}

export type ApproveResult =
  | { ok: true; action: 'approved' | 'rejected' }
  | { ok: false; error: 'invalid_token' | 'wrong_state' | 'slot_taken' | 'internal'; message: string };

/**
 * Consumes an approve token and applies the decision. Single-use: the token is
 * consumed first, so a double-click returns invalid_token.
 */
export async function decideLesson(
  rawToken: string,
  decision: 'approve' | 'reject',
): Promise<ApproveResult> {
  const consumed = await consumeActionToken(rawToken);
  if (!consumed || consumed.type !== 'approve' || !consumed.lessonId) {
    return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין או שכבר נוצל' };
  }

  const data = await loadLessonForAction(consumed.lessonId);
  if (!data) return { ok: false, error: 'invalid_token', message: 'השיעור לא נמצא' };
  const { lesson } = data;

  if (lesson.status !== 'pending') {
    return { ok: false, error: 'wrong_state', message: 'השיעור כבר טופל' };
  }

  if (decision === 'reject') {
    return rejectLesson(data);
  }
  return approveLesson(data);
}

async function approveLesson(data: LessonWithStudent): Promise<ApproveResult> {
  const { lesson } = data;
  const settings = await getSettings();

  // Re-check for a genuine double-booking at approval time (the calendar may
  // have changed since the student requested the slot). Owner approval is NOT
  // subject to the student-booking soft gates (open-week, lead-time, weekly
  // template) — Ilanit may approve whenever she likes. Crucially we EXCLUDE this
  // pending lesson: it already holds its own slot in busyIntervals, so a plain
  // re-check would always see it as a self-collision and refuse every approval.
  const conflict = await hasSlotConflict(
    lesson.startsAt.toISOString(),
    lesson.endsAt.toISOString(),
    lesson.id,
  );
  if (conflict) {
    return { ok: false, error: 'slot_taken', message: 'המועד כבר אינו פנוי ביומן' };
  }

  const location = lesson.location ?? settings.locationAddress ?? '';
  let googleEventId: string;
  try {
    const event = await insertEvent({
      summary: `שיעור – ${data.studentName}`,
      startISO: lesson.startsAt.toISOString(),
      endISO: lesson.endsAt.toISOString(),
      location: location || undefined,
      attendeeEmail: data.studentEmail ?? undefined,
      description: lesson.notes ?? undefined,
      extendedPrivate: {
        type: 'individual',
        ...(lesson.studentId ? { student_id: lesson.studentId } : {}),
      },
    });
    googleEventId = event.id;
  } catch (err) {
    console.error('[approval] insertEvent failed:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בהוספה ליומן Google' };
  }

  try {
    await db
      .update(lessons)
      .set({ status: 'confirmed', googleEventId, confirmedAt: new Date() })
      .where(eq(lessons.id, lesson.id));
  } catch (err) {
    console.error('[approval] failed to confirm lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בעדכון השיעור' };
  }

  if (data.studentPhone) {
    try {
      const cancelUrl = await createCancelUrl(lesson.id);
      await notify(
        'booking_approved_student',
        data.studentPhone,
        {
          studentName: data.studentName,
          datetime: formatILDateTime(lesson.startsAt),
          location,
          calendarUrl: addToCalendarUrl({
            title: 'שיעור עם אילנית',
            start: lesson.startsAt,
            end: lesson.endsAt,
            location,
          }),
          cancelUrl,
        },
        `approved:${lesson.id}`,
        lesson.id,
      );
    } catch (err) {
      console.error('[approval] approved notification failed:', err);
    }
  }

  return { ok: true, action: 'approved' };
}

async function rejectLesson(data: LessonWithStudent): Promise<ApproveResult> {
  const { lesson } = data;
  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  try {
    await db
      .update(lessons)
      .set({ status: 'rejected', cancelledAt: new Date(), cancelReason: 'rejected_by_teacher' })
      .where(eq(lessons.id, lesson.id));
  } catch (err) {
    console.error('[approval] failed to reject lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בעדכון השיעור' };
  }

  if (data.studentPhone) {
    try {
      // Mint a fresh PERSONAL re-book link tied to the student (the model no
      // longer has a generic public booking page). Fall back to the bare /book
      // info page only when the lesson has no associated student.
      let bookingUrl = `${appUrl}/book`;
      if (lesson.studentId) {
        try {
          const link = await createBookingLink(lesson.studentId);
          bookingUrl = link.url;
        } catch (err) {
          console.error('[approval] re-book link creation failed (using fallback):', err);
        }
      }

      await notify(
        'booking_rejected_student',
        data.studentPhone,
        {
          studentName: data.studentName,
          datetime: formatILDateTime(lesson.startsAt),
          bookingUrl,
        },
        `rejected:${lesson.id}`,
        lesson.id,
      );
    } catch (err) {
      console.error('[approval] rejected notification failed:', err);
    }
  }

  return { ok: true, action: 'rejected' };
}
