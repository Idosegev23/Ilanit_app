import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { lessons, actionTokens, type Lesson } from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { env } from '@/lib/env';
import { createActionToken, consumeActionToken } from '@/lib/tokens';
import { cancelOne } from '@/lib/recurrence';
import { formatILDateTime } from '@/lib/time';

// Self-service cancel / reschedule, reached from the "לשינוי או ביטול" link in
// the WhatsApp confirmation. A per-lesson 'cancel' action-token backs it. The
// student cancels the lesson (freeing the slot + removing the standalone Google
// event) and is then shown the permanent booking link to pick a new time.

// Cancel links stay valid for a long while — a lesson may be weeks out.
const CANCEL_TTL_MIN = 90 * 24 * 60;

/** Mints a cancel action-token for a lesson and returns the full `/c/<token>` URL. */
export async function createCancelUrl(lessonId: string): Promise<string> {
  const raw = await createActionToken('cancel', lessonId, CANCEL_TTL_MIN);
  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${appUrl}/c/${raw}`;
}

export interface CancelTokenView {
  lessonId: string;
  startISO: string;
  status: Lesson['status'];
  /** Whether the lesson is still cancellable (not already cancelled/rejected/done). */
  cancellable: boolean;
}

/**
 * Read-only peek (does NOT consume the token) used to render `/c/[token]` before
 * the student confirms. Returns null for an unknown/expired/used/wrong-type token.
 */
export async function peekCancelToken(rawToken: string): Promise<CancelTokenView | null> {
  if (!rawToken) return null;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await db
    .select({ lessonId: actionTokens.lessonId })
    .from(actionTokens)
    .where(
      and(
        eq(actionTokens.tokenHash, tokenHash),
        eq(actionTokens.type, 'cancel'),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;

  const lrows = await db.select().from(lessons).where(eq(lessons.id, rows[0].lessonId)).limit(1);
  const lesson = lrows[0];
  if (!lesson) return null;
  return {
    lessonId: lesson.id,
    startISO: lesson.startsAt.toISOString(),
    status: lesson.status,
    cancellable: lesson.status === 'pending' || lesson.status === 'confirmed',
  };
}

export type CancelResult =
  | { ok: true; datetime: string }
  | { ok: false; error: 'invalid_token' | 'wrong_state' | 'internal'; message: string };

/**
 * Consumes a cancel token and cancels the lesson (single-use). Frees the slot and
 * removes the standalone Google event via `cancelOne`. Idempotent-ish: a lesson
 * that is already cancelled/rejected reports `wrong_state`.
 */
export async function cancelByToken(rawToken: string): Promise<CancelResult> {
  const consumed = await consumeActionToken(rawToken);
  if (!consumed || consumed.type !== 'cancel') {
    return { ok: false, error: 'invalid_token', message: 'הקישור אינו תקין או שכבר נוצל' };
  }

  const rows = await db.select().from(lessons).where(eq(lessons.id, consumed.lessonId)).limit(1);
  const lesson = rows[0];
  if (!lesson) return { ok: false, error: 'invalid_token', message: 'השיעור לא נמצא' };
  if (lesson.status !== 'pending' && lesson.status !== 'confirmed') {
    return { ok: false, error: 'wrong_state', message: 'השיעור כבר בוטל או שאינו פעיל' };
  }

  try {
    await cancelOne(lesson.id);
  } catch (err) {
    console.error('[cancel] failed to cancel lesson:', err);
    return { ok: false, error: 'internal', message: 'שגיאה בביטול השיעור' };
  }

  return { ok: true, datetime: formatILDateTime(lesson.startsAt) };
}
