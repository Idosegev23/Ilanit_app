'use server';

// Server actions for the /lessons management screen. All actions run inside
// Ilanit's authenticated area (middleware-protected) and revalidate the page.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { lessons, type Student, type Lesson } from '@/db/schema';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import {
  getStudent,
  findStudentsByContactPhone,
  findStudentsByNormalizedName,
  createStudent,
  findOrCreateStudentByName,
} from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { rescheduleLesson } from '@/lib/lessons/reschedule';
import { nowIL, parseILDateTime, formatILDateTime, toILDateStr, toILTimeStr } from '@/lib/time';
import { normalizePhoneIL } from '@/lib/utils';
import { env } from '@/lib/env';
import { insertEvent, getEvent } from '@/lib/google-calendar';
import { cancelOne, createSeries } from '@/lib/recurrence';
import { parseLessonTitle } from '@/lib/ai/parse-lesson';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { scheduleStudentLesson } from '@/app/students/actions';
import { offerFreedSlot } from '@/lib/standby';
import { addToCalendarUrl } from '@/lib/calendar-link';
import { createCancelUrl } from '@/lib/availability/cancel';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** True when the request is the authenticated owner (Ilanit). */
async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

/**
 * Approves a pending lesson: inserts the Google Calendar event (with the
 * student as attendee when an email exists) and marks the lesson confirmed.
 */
export async function approveLesson(lessonId: string): Promise<ActionResult> {
  try {
    const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = rows[0];
    if (!lesson) return { ok: false, error: 'שיעור לא נמצא' };
    if (lesson.status !== 'pending') {
      return { ok: false, error: 'ניתן לאשר רק שיעור שממתין לאישור' };
    }

    let attendeeEmail: string | undefined;
    let studentName = lesson.bookedByName ?? '';
    let student: Student | null = null;
    if (lesson.studentId) {
      student = await getStudent(lesson.studentId);
      if (student) {
        attendeeEmail = student.email ?? undefined;
        studentName = student.name;
      }
    }

    const summary =
      lesson.type === 'group_session' ? 'מפגש קבוצה' : `שיעור – ${studentName || 'תלמיד'}`;

    const evt = await insertEvent({
      summary,
      startISO: lesson.startsAt.toISOString(),
      endISO: lesson.endsAt.toISOString(),
      location: lesson.location ?? undefined,
      attendeeEmail,
      extendedPrivate: {
        type: lesson.type === 'group_session' ? 'group' : 'individual',
        ...(lesson.studentId ? { studentId: lesson.studentId } : {}),
        ...(lesson.groupId ? { groupId: lesson.groupId } : {}),
      },
    });

    await db
      .update(lessons)
      .set({ status: 'confirmed', confirmedAt: nowIL(), googleEventId: evt.id })
      .where(eq(lessons.id, lessonId));

    // Confirm to the recipient (the parent when a guardian phone is set) that the
    // lesson was approved. Group sessions have no studentId → no message here.
    if (student) {
      try {
        await notifyStudent(student, 'booking_approved_student', {
          studentName: student.name,
          datetime: formatILDateTime(lesson.startsAt),
          location: lesson.location ?? '',
          calendarUrl: addToCalendarUrl({
            title: 'שיעור עם אילנית',
            start: lesson.startsAt,
            end: lesson.endsAt,
            location: lesson.location,
          }),
          cancelUrl: await createCancelUrl(lesson.id),
        });
      } catch (err) {
        console.error('[lessons] approve confirmation failed:', err);
      }
    }

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה באישור השיעור' };
  }
}

/** Rejects a pending lesson (frees the slot). */
export async function rejectLesson(lessonId: string): Promise<ActionResult> {
  try {
    const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = rows[0];
    if (!lesson) return { ok: false, error: 'שיעור לא נמצא' };
    if (lesson.status !== 'pending') {
      return { ok: false, error: 'ניתן לדחות רק שיעור שממתין לאישור' };
    }

    await db.update(lessons).set({ status: 'rejected' }).where(eq(lessons.id, lessonId));

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בדחיית השיעור' };
  }
}

/** Cancels a single lesson (and removes its standalone Google event). */
export async function cancelLesson(lessonId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ startsAt: lessons.startsAt, endsAt: lessons.endsAt })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    await cancelOne(lessonId);
    // The slot is now free — alert the waitlist if anyone matches it.
    if (rows[0]) await offerFreedSlot(rows[0].startsAt, rows[0].endsAt);
    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בביטול השיעור' };
  }
}

