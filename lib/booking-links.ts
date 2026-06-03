import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { bookingLinks } from '@/db/schema';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { env } from '@/lib/env';

// Personalized, tokenized booking links tied to a single student. Ilanit sends
// one to a student over WhatsApp; opening `/book/[token]` identifies the student
// from the token (no details to fill). Mirrors lib/tokens.ts (only the SHA-256
// hash is stored, the raw token lives only in the link) — but, unlike action
// tokens, a booking link is NOT single-use: a student may re-book with it until
// it expires.

const DEFAULT_TTL_DAYS = 30;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CreatedBookingLink {
  token: string;
  url: string;
}

/**
 * Creates a booking link bound to a student, returning the RAW token and the
 * full public URL to share. Only the SHA-256 hash is persisted. `ttlDays`
 * controls expiry; pass 0 (or a negative value) for a link that never expires.
 */
export async function createBookingLink(
  studentId: string,
  ttlDays = DEFAULT_TTL_DAYS,
): Promise<CreatedBookingLink> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const expiresAt =
    ttlDays > 0 ? new Date(Date.now() + ttlDays * 24 * 60 * 60_000) : null;

  await db.insert(bookingLinks).values({ tokenHash, studentId, expiresAt });

  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return { token: raw, url: `${appUrl}/book/${raw}` };
}

/**
 * Resolves a booking-link token to its student id. Returns null when the token
 * is unknown or expired. NOT single-use — the row is left intact so the student
 * can re-book with the same link until it expires.
 */
export async function resolveBookingLink(
  raw: string,
): Promise<{ studentId: string } | null> {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const now = new Date();

  const rows = await db
    .select({ studentId: bookingLinks.studentId })
    .from(bookingLinks)
    .where(
      and(
        eq(bookingLinks.tokenHash, tokenHash),
        // a NULL expiry means "never expires"
        or(isNull(bookingLinks.expiresAt), gt(bookingLinks.expiresAt, now)),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? { studentId: row.studentId } : null;
}
