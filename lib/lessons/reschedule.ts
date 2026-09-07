import { db } from '@/lib/db';
import { lessons, recurrences, students } from '@/db/schema';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { patchEvent } from '@/lib/google-calendar';
import { notifyStudent } from '@/lib/notifications/dispatch';
import {
  formatILDateTime,
  ilWeekday,
  nowIL,
  parseILDateTime,
  toILDateStr,
  toILTimeStr,
} from '@/lib/time';
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

/**
 * Which occurrences of a recurring lesson a change applies to.
 *
 * `all` deliberately means every occurrence still AHEAD, not literally every
 * row: a lesson that already happened is a record of what happened, and
 * rewriting its time (or its price) would falsify a diary Ilanit and the
 * parents both rely on. So the choice is really "from here on" versus "the
 * whole series from today", which is the distinction that matters when an
 * earlier occurrence this month should change too.
 */
export type RescheduleScope = 'one' | 'following' | 'all';

export interface RescheduleResult {
  ok: boolean;
  error?: string;
  notified?: boolean;
  /** Occurrences actually moved, including the one she opened. */
  movedCount?: number;
  /** Occurrences left alone because something else already sits there. */
  skippedConflicts?: number;
}

/** Sunday-based start of the IL week containing `at`, as `yyyy-MM-dd`. */
function ilWeekStart(at: Date): string {
  const d = new Date(`${toILDateStr(at)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ilWeekday(at));
  return toILDateStr(d);
}

/** `yyyy-MM-dd` for `weekday` within the IL week that starts on `weekStart`. */
function dateInWeek(weekStart: string, weekday: number): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weekday);
  return toILDateStr(d);
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
  /** Defaults to the single occurrence, which is what a one-off move means. */
  scope?: RescheduleScope;
  /**
   * New ₪ for every occurrence the change touches. Undefined leaves prices
   * alone; this exists because halving a lesson's length without revisiting
   * its price is how a 60-minute lesson keeps billing a 120-minute rate.
   */
  price?: number | null;
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

  const series = await applyToSeries(lesson, input);

  return { ok: true, notified, ...series };
}

/**
 * Extends a move to the rest of a recurring series.
 *
 * The occurrence Ilanit opened has already been moved to exactly what she
 * typed. Every other future occurrence is placed on the new weekday and time
 * WITHIN ITS OWN WEEK, so "Sunday 16:15 becomes Sunday 17:00" leaves each week
 * where it is, and "Sunday becomes Monday" shifts each week's lesson by a day
 * rather than dragging the whole series onto one date.
 *
 * The recurrence row is updated too, so occurrences generated later follow the
 * new pattern instead of quietly reverting to the old one.
 */
async function applyToSeries(
  anchor: typeof lessons.$inferSelect,
  input: {
    startsAt: Date;
    durationMin: number;
    scope?: RescheduleScope;
    price?: number | null;
  },
): Promise<{ movedCount: number; skippedConflicts: number }> {
  const scope = input.scope ?? 'one';
  if (scope === 'one' || !anchor.recurrenceId) {
    // A price given for a single occurrence still applies to that one.
    if (input.price !== undefined) {
      await db
        .update(lessons)
        .set({ price: input.price })
        .where(eq(lessons.id, anchor.id));
    }
    return { movedCount: 1, skippedConflicts: 0 };
  }

  const newTime = toILTimeStr(input.startsAt);
  const newWeekday = ilWeekday(input.startsAt);

  // Never the past: a finished lesson is a record, not a plan.
  const floor = scope === 'following' ? anchor.startsAt : nowIL();
  const siblings = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.recurrenceId, anchor.recurrenceId),
        gte(lessons.startsAt, floor),
        inArray(lessons.status, ['confirmed', 'pending']),
      ),
    );

  let movedCount = 1; // the anchor, already done
  let skippedConflicts = 0;

  for (const occ of siblings) {
    if (occ.id === anchor.id) continue;

    const startsAt = parseILDateTime(
      dateInWeek(ilWeekStart(occ.startsAt), newWeekday),
      newTime,
    );
    const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

    if (
      await hasSlotConflict(startsAt.toISOString(), endsAt.toISOString(), occ.id)
    ) {
      // Somebody else already holds that slot on that week. Leave it and
      // report it — silently dropping it would hide a double-booking.
      skippedConflicts += 1;
      continue;
    }

    await db
      .update(lessons)
      .set({
        startsAt,
        endsAt,
        ...(input.price !== undefined ? { price: input.price } : {}),
      })
      .where(eq(lessons.id, occ.id));

    if (occ.googleEventId) {
      try {
        await patchEvent(occ.googleEventId, {
          startISO: startsAt.toISOString(),
          endISO: endsAt.toISOString(),
        });
      } catch (err) {
        console.error('[reschedule] series calendar patch failed:', err);
      }
    }
    movedCount += 1;
  }

  if (input.price !== undefined) {
    await db.update(lessons).set({ price: input.price }).where(eq(lessons.id, anchor.id));
  }

  await db
    .update(recurrences)
    .set({
      weekday: newWeekday,
      startTime: newTime,
      durationMin: input.durationMin,
      ...(input.price !== undefined ? { price: input.price } : {}),
    })
    .where(eq(recurrences.id, anchor.recurrenceId));

  return { movedCount, skippedConflicts };
}
