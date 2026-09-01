import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { actionTokens, lessons, students } from '@/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';

// Read-only "peek" at a payment action-token used to render the /p/[token] page.
// It must NOT consume the token (consumption happens only on the POST action),
// so it mirrors lib/tokens hashing but never flips usedAt.

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface PaymentTokenView {
  lessonId: string;
  studentName: string;
  datetime: Date;
  amount: number; // ₪ integer (suggested)
  location: string | null;
  alreadyPaid: boolean;
  receiptLabel: string | null; // default receipt description for this student
}

/**
 * Resolves the lesson + suggested amount behind a (still-valid, unused) payment
 * token, for rendering the payment page. Returns null if the token is missing,
 * expired, already used, or not a payment token.
 */
export async function peekPaymentToken(raw: string): Promise<PaymentTokenView | null> {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const now = new Date();

  const tokenRows = await db
    .select()
    .from(actionTokens)
    .where(
      and(
        eq(actionTokens.tokenHash, tokenHash),
        eq(actionTokens.type, 'payment'),
        isNull(actionTokens.usedAt),
        gt(actionTokens.expiresAt, now),
      ),
    )
    .limit(1);
  const tok = tokenRows[0];
  // Lesson-only view; a group-charge token has no lesson to show.
  if (!tok || !tok.lessonId) return null;

  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, tok.lessonId)).limit(1);
  const lesson = lessonRows[0];
  if (!lesson) return null;

  let studentName = lesson.bookedByName ?? 'תלמיד/ה';
  let receiptLabel: string | null = null;
  if (lesson.studentId) {
    const sRows = await db
      .select({
        name: students.name,
        defaultPrice: students.defaultPrice,
        receiptLabel: students.receiptLabel,
      })
      .from(students)
      .where(eq(students.id, lesson.studentId))
      .limit(1);
    if (sRows[0]) {
      studentName = sRows[0].name;
      receiptLabel = sRows[0].receiptLabel;
    }
  }

  return {
    lessonId: lesson.id,
    studentName,
    datetime: lesson.startsAt,
    amount: lesson.price ?? 0,
    location: lesson.location,
    alreadyPaid: lesson.status === 'completed',
    receiptLabel,
  };
}
