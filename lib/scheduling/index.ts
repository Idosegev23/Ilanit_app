import { db } from '@/lib/db';
import { lessons, type Student } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSettings } from '@/lib/settings';
import { insertEvent } from '@/lib/google-calendar';
import { notifyStudent } from '@/lib/notifications/dispatch';
import { addToCalendarUrl } from '@/lib/calendar-link';
import { createCancelUrl } from '@/lib/availability/cancel';
import { formatILDateTime, nowIL } from '@/lib/time';

// Auth-agnostic scheduling core: creates a CONFIRMED individual lesson + its
// Google event and confirms it to the student (future lessons only). The CALLER
// owns authorization — an owner-session action (scheduleStudentLesson) or a
// token-authorized flow (standby approval). Kept out of any 'use server' module
// so both can import it as a plain helper.

export interface PlaceLessonInput {
  student: Student;
  startsAt: Date;
  endsAt: Date;
  source: 'manual' | 'standby';
  /** ₪ override; falls back to the student's / settings default. */
  price?: number | null;
}

export interface PlaceLessonResult {
  ok: boolean;
  lessonId?: string;
  error?: string;
}

export async function placeConfirmedLesson(input: PlaceLessonInput): Promise<PlaceLessonResult> {
  const { student, startsAt, endsAt } = input;
  const settings = await getSettings();
  const location = settings.locationAddress || null;
  const price = input.price ?? student.defaultPrice ?? settings.defaultPrivatePrice ?? null;

  try {
    const inserted = await db
      .insert(lessons)
      .values({
        type: 'individual',
        source: input.source,
        studentId: student.id,
        startsAt,
        endsAt,
        status: 'confirmed',
        needsMatch: false,
        price,
        location,
        bookedByName: student.name,
        bookedByPhone: student.phone,
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
    await db.update(lessons).set({ googleEventId: evt.id }).where(eq(lessons.id, lesson.id));

    // Confirm to the student — future lessons only (a past placement is a record).
    if (startsAt.getTime() > nowIL().getTime()) {
      try {
        await notifyStudent(student, 'booking_approved_student', {
          studentName: student.name,
          datetime: formatILDateTime(startsAt),
          location: location ?? '',
          price: price ?? 0,
          calendarUrl: addToCalendarUrl({
            title: 'שיעור עם אילנית',
            start: startsAt,
            end: endsAt,
            location,
          }),
          cancelUrl: await createCancelUrl(lesson.id),
        });
      } catch (err) {
        console.error('[schedule] confirmation failed (lesson kept):', err);
      }
    }

    return { ok: true, lessonId: lesson.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בקביעת השיעור' };
  }
}
