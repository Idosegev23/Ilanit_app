import { db } from '@/lib/db';
import {
  broadcasts,
  broadcastRecipients,
  students,
  lessons,
  groupMembers,
  groups,
  type Student,
} from '@/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { contactPhoneFor } from '@/lib/students';
import { sendText } from '@/lib/whatsapp/provider';
import { logMessage, updateMessageLog } from '@/lib/message-log';
import { nowIL } from '@/lib/time';

/*
  Bulk WhatsApp sending.

  Two things drive the shape of this module.

  Recipients are PHONES, not students. contactPhoneFor() routes a child's
  messages to their guardian, and siblings share that guardian — so four Rashef
  children collapse to one delivery. Grouping by resolved phone is what stops
  Irena receiving four copies of the same text.

  Sending is CLAIMED IN BATCHES rather than looped in one request. The hourly
  cron cannot carry a send someone is waiting on, and a single request sending
  every recipient would sit near the function timeout with no visible progress
  and nothing to resume if it died halfway.
*/

/** Token replaced with each recipient's own name. */
export const NAME_TOKEN = '{שם}';

/**
 * Pause between messages inside a batch. Bulk WhatsApp gets accounts flagged,
 * and perfectly regular intervals are themselves a bot signal — so the delay
 * carries jitter, and {שם} keeps the bodies from being byte-identical.
 */
const MIN_GAP_MS = 900;
const JITTER_MS = 900;

function gap(): number {
  return MIN_GAP_MS + Math.floor(Math.random() * JITTER_MS);
}

export interface AudienceStudent {
  id: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  archived: boolean;
  /** Group names this student belongs to (for filtering). */
  groups: string[];
  /** Start of their next future lesson, or null. */
  nextLessonAt: Date | null;
  /** Start of their most recent past lesson, or null (for sorting). */
  lastLessonAt: Date | null;
}

/** Everyone who could be messaged, with the fields the picker filters/sorts on. */
export async function loadAudience(): Promise<AudienceStudent[]> {
  const rows = await db.select().from(students).orderBy(asc(students.name));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const memberships = await db
    .select({ studentId: groupMembers.studentId, groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(inArray(groupMembers.studentId, ids));

  const groupRows = await db.select({ id: groups.id, name: groups.name }).from(groups);
  const groupName = new Map(groupRows.map((g) => [g.id, g.name]));

  const byStudentGroups = new Map<string, string[]>();
  for (const m of memberships) {
    const list = byStudentGroups.get(m.studentId) ?? [];
    list.push(groupName.get(m.groupId) ?? '');
    byStudentGroups.set(m.studentId, list.filter(Boolean));
  }

  const now = nowIL();
  const lessonRows = await db
    .select({ studentId: lessons.studentId, startsAt: lessons.startsAt })
    .from(lessons)
    .where(inArray(lessons.studentId, ids));

  const next = new Map<string, Date>();
  const last = new Map<string, Date>();
  for (const l of lessonRows) {
    if (!l.studentId) continue;
    if (l.startsAt > now) {
      const cur = next.get(l.studentId);
      if (!cur || l.startsAt < cur) next.set(l.studentId, l.startsAt);
    } else {
      const cur = last.get(l.studentId);
      if (!cur || l.startsAt > cur) last.set(l.studentId, l.startsAt);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    guardianName: r.guardianName,
    guardianPhone: r.guardianPhone,
    archived: r.archived,
    groups: byStudentGroups.get(r.id) ?? [],
    nextLessonAt: next.get(r.id) ?? null,
    lastLessonAt: last.get(r.id) ?? null,
  }));
}

export interface ResolvedRecipient {
  phone: string;
  /** The student the {שם} token renders with — the first by name. */
  primary: { id: string; name: string };
  /** Other selected students on this same number. */
  alsoCovers: string[];
}

/**
 * Collapses selected students to one delivery per phone number.
 *
 * This is the whole reason the module exists rather than a loop: four siblings
 * under one guardian number are four students but ONE person holding ONE phone.
 * Students with no reachable number are dropped and reported separately.
 */
export function resolveRecipients(
  selected: Array<Pick<Student, 'id' | 'name' | 'phone' | 'guardianPhone'>>,
): { recipients: ResolvedRecipient[]; unreachable: string[] } {
  const byPhone = new Map<string, Array<{ id: string; name: string }>>();
  const unreachable: string[] = [];

  for (const s of selected) {
    const phone = contactPhoneFor(s).trim();
    if (!phone) {
      unreachable.push(s.name);
      continue;
    }
    const list = byPhone.get(phone) ?? [];
    list.push({ id: s.id, name: s.name });
    byPhone.set(phone, list);
  }

  const recipients: ResolvedRecipient[] = [];
  for (const [phone, group] of byPhone) {
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name, 'he'));
    recipients.push({
      phone,
      primary: sorted[0],
      alsoCovers: sorted.slice(1).map((g) => g.name),
    });
  }
  recipients.sort((a, b) => a.primary.name.localeCompare(b.primary.name, 'he'));
  return { recipients, unreachable };
}

/** Substitutes the name token. Kept trivial and pure so it is testable. */
export function renderBody(body: string, name: string): string {
  return body.split(NAME_TOKEN).join(name);
}

export interface CreateBroadcastResult {
  ok: boolean;
  broadcastId?: string;
  recipientCount?: number;
  unreachable?: string[];
  error?: string;
}

/**
 * Creates the broadcast and its recipient rows. Sends NOTHING — the caller then
 * drives sendBatch until it reports no remainder.
 */