export interface ReplaceLessonInput {
  originalLessonId: string;
  /** Pick an existing student … */
  studentId?: string;
  /** … or add a new one (name + phone) inline. */
  newStudentName?: string;
  newStudentPhone?: string;
  /** Optional ₪ override; defaults to the new student's price. */
  price?: number | null;
}

/**
 * Replaces a lesson: schedules a DIFFERENT student on the SAME slot, then cancels
 * the original (removing its Google event) and messages the original student that
 * it was cancelled. The replacement is created FIRST — if that fails the original
 * is left intact, so a slot is never emptied by a failed replacement.
 */
export async function replaceLesson(input: ReplaceLessonInput): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!input.originalLessonId) return { ok: false, error: 'מזהה שיעור חסר' };

  // 1) Load the original; only an active (pending/confirmed) lesson can be replaced.
  const rows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, input.originalLessonId))
    .limit(1);
  const original = rows[0];
  if (!original) return { ok: false, error: 'השיעור המקורי לא נמצא' };
  if (original.status !== 'pending' && original.status !== 'confirmed') {
    return { ok: false, error: 'לא ניתן להחליף שיעור שאינו פעיל' };
  }

  // 2) Resolve the replacement student — existing pick or new name+phone.
  let student: Student | null;
  if (input.studentId) {
    student = await getStudent(input.studentId);
    if (!student) return { ok: false, error: 'התלמיד/ה שנבחר/ה לא נמצא/ה' };
  } else {
    const name = (input.newStudentName ?? '').trim();
    const phoneRaw = (input.newStudentPhone ?? '').trim();
    if (!name) return { ok: false, error: 'יש להזין שם תלמיד/ה' };
    if (!phoneRaw) return { ok: false, error: 'יש להזין טלפון' };
    const phone = normalizePhoneIL(phoneRaw);
    // Same guard as createManualLesson: never mint a student as a side effect
    // of scheduling. A replacement is almost always someone already on the
    // roster, and the old fallback turned a mistyped digit into a duplicate.
    const byPhone = await findStudentsByContactPhone(phone);
    if (byPhone.length > 1) {
      return {
        ok: false,
        error: `המספר הזה רשום אצל ${byPhone.map((s) => s.name).join(', ')} — בחרי תלמיד/ה מהרשימה`,
      };
    }
    if (byPhone.length === 1) {
      student = byPhone[0];
    } else {
      const byName = await findStudentsByNormalizedName(name);
      if (byName.length > 0) {
        return {
          ok: false,
          error: `כבר קיים/ת תלמיד/ה בשם "${byName[0].name}" — בחרי מהרשימה במקום ליצור חדש/ה`,
        };
      }
      student = await createStudent({ name, phone });
    }
  }

  if (student.id === original.studentId) {
    return { ok: false, error: 'התלמיד/ה זהה למקורי — לא נדרש שינוי' };
  }

  // 3) Schedule the replacement on the original's slot (same start + duration).
  //    Reuses scheduleStudentLesson → confirmed lesson + Google event + the new
  //    student's WhatsApp confirmation.
  const minutes = Math.max(
    1,
    Math.round((original.endsAt.getTime() - original.startsAt.getTime()) / 60000),
  );
  const fd = new FormData();
  fd.set('studentId', student.id);
  fd.set('date', toILDateStr(original.startsAt));
  fd.set('time', toILTimeStr(original.startsAt));
  fd.set('durationMin', String(minutes));
  if (input.price !== undefined && input.price !== null) fd.set('price', String(input.price));

  const scheduled = await scheduleStudentLesson(fd);
  if (!scheduled.ok) {
    return { ok: false, error: scheduled.error ?? 'שגיאה בקביעת השיעור החדש' };
  }

  // 4) Replacement is booked — cancel the original + notify its student. Best-effort
  //    from here: a hiccup must not undo the already-scheduled replacement.
  try {
    await cancelOne(original.id);
  } catch (err) {
    console.error('[replace] failed to cancel original lesson:', err);
    return {
      ok: false,
      error: 'השיעור החדש נקבע, אך ביטול המקורי נכשל — יש לבטלו ידנית.',
    };
  }

  try {
    await notifyOriginalReplaced(original);
  } catch (err) {
    console.error('[replace] failed to notify original student:', err);
  }

  revalidatePath('/lessons');
  return { ok: true };
}

