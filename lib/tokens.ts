import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { actionTokens } from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';

// Single-use, expiring action tokens powering the WhatsApp-link → web-action
// flow (approve / payment / assign_student). Only the hash is stored; the raw
// token lives only in the link.

export type ActionTokenType =
  | 'approve'
  | 'payment'
  | 'assign_student'
  | 'cancel'
  // Parent-facing settle screen, distinct from 'payment' which is Ilanit's.
  | 'pay';

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Creates an action token bound to a lesson, returning the RAW token (to embed
 * in a link). Only its SHA-256 hash is persisted.
 */
export async function createActionToken(
  type: ActionTokenType,
  lessonId: string,
  ttlMin: number,
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlMin * 60_000);
  await db.insert(actionTokens).values({ tokenHash, type, lessonId, expiresAt });
  return raw;
}

/**
 * Atomically consumes a token: returns its {type, lessonId} only if it exists,
 * is unexpired, and has not been used. The single guarded UPDATE flips usedAt
 * only when usedAt IS NULL and the token is still valid, making it truly
 * single-use and safe against concurrent/double clicks. Returns null otherwise.
 */
export async function consumeActionToken(
  raw: string,
): Promise<{ type: ActionTokenType; lessonId: string } | null> {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const now = new Date();

  const updated = await db
    .update(actionTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(actionTokens.tokenHash, tokenHash),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, now),
      ),
    )
    .returning();

  if (updated.length === 0) return null;
  const row = updated[0];
  return { type: row.type, lessonId: row.lessonId };
}
