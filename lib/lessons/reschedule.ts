import { db } from '@/lib/db';
import { lessons, students } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { patchEvent } from '@/lib/google-calendar';
import { notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime } from '@/lib/time';
import { hasSlotConflict } from '@/lib/availability';

/*
  Moving a lesson.

  Ilanit could cancel and rebook, but that loses the thread: the parent gets a
  cancellation and then an unexplained new booking, and the lesson's history —
  its payment row, its calendar event — is torn down and rebuilt. Moving keeps
  one lesson and one conversation.

  The parent is INFORMED, not asked. Ilanit settles any objection with them
  directly, so an accept/decline round-trip would only add a step to a
  conversation she is already having — and leave the lesson in limbo while
  nobody clicks.
*/

export interface RescheduleResult {
  ok: boolean;
  error?: string;
  notified?: boolean;
}

/**
 * Moves a lesson and, optionally, asks the parent to confirm.
 */
export async function rescheduleLesson(input: {
  lessonId: string;
  startsAt: Date;
  durationMin: number;
  notifyParent: boolean;
  note?: string;
}): Promise<RescheduleResult> {
  const lesson = (
    await db.select().from(lessons).where(eq(lessons.id, input.lessonId)).limit(1)
  )[0];
  if (!lesson) return { ok: false, error: 'השיעור לא נמצא' };
  if (lesson.status !== 'confirmed' && lesson.status !== 'pending') {
    return { ok: false, error: 'לא ניתן להזיז שיעור שאינו פעיל' };
  }
  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
    return { ok: false, error: 'משך שיעור לא תקין' };
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMin * 60_000);

  // Excluding THIS lesson: it holds its own slot, so a plain check would see a
  // self-collision and refuse every move.
  if (await hasSlotConflict(input.startsAt.toISOString(), endsAt.toISOString(), lesson.id)) {
    return { ok: false, error: 'יש כבר שיעור אחר במועד הזה' };
  }

  const oldWhen = formatILDateTime(lesson.startsAt);

  try {
    await db
      .update(lessons)
      .set({ startsAt: input.startsAt, endsAt })
      .where(eq(lessons.id, lesson.id));
  } catch (err) {
    console.error('[reschedule] failed to move lesson:', err);
    return { ok: false, error: 'שגיאה בעדכון השיעור' };
  }

  if (lesson.googleEventId) {
    try {
      await patchEvent(lesson.googleEventId, {
        startISO: input.startsAt.toISOString(),
        endISO: endsAt.toISOString(),
      });
    } catch (err) {
      // The lesson has already moved in the diary. A calendar that lags is a
      // smaller problem than reporting a failure for a move that happened.
      console.error('[reschedule] calendar patch failed (lesson moved anyway):', err);
    }
  }

  let notified = false;
  if (input.notifyParent && lesson.studentId) {
    const student = (
      await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
    )[0];
    if (student) {
      try {
        await notifyStudent(
          student,
          'lesson_moved_student',
          {
            studentName: student.name,
            oldWhen,
            newWhen: formatILDateTime(input.startsAt),
            note: input.note?.trim() ?? '',
          },
          // Keyed on the new time, so moving twice asks twice.
          `moved:${lesson.id}:${input.startsAt.getTime()}`,
          lesson.id,
        );
        notified = true;
      } catch (err) {
        console.error('[reschedule] notification failed (lesson moved anyway):', err);
      }
    }
  }

  return { ok: true, notified };
}