/** Messages the original student that their lesson was cancelled, with the booking link. */
async function notifyOriginalReplaced(original: Lesson): Promise<void> {
  const bookingUrl = `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/book`;
  const student = original.studentId ? await getStudent(original.studentId) : null;
  const vars = {
    studentName: student?.name ?? original.bookedByName ?? '',
    datetime: formatILDateTime(original.startsAt),
    bookingUrl,
  };
  const relatedId = `replaced:${original.id}`;
  if (student) {
    await notifyStudent(student, 'lesson_replaced_student', vars, relatedId, original.id);
  } else if (original.bookedByPhone) {
    await notify('lesson_replaced_student', original.bookedByPhone, vars, relatedId, original.id);
  }
}

/**
 * Marks a lesson as NOT a teaching lesson. Owner-only. Used for calendar-imported
 * / needs-match rows that aren't real lessons (personal events, mis-imports): the
 * data is kept, but the row stops holding a slot. Sets `status='cancelled'` and
 * clears `needsMatch`, so it (a) no longer appears as "ממתין לשיוך", and (b) is
 * excluded from availability — `lib/availability` busyIntervals only counts
 * status in ['pending','confirmed'], so a cancelled lesson never blocks booking.
 * No Google event is touched: imports either have no standalone event we own, and
 * leaving the calendar entry as-is matches the existing AI "not-a-lesson" path.
 */
export async function markLessonNotALesson(lessonId: string): Promise<ActionResult> {
  try {
    if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
    if (!lessonId) return { ok: false, error: 'חסר מזהה שיעור' };

    const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = rows[0];
    if (!lesson) return { ok: false, error: 'שיעור לא נמצא' };

    await db
      .update(lessons)
      .set({
        status: 'cancelled',
        needsMatch: false,
        cancelledAt: nowIL(),
        cancelReason: 'not_a_lesson',
      })
      .where(eq(lessons.id, lessonId));

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שגיאה בסימון "לא שיעור"',
    };
  }
}

/**
 * Creates a single lesson manually.
 *
 * Student resolution is deliberately strict. This action used to take a typed
 * name + phone and do `findStudentByPhone(phone) ?? createStudent(...)`, which
 * meant one mistyped digit silently minted a second record for someone who
 * already existed — the origin of the duplicate students cleaned up on 17/08.
 *
 * Now there are two explicit paths:
 *   • `studentId` — picked from the roster. The normal case, and it cannot
 *     create anything.
 *   • `createNew=1` + name/phone — a deliberate act, refused if the phone OR
 *     the name already belongs to an active student.
 *
 * There is no path left that creates a student as a side effect.
 */
/**
 * Moves a lesson to a new date/time, optionally asking the parent to confirm.
 *
 * Separate from replaceLesson (which swaps WHO the lesson is for): this keeps
 * the same student and changes only WHEN, so the payment, the calendar entry
 * and the conversation all survive the change.
 */
