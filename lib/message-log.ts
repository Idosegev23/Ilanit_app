import { db } from '@/lib/db';
import { messageLog, type NewMessageLog } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/** Delivery lifecycle of an outbound WhatsApp message. */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// Monotonic rank so out-of-order GreenAPI status webhooks never downgrade a row
// (a late "delivered" must not overwrite an already-"read").
const STATUS_RANK: Record<MessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 1,
};

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
  status?: MessageStatus;
  direction?: 'out' | 'in';
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
    direction: entry.direction ?? 'out',
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

/**
 * Advances a message's delivery status from a GreenAPI outgoing-status webhook,
 * matched by the provider message id (idMessage) we stored on send. Returns
 * false when no such row exists — which naturally IGNORES statuses for messages
 * this system did not send (e.g. other projects sharing the GreenAPI instance).
 * Monotonic: never downgrades a row (a late 'delivered' won't overwrite 'read').
 */
export async function advanceStatusByProviderMsgId(
  providerMsgId: string,
  status: MessageStatus,
): Promise<boolean> {
  if (!providerMsgId) return false;
  const rows = await db
    .select({ id: messageLog.id, status: messageLog.status })
    .from(messageLog)
    .where(eq(messageLog.providerMsgId, providerMsgId))
    .limit(1);
  const row = rows[0];
  if (!row) return false; // not one of our messages → ignore

  const current = STATUS_RANK[row.status as MessageStatus] ?? 0;
  if (status === 'failed') {
    if (current >= STATUS_RANK.delivered) return false; // already delivered/read
  } else if ((STATUS_RANK[status] ?? 0) <= current) {
    return false;
  }
  await db.update(messageLog).set({ status }).where(eq(messageLog.id, row.id));
  return true;
}
