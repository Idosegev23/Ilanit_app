import { db } from '@/lib/db';
import { lessons, students, actionTokens } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { patchEvent } from '@/lib/google-calendar';
import { createActionToken, consumeActionToken, hashToken } from '@/lib/tokens';
import { notify, notifyStudent } from '@/lib/notifications/dispatch';
import { formatILDateTime, nowIL } from '@/lib/time';
import { hasSlotConflict } from '@/lib/availability';

/*
  Moving a lesson.

  Ilanit could cancel and rebook, but that loses the thread: the parent gets a
  cancellation and then an unexplained new booking, and the lesson's history —
  its payment row, its calendar event — is torn down and rebuilt. Moving keeps
  one lesson and one conversation.

  The parent is ASKED, not told. They may have arranged the day around the old
  time, so the message carries an accept and a decline: a "no" should come back
  as an answer rather than as an empty chair.
*/

const RESCHEDULE_TTL_MIN = 60 * 24 * 14;

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
        const raw = await createActionToken('reschedule', lesson.id, RESCHEDULE_TTL_MIN);
        await notifyStudent(
          student,
          'lesson_moved_student',
          {
            studentName: student.name,
            oldWhen,
            newWhen: formatILDateTime(input.startsAt),
            note: input.note?.trim() ?? '',
            actionUrl: `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/r/${raw}`,
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

export interface RescheduleView {
  studentName: string;
  newWhen: string;
  location: string | null;
  closed: boolean;
}

/** Resolves a parent's accept/decline link for rendering, without consuming it. */
export async function peekRescheduleToken(rawToken: string): Promise<RescheduleView | null> {
  const row = (
    await db
      .select({ token: actionTokens, lesson: lessons })
      .from(actionTokens)
      .innerJoin(lessons, eq(lessons.id, actionTokens.lessonId))
      .where(
        and(eq(actionTokens.tokenHash, hashToken(rawToken)), eq(actionTokens.type, 'reschedule')),
      )
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    studentName: row.lesson.bookedByName ?? 'תלמיד/ה',
    newWhen: formatILDateTime(row.lesson.startsAt),
    location: row.lesson.location,
    closed:
      row.token.usedAt !== null ||
      row.token.expiresAt < nowIL() ||
      (row.lesson.status !== 'confirmed' && row.lesson.status !== 'pending'),
  };
}

/**
 * Records the parent's answer.
 *
 * A decline does NOT move the lesson back: it stays where Ilanit put it and she
 * is told, because she is the one who knows what else can give. Silently undoing
 * her change would leave the two of them believing different things.
 */
export async function answerReschedule(
  rawToken: string,
  accepted: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const consumed = await consumeActionToken(rawToken);
  if (!consumed || consumed.type !== 'reschedule' || !consumed.lessonId) {
    return { ok: false, error: 'הקישור אינו תקין או שכבר נוצל' };
  }
  const lesson = (
    await db.select().from(lessons).where(eq(lessons.id, consumed.lessonId)).limit(1)
  )[0];
  if (!lesson) return { ok: false, error: 'השיעור לא נמצא' };

  try {
    await notify(
      'lesson_move_reply_ilanit',
      env().ILANIT_PHONE,
      {
        studentName: lesson.bookedByName ?? '',
        decision: accepted ? 'אישר/ה ✅' : 'לא יכול/ה ❌',
        newWhen: formatILDateTime(lesson.startsAt),
      },
      `move-reply:${lesson.id}:${accepted ? 'y' : 'n'}`,
      lesson.id,
    );
  } catch (err) {
    console.error('[reschedule] reply notification failed:', err);
  }
  return { ok: true };
}