export async function rescheduleLessonAction(input: {
  lessonId: string;
  date: string;
  time: string;
  durationMin: number;
  notifyParent: boolean;
  note?: string;
}): Promise<ActionResult & { notified?: boolean }> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!input.date || !input.time) return { ok: false, error: 'יש לבחור תאריך ושעה' };

  const startsAt = parseILDateTime(input.date, input.time);
  const res = await rescheduleLesson({
    lessonId: input.lessonId,
    startsAt,
    durationMin: input.durationMin,
    notifyParent: input.notifyParent,
    note: input.note,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath('/lessons');
  revalidatePath('/dashboard');
  return { ok: true, notified: res.notified };
}

export async function createManualLesson(formData: FormData): Promise<ActionResult> {
  try {
    const studentId = String(formData.get('studentId') ?? '').trim();
    const createNew = String(formData.get('createNew') ?? '') === '1';
    const name = String(formData.get('name') ?? '').trim();
    const phoneRaw = String(formData.get('phone') ?? '').trim();
    const dateStr = String(formData.get('date') ?? '').trim();
    const timeStr = String(formData.get('time') ?? '').trim();
    const durationRaw = String(formData.get('durationMin') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();

    if (!studentId && !createNew) return { ok: false, error: 'יש לבחור תלמיד/ה מהרשימה' };
    if (createNew) {
      if (!name) return { ok: false, error: 'יש להזין שם תלמיד' };
      if (!phoneRaw) return { ok: false, error: 'יש להזין טלפון' };
    }
    if (!dateStr) return { ok: false, error: 'יש לבחור תאריך' };
    if (!timeStr) return { ok: false, error: 'יש לבחור שעה' };

    const phone = createNew ? normalizePhoneIL(phoneRaw) : '';
    const settings = await getSettings();
    const durationMin = durationRaw ? Number(durationRaw) : settings.defaultDurationMin;
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return { ok: false, error: 'משך שיעור לא תקין' };
    }

    const startsAt = parseILDateTime(dateStr, timeStr);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

    let student: Student | null;
    if (studentId) {
      student = await getStudent(studentId);
      if (!student) return { ok: false, error: 'התלמיד/ה שנבחר/ה לא נמצא/ה' };
    } else {
      // Explicit creation — but only after proving nobody matches. Both checks
      // matter: the phone catches the same person re-entered exactly, the name
      // catches them re-entered with a typo in the number, which is the case a
      // phone check alone would wave through.
      const byPhone = await findStudentsByContactPhone(phone);
      if (byPhone.length > 0) {
        return {
          ok: false,
          error: `המספר הזה כבר רשום אצל ${byPhone.map((s) => s.name).join(', ')} — בחרי מהרשימה במקום ליצור חדש/ה`,
        };
      }
      const byName = await findStudentsByNormalizedName(name);
      if (byName.length > 0) {
        return {
          ok: false,
          error: `כבר קיים/ת תלמיד/ה בשם "${byName[0].name}" — בחרי מהרשימה, או שני את השם אם זה באמת מישהו אחר`,
        };
      }
      student = await createStudent({ name, phone });
    }

    const price = priceRaw ? Number(priceRaw) : (student.defaultPrice ?? null);
    // Money is integer shekels (no agorot/decimals); enforce on the server, not
    // just via the client-side step={1} input.
    if (price !== null && (!Number.isInteger(price) || price < 0)) {
      return { ok: false, error: 'מחיר חייב להיות מספר שלם של שקלים (0 ומעלה)' };
    }

    const location = settings.locationAddress || null;

    const inserted = await db
      .insert(lessons)
      .values({
        type: 'individual',
        source: 'manual',
        studentId: student.id,
        startsAt,
        endsAt,
        status: 'confirmed',
        needsMatch: false,
        price,
        location,
        bookedByName: name,
        bookedByPhone: phone,
        notes: notes || null,
        confirmedAt: nowIL(),
      })
      .returning();
    const lesson = inserted[0];

    const evt = await insertEvent({
      summary: `שיעור – ${student.name}`,
      startISO: startsAt.toISOString(),
      endISO: endsAt.toISOString(),
      location: location ?? undefined,
      attendeeEmail: student.email ?? undefined,
      extendedPrivate: { type: 'individual', studentId: student.id },
    });

    await db
      .update(lessons)
      .set({ googleEventId: evt.id })
      .where(eq(lessons.id, lesson.id));

    // Confirm to the student (parent when a guardian phone is set) that Ilanit
    // scheduled the lesson — same as the student-card scheduler. Only for a
    // FUTURE lesson: a retro walk-in (past date) is a record, not an invite, and
    // must stay silent. The day-before reminder cron then covers the reminder.
    if (startsAt.getTime() > nowIL().getTime()) {
      try {
        await notifyStudent(student, 'booking_approved_student', {
          studentName: student.name,
          datetime: formatILDateTime(startsAt),
          location: location ?? '',
          calendarUrl: addToCalendarUrl({
            title: 'שיעור עם אילנית',
            start: startsAt,
            end: endsAt,
            location,
          }),
          cancelUrl: await createCancelUrl(lesson.id),
        });
      } catch (err) {
        console.error('[manual] schedule confirmation failed (lesson kept):', err);
      }
    }

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה ביצירת השיעור' };
  }
}

/**
 * Creates a weekly recurring series (individual or group) via lib/recurrence.
 */
export async function createRecurringSeries(formData: FormData): Promise<ActionResult> {
  try {
    const kind = String(formData.get('kind') ?? 'individual') as 'individual' | 'group';
    const studentId = String(formData.get('studentId') ?? '').trim();
    const groupId = String(formData.get('groupId') ?? '').trim();
    const weekday = Number(formData.get('weekday'));
    const startTime = String(formData.get('startTime') ?? '').trim();
    const durationRaw = String(formData.get('durationMin') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const horizonRaw = String(formData.get('horizonDays') ?? '').trim();

    if (kind === 'individual' && !studentId) {
      return { ok: false, error: 'יש לבחור תלמיד' };
    }
    if (kind === 'group' && !groupId) {
      return { ok: false, error: 'יש לבחור קבוצה' };
    }
    if (!startTime) return { ok: false, error: 'יש לבחור שעת התחלה' };

    const settings = await getSettings();
    const durationMin = durationRaw ? Number(durationRaw) : settings.defaultDurationMin;
    const horizonDays = horizonRaw ? Number(horizonRaw) : settings.bookingHorizonDays;
    const price = priceRaw ? Number(priceRaw) : undefined;
    // Money is integer shekels (no agorot/decimals); enforce on the server, not
    // just via the client-side step={1} input.
    if (price !== undefined && (!Number.isInteger(price) || price < 0)) {
      return { ok: false, error: 'מחיר חייב להיות מספר שלם של שקלים (0 ומעלה)' };
    }

    const res = await createSeries({
      kind,
      studentId: kind === 'individual' ? studentId : undefined,
      groupId: kind === 'group' ? groupId : undefined,
      weekday,
      startTime,
      durationMin,
      price,
      horizonDays,
    });

    revalidatePath('/lessons');
    return { ok: true, error: res.count === 0 ? 'לא נוצרו שיעורים בטווח שנבחר' : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה ביצירת הסדרה' };
  }
}

/**
 * In-app assign for a needs_match (calendar-imported) lesson. Owner-only. Binds
 * the chosen student, clears needs_match, and snapshots the student's default
 * price when the lesson had none — mirroring lib/availability/assign but driven
 * from the /lessons screen rather than a single-use token link.
 */
export async function assignStudentToLesson(
  lessonId: string,
  studentId: string,
): Promise<ActionResult> {
  try {
    if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
    if (!lessonId) return { ok: false, error: 'חסר מזהה שיעור' };
    if (!studentId) return { ok: false, error: 'יש לבחור תלמיד/ה' };

    const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = rows[0];
    if (!lesson) return { ok: false, error: 'שיעור לא נמצא' };
    if (!lesson.needsMatch) return { ok: false, error: 'השיעור כבר שויך' };

    const student = await getStudent(studentId);
    if (!student) return { ok: false, error: 'התלמיד/ה לא נמצא/ה' };

    await db
      .update(lessons)
      .set({
        studentId: student.id,
        needsMatch: false,
        // snapshot the student's default price only if the lesson had none
        ...(lesson.price == null && student.defaultPrice != null
          ? { price: student.defaultPrice }
          : {}),
      })
      .where(eq(lessons.id, lesson.id));

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בשיוך השיעור' };
  }
}

/**
 * Creates (or reuses, by normalized name) a student from a title/parsed name and
 * binds a needs_match calendar-imported lesson to them. Owner-only. Powers the
 * "צור ושייך" affordance in the single-lesson assign dialog when no existing
 * student matches the title. Snapshots the price like assignStudentToLesson.
 */
export async function createAndAssignStudentToLesson(
  lessonId: string,
  name: string,
): Promise<ActionResult> {
  try {
    if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
    if (!lessonId) return { ok: false, error: 'חסר מזהה שיעור' };
    const cleaned = name.trim();
    if (!cleaned) return { ok: false, error: 'יש להזין שם תלמיד/ה' };

    const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = rows[0];
    if (!lesson) return { ok: false, error: 'שיעור לא נמצא' };
    if (!lesson.needsMatch) return { ok: false, error: 'השיעור כבר שויך' };

    const settings = await getSettings();
    const { student } = await findOrCreateStudentByName(cleaned);
    const snapshotPrice =
      lesson.price == null ? (student.defaultPrice ?? settings.defaultPrivatePrice ?? null) : null;

    await db
      .update(lessons)
      .set({
        studentId: student.id,
        needsMatch: false,
        ...(snapshotPrice != null ? { price: snapshotPrice } : {}),
      })
      .where(eq(lessons.id, lesson.id));

    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שגיאה ביצירת ושיוך התלמיד/ה',
    };
  }
}

export interface BackfillResult extends ActionResult {
  updated?: number;
  scanned?: number;
}

/**
 * Backfills titles for already-imported calendar lessons. Owner-only. For every
 * `calendar_import` lesson that has a googleEventId but no bookedByName, fetches
 * the event and writes its summary into bookedByName/notes. Idempotent: titled
 * lessons are filtered out at the query, and events that no longer exist (or
 * have no title) are skipped.
 */
export async function backfillImportedTitles(): Promise<BackfillResult> {
  try {
    if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

    const rows = await db
      .select({ id: lessons.id, googleEventId: lessons.googleEventId })
      .from(lessons)
      .where(
        and(
          eq(lessons.source, 'calendar_import'),
          isNotNull(lessons.googleEventId),
          isNull(lessons.bookedByName),
        ),
      );

    let updated = 0;
    for (const row of rows) {
      if (!row.googleEventId) continue;
      const event = await getEvent(row.googleEventId);
      const title = event?.summary?.trim();
      if (!title) continue; // event gone or untitled — leave as-is
      await db
        .update(lessons)
        .set({ bookedByName: title, notes: title })
        .where(eq(lessons.id, row.id));
      updated++;
    }

    revalidatePath('/lessons');
    return { ok: true, updated, scanned: rows.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שגיאה ברענון הכותרות',
    };
  }
}

export interface AiResolveResult extends ActionResult {
  /** Lessons bound to a student. */
  assigned?: number;
  /** New students auto-created from a parsed title. */
  createdStudents?: number;
  /** Imports detected as personal/Preply and cancelled (not lessons). */
  skippedNonLesson?: number;
  /** Titles that failed to parse/assign (the batch continues regardless). */
  errors?: number;
}

/** Small concurrency cap so the OpenAI rate limit isn't hammered. */
const AI_RESOLVE_CONCURRENCY = 3;

/**
 * AI auto-resolution of calendar-imported lessons. Owner-only. For every
 * `needs_match` `calendar_import` lesson that has a title (bookedByName) and no
 * studentId yet:
 *   - "preply" title → treat as not-a-lesson → cancel.
 *   - else parse the title with OpenAI. isLesson===false → cancel.
 *   - isLesson with a studentName → find-or-create the student by normalized
 *     name (receiptLabel = subject when present), bind the lesson (studentId,
 *     clear needs_match), snapshot the price from student.defaultPrice ??
 *     settings.defaultPrivatePrice when the lesson price is null, and set
 *     notes = subject.
 * Each lesson is wrapped in try/catch so one failure never aborts the batch.
 * Idempotent: cancelled / already-assigned lessons fall out of the query.
 */
export async function aiResolveImports(): Promise<AiResolveResult> {
  try {
    if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

    const pending = await db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.source, 'calendar_import'),
          eq(lessons.needsMatch, true),
          isNull(lessons.studentId),
          isNotNull(lessons.bookedByName),
        ),
      );

    const settings = await getSettings();
    const fallbackPrice = settings.defaultPrivatePrice ?? null;

    let assigned = 0;
    let createdStudents = 0;
    let skippedNonLesson = 0;
    let errors = 0;

    async function resolveOne(lesson: (typeof pending)[number]): Promise<void> {
      const title = (lesson.bookedByName ?? '').trim();
      if (!title) return;
      try {
        // Preply events are the family's own — never Ilanit's lesson.
        if (title.toLowerCase().includes('preply')) {
          await db
            .update(lessons)
            .set({ status: 'cancelled', needsMatch: false, cancelledAt: nowIL() })
            .where(eq(lessons.id, lesson.id));
          skippedNonLesson++;
          return;
        }

        const parsed = await parseLessonTitle(title);

        if (!parsed.isLesson || !parsed.studentName) {
          // Personal event (party/errand/conference) or no extractable student.
          await db
            .update(lessons)
            .set({ status: 'cancelled', needsMatch: false, cancelledAt: nowIL() })
            .where(eq(lessons.id, lesson.id));
          skippedNonLesson++;
          return;
        }

        const { student, created } = await findOrCreateStudentByName(
          parsed.studentName,
          parsed.subject,
        );
        if (created) createdStudents++;

        const snapshotPrice =
          lesson.price == null ? (student.defaultPrice ?? fallbackPrice) : lesson.price;

        await db
          .update(lessons)
          .set({
            studentId: student.id,
            needsMatch: false,
            notes: parsed.subject ?? null,
            ...(lesson.price == null && snapshotPrice != null ? { price: snapshotPrice } : {}),
          })
          .where(eq(lessons.id, lesson.id));
        assigned++;
      } catch {
        // One title's failure must not abort the batch.
        errors++;
      }
    }

    // Process in small sequential batches to respect OpenAI rate limits.
    for (let i = 0; i < pending.length; i += AI_RESOLVE_CONCURRENCY) {
      const slice = pending.slice(i, i + AI_RESOLVE_CONCURRENCY);
      await Promise.all(slice.map(resolveOne));
    }

    revalidatePath('/lessons');
    return { ok: true, assigned, createdStudents, skippedNonLesson, errors };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שגיאה בזיהוי האוטומטי',
    };
  }
}
