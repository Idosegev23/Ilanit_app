import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { lessons, studentAliases, actionTokens, type Lesson } from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { consumeActionToken } from '@/lib/tokens';
import { getStudent } from '@/lib/students';

// Assign service used by /m/[token] + /api/assign. Sets the student on a
// needs_match lesson (imported from the calendar but unidentified) and
// remembers the mapping in student_aliases so future imports auto-match by the
// event's email or title. The db is mocked in tests.

export type AssignResult =
  | { ok: true; lessonId: string; studentId: string }
  | { ok: false; error: 'invalid_token' | 'wrong_state' | 'unknown_student' | 'internal'; message: string };

export interface AssignInput {
  /** the assign_student action token from the link */
  token: string;
  /** student selected by Ilanit on the /m page */
  studentId: string;
  /**
   * Optional alias to remember for future auto-matching: the event's invitee
   * email or its title text. Stored on the chosen student.
   */
  alias?: { type: 'email' | 'title'; value: string };
}

/** Loads a lesson by id (returns the row or null). */
async function loadLesson(lessonId: string): Promise<Lesson | null> {
  const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  return rows[0] ?? null;
}

export interface AssignTokenView {
  lessonId: string;
  startISO: string;
  endISO: string;
  title: string | null;
  needsMatch: boolean;
}

/**
 * Read-only peek (does NOT consume the token) used to render /m/[token]. Returns
 * null when the token is unknown, expired, used, or of the wrong type.
 */
export async function peekAssignToken(rawToken: string): Promise<AssignTokenView | null> {
  if (!rawToken) return null;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await db
    .select({ lessonId: actionTokens.lessonId })
    .from(actionTokens)
    .where(
      and(
        eq(actionTokens.tokenHash, tokenHash),
        eq(actionTokens.type, 'assign_student'),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].lessonId) return null;

  const lesson = await loadLesson(rows[0].lessonId);
  if (!lesson) return null;
  return {
    lessonId: lesson.id,
    startISO: lesson.startsAt.toISOString(),
    endISO: lesson.endsAt.toISOString(),
    title: lesson.notes ?? lesson.bookedByName ?? null,
    needsMatch: lesson.needsMatch,
  };
}

/** Inserts an alias only if the same (student, type, value) is not present. */
async function rememberAlias(
  studentId: string,
  alias: { type: 'email' | 'title'; value: string },
): Promise<void> {
  const value = alias.value.trim();
  if (!value) return;
  const existing = await db
    .select({ id: studentAliases.id })
    .from(studentAliases)
    .where(
      and(
        eq(studentAliases.studentId, studentId),
        eq(studentAliases.aliasType, alias.type),
        eq(studentAliases.value, value),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(studentAliases).values({ studentId, aliasType: alias.type, value });
}

/**
 * Consumes an assign_student token and binds the chosen student to the lesson,
 * clearing needs_match and snapshotting the student's price if the lesson had
 * none. Remembers an alias for future auto-matching when one is supplied.
 */
export async function assignStudent(input: AssignInput): Promise<AssignResult> {
  const consumed = await consumeActionToken(input.token);
  if (!consumed || consumed.type !== 'assign_student' || !consumed.lessonId) {
    return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין או שכבר נוצל' };
  }

  if (!input.studentId) {
    return { ok: false, error: 'unknown_student', message: 'יש לבחור תלמיד/ה' };
  }
  const student = await getStudent(input.studentId);
  if (!student) {
    return { ok: false, error: 'unknown_student', message: 'התלמיד/ה לא נמצא/ה' };
  }

  const lesson = await loadLesson(consumed.lessonId);
  if (!lesson) {
    return { ok: false, error: 'invalid_token', message: 'השיעור לא נמצא' };
  }
  if (!lesson.needsMatch) {
    return { ok: false, error: 'wrong_state', message: 'השיעור כבר שויך' };
  }

  try {
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
  } catch (err) {
    console.error('[assign] failed to update lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בשיוך השיעור' };
  }

  if (input.alias) {
    try {
      await rememberAlias(student.id, input.alias);
    } catch (err) {
      console.error('[assign] failed to remember alias (lesson still assigned):', err);
    }
  }

  return { ok: true, lessonId: lesson.id, studentId: student.id };
}
