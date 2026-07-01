import { db } from '@/lib/db';
import { messageLog, students, type Student } from '@/db/schema';
import { desc, eq, inArray, or } from 'drizzle-orm';
import { contactPhoneFor } from '@/lib/students';
import { sendText } from '@/lib/whatsapp/provider';
import { logMessage, type MessageStatus } from '@/lib/message-log';

// Backing queries for the in-app WhatsApp INBOX (/messages). Conversations are
// grouped by student — a message's `toPhone` (the contact) is matched to a
// student's own phone OR guardian phone, so a child + parent share one thread.
// Only students are shown; messages to/from unknown numbers never appear (the
// inbound webhook already drops them).

export interface ChatMessage {
  id: string;
  direction: 'out' | 'in';
  body: string;
  status: MessageStatus;
  template: string;
  createdAt: string; // ISO
}

export interface Conversation {
  studentId: string;
  name: string;
  contactPhone: string;
  lastBody: string;
  lastDirection: 'out' | 'in';
  lastAt: string; // ISO
  total: number;
  /** Inbound messages (customer replies) in this thread — a light "attention" hint. */
  inbound: number;
}

/** The phones that identify a student as a chat contact (own + guardian). */
function contactPhones(s: Pick<Student, 'phone' | 'guardianPhone'>): string[] {
  return [s.phone, s.guardianPhone].filter((p): p is string => Boolean(p && p.trim()));
}

/** Finds the student a contact phone belongs to (own or guardian phone). */
export async function resolveContactStudent(phoneE164: string): Promise<Student | null> {
  const p = phoneE164.trim();
  if (!p) return null;
  const rows = await db
    .select()
    .from(students)
    .where(or(eq(students.phone, p), eq(students.guardianPhone, p)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * All conversations (one per student that has any message), newest activity
 * first. Built by resolving each message's contact phone to a student.
 */
export async function listConversations(): Promise<Conversation[]> {
  const roster = await db
    .select({
      id: students.id,
      name: students.name,
      phone: students.phone,
      guardianPhone: students.guardianPhone,
    })
    .from(students);

  // phone → studentId, and studentId → student meta
  const phoneToId = new Map<string, string>();
  const meta = new Map<string, { name: string; contactPhone: string }>();
  for (const s of roster) {
    for (const ph of contactPhones(s)) phoneToId.set(ph, s.id);
    meta.set(s.id, { name: s.name, contactPhone: contactPhoneFor(s) });
  }

  const rows = await db
    .select({
      toPhone: messageLog.toPhone,
      body: messageLog.body,
      direction: messageLog.direction,
      createdAt: messageLog.createdAt,
    })
    .from(messageLog)
    .orderBy(desc(messageLog.createdAt));

  const convo = new Map<string, Conversation>();
  for (const r of rows) {
    const studentId = phoneToId.get(r.toPhone.trim());
    if (!studentId) continue; // message to an unknown number — not shown
    const m = meta.get(studentId)!;
    const existing = convo.get(studentId);
    if (!existing) {
      convo.set(studentId, {
        studentId,
        name: m.name,
        contactPhone: m.contactPhone,
        lastBody: r.body,
        lastDirection: r.direction,
        lastAt: r.createdAt.toISOString(),
        total: 1,
        inbound: r.direction === 'in' ? 1 : 0,
      });
    } else {
      existing.total += 1;
      if (r.direction === 'in') existing.inbound += 1;
    }
  }

  return Array.from(convo.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** The full message thread for one student (ascending), plus the student. */
export async function loadThread(
  studentId: string,
): Promise<{ student: Student; messages: ChatMessage[] } | null> {
  const srows = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const student = srows[0];
  if (!student) return null;

  const phones = contactPhones(student);
  if (phones.length === 0) return { student, messages: [] };

  const rows = await db
    .select({
      id: messageLog.id,
      direction: messageLog.direction,
      body: messageLog.body,
      status: messageLog.status,
      template: messageLog.template,
      createdAt: messageLog.createdAt,
    })
    .from(messageLog)
    .where(inArray(messageLog.toPhone, phones))
    .orderBy(messageLog.createdAt);

  const messages: ChatMessage[] = rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    body: r.body,
    status: r.status,
    template: r.template,
    createdAt: r.createdAt.toISOString(),
  }));
  return { student, messages };
}

export interface SendChatResult {
  ok: boolean;
  error?: string;
}

/** Sends a free-text WhatsApp to a student from the inbox, logging it (out). */
export async function sendChatMessage(studentId: string, text: string): Promise<SendChatResult> {
  const body = text.trim();
  if (!body) return { ok: false, error: 'הודעה ריקה' };

  const srows = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  const student = srows[0];
  if (!student) return { ok: false, error: 'התלמיד לא נמצא' };

  const to = contactPhoneFor(student);
  if (!to) return { ok: false, error: 'אין מספר טלפון לתלמיד/ה' };

  const result = await sendText(to, body);
  await logMessage({
    toPhone: to,
    template: 'chat',
    body,
    direction: 'out',
    providerMsgId: result.messageId,
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? undefined : result.error,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'שליחה נכשלה' };
}

// Re-exported so the webhook + UI share one place for the enum type.
export type { MessageStatus };
