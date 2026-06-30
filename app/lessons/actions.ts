'use server';

// Server actions for the /lessons management screen. All actions run inside
// Ilanit's authenticated area (middleware-protected) and revalidate the page.

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { lessons } from '@/db/schema';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { getStudent, findStudentByPhone, createStudent } from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { nowIL, parseILDateTime } from '@/lib/time';
import { normalizePhoneIL } from '@/lib/utils';
import { insertEvent, getEvent } from '@/lib/google-calendar';
import { cancelOne, createSeries } from '@/lib/recurrence';

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
    if (lesson.studentId) {
      const student = await getStudent(lesson.studentId);
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
    await cancelOne(lessonId);
    revalidatePath('/lessons');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בביטול השיעור' };
  }
}

/**
 * Creates a single lesson manually. Matches/creates the student by phone,
 * snapshots price + location, inserts the Google event, and marks it confirmed.
 */
export async function createManualLesson(formData: FormData): Promise<ActionResult> {
  try {
    const name = String(formData.get('name') ?? '').trim();
    const phoneRaw = String(formData.get('phone') ?? '').trim();
    const dateStr = String(formData.get('date') ?? '').trim();
    const timeStr = String(formData.get('time') ?? '').trim();
    const durationRaw = String(formData.get('durationMin') ?? '').trim();
    const priceRaw = String(formData.get('price') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();

    if (!name) return { ok: false, error: 'יש להזין שם תלמיד' };
    if (!phoneRaw) return { ok: false, error: 'יש להזין טלפון' };
    if (!dateStr) return { ok: false, error: 'יש לבחור תאריך' };
    if (!timeStr) return { ok: false, error: 'יש לבחור שעה' };

    const phone = normalizePhoneIL(phoneRaw);
    const settings = await getSettings();
    const durationMin = durationRaw ? Number(durationRaw) : settings.defaultDurationMin;
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return { ok: false, error: 'משך שיעור לא תקין' };
    }

    const startsAt = parseILDateTime(dateStr, timeStr);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

    let student = await findStudentByPhone(phone);
    if (!student) {
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