export async function createBroadcast(
  body: string,
  studentIds: string[],
): Promise<CreateBroadcastResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: 'ההודעה ריקה' };
  if (studentIds.length === 0) return { ok: false, error: 'לא נבחרו נמענים' };

  const selected = await db.select().from(students).where(inArray(students.id, studentIds));
  const { recipients, unreachable } = resolveRecipients(selected);
  if (recipients.length === 0) {
    return { ok: false, error: 'לאף אחד מהנבחרים אין מספר טלפון' };
  }

  const inserted = await db
    .insert(broadcasts)
    .values({ body: text, status: 'sending', totalCount: recipients.length })
    .returning();
  const broadcast = inserted[0];

  await db.insert(broadcastRecipients).values(
    recipients.map((r) => ({
      broadcastId: broadcast.id,
      studentId: r.primary.id,
      nameSnapshot: r.primary.name,
      phoneSnapshot: r.phone,
      alsoCovers: r.alsoCovers.length ? r.alsoCovers.join(', ') : null,
    })),
  );

  return {
    ok: true,
    broadcastId: broadcast.id,
    recipientCount: recipients.length,
    unreachable,
  };
}

export interface BatchResult {
  ok: boolean;
  sent: number;
  failed: number;
  remaining: number;
  done: boolean;
  error?: string;
}

/**
 * Sends the next `size` pending recipients.
 *
 * A failure marks that ONE recipient failed and moves on: one dead number must
 * not strand everybody behind it. Rows are only ever read as 'pending' and
 * written to a terminal state, so re-running this after an interrupted run
 * picks up exactly where it stopped and cannot re-send anyone.
 */
export async function sendBatch(broadcastId: string, size = 5): Promise<BatchResult> {
  const found = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
  const broadcast = found[0];
  if (!broadcast) return { ok: false, sent: 0, failed: 0, remaining: 0, done: true, error: 'התפוצה לא נמצאה' };

  const batch = await db
    .select()
    .from(broadcastRecipients)
    .where(
      and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.status, 'pending'),
      ),
    )
    .limit(size);

  let sent = 0;
  let failed = 0;

  for (const [i, r] of batch.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, gap()));

    const body = renderBody(broadcast.body, r.nameSnapshot);
    // Log first so a crash mid-send still leaves a trace of the attempt, and so
    // the message shows up in the student's conversation thread like any other.
    const logId = await logMessage({
      toPhone: r.phoneSnapshot,
      template: 'broadcast',
      body,
      relatedId: `broadcast:${broadcastId}:${r.id}`,
      status: 'pending',
    });

    const result = await sendText(r.phoneSnapshot, body);
    if (result.ok) {
      sent++;
      await updateMessageLog(logId, { status: 'sent', providerMsgId: result.messageId });
      await db
        .update(broadcastRecipients)
        .set({ status: 'sent', providerMsgId: result.messageId ?? null, sentAt: new Date(), error: null })
        .where(eq(broadcastRecipients.id, r.id));
    } else {
      failed++;
      await updateMessageLog(logId, { status: 'failed', error: result.error });
      await db
        .update(broadcastRecipients)
        .set({ status: 'failed', error: result.error ?? 'שליחה נכשלה' })
        .where(eq(broadcastRecipients.id, r.id));
    }
  }

  const counts = await db
    .select({
      status: broadcastRecipients.status,
      n: sql<number>`count(*)::int`,
    })
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, broadcastId))
    .groupBy(broadcastRecipients.status);

  const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  const remaining = by.pending ?? 0;
  const totalSent = by.sent ?? 0;
  const totalFailed = by.failed ?? 0;

  await db
    .update(broadcasts)
    .set({
      sentCount: totalSent,
      failedCount: totalFailed,
      status: remaining === 0 ? 'done' : 'sending',
    })
    .where(eq(broadcasts.id, broadcastId));

  return { ok: true, sent, failed, remaining, done: remaining === 0 };
}

/** Flips this broadcast's failures back to pending so sendBatch retries them. */
export async function retryFailures(broadcastId: string): Promise<{ ok: boolean; requeued: number }> {
  const failedRows = await db
    .select({ id: broadcastRecipients.id })
    .from(broadcastRecipients)
    .where(
      and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.status, 'failed'),
      ),
    );
  if (failedRows.length === 0) return { ok: true, requeued: 0 };

  await db
    .update(broadcastRecipients)
    .set({ status: 'pending', error: null })
    .where(
      and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.status, 'failed'),
      ),
    );
  await db
    .update(broadcasts)
    .set({ status: 'sending', failedCount: 0 })
    .where(eq(broadcasts.id, broadcastId));

  return { ok: true, requeued: failedRows.length };
}

export interface BroadcastSummary {
  id: string;
  body: string;
  status: 'draft' | 'sending' | 'done';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
}

/** Past broadcasts, newest first. */
export async function listBroadcasts(limit = 20): Promise<BroadcastSummary[]> {
  return db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(limit);
}

export interface RecipientRow {
  id: string;
  name: string;
  phone: string;
  alsoCovers: string | null;
  status: 'pending' | 'sent' | 'failed';
  error: string | null;
}

/** Per-recipient outcome for one broadcast. */
export async function listRecipients(broadcastId: string): Promise<RecipientRow[]> {
  const rows = await db
    .select()
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, broadcastId))
    .orderBy(asc(broadcastRecipients.nameSnapshot));
  return rows.map((r) => ({
    id: r.id,
    name: r.nameSnapshot,
    phone: r.phoneSnapshot,
    alsoCovers: r.alsoCovers,
    status: r.status,
    error: r.error,
  }));
}
