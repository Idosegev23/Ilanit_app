import { db } from '@/lib/db';
import { messageLog, type NewMessageLog } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Audit trail + idempotency for outbound WhatsApp. Before sending a templated
// message keyed by (template, relatedId), callers check alreadySent() to avoid
// duplicate notifications across cron re-runs.

export interface LogMessageEntry {
  toPhone: string;
  template: string;
  body: string;
  relatedLessonId?: string;
  relatedId?: string;
  providerMsgId?: string;
  status?: 'pending' | 'sent' | 'failed';
  error?: string;
}

/**
 * Returns true if a SENT message with this (template, relatedId) already exists.
 * Used to guarantee idempotent notifications.
 */
export async function alreadySent(template: string, relatedId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messageLog.id })
    .from(messageLog)
    .where(
      and(
        eq(messageLog.template, template),
        eq(messageLog.relatedId, relatedId),
        eq(messageLog.status, 'sent'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Inserts a message-log row and returns its id. */
export async function logMessage(entry: LogMessageEntry): Promise<string> {
  const values: NewMessageLog = {
    toPhone: entry.toPhone,
    template: entry.template,
    body: entry.body,
    relatedLessonId: entry.relatedLessonId,
    relatedId: entry.relatedId,
    providerMsgId: entry.providerMsgId,
    status: entry.status ?? 'pending',
    error: entry.error,
  };
  const inserted = await db.insert(messageLog).values(values).returning({ id: messageLog.id });
  return inserted[0].id;
}

/** Updates an existing message-log row (e.g. mark sent/failed). */
export async function updateMessageLog(
  id: string,
  patch: Partial<Pick<LogMessageEntry, 'providerMsgId' | 'status' | 'error'>>,
): Promise<void> {
  await db.update(messageLog).set(patch).where(eq(messageLog.id, id));
}
