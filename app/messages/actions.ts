'use server';

import { auth } from '@/auth';
import {
  listConversations,
  loadThread,
  sendChatMessage,
  type Conversation,
  type ChatMessage,
} from '@/lib/messages';

// Owner-only server actions backing the /messages inbox. The inbox polls
// fetchConversations / fetchThread for near-real-time updates and posts new
// messages through sendMessageAction.

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

export async function fetchConversations(): Promise<Conversation[]> {
  if (!(await requireOwner())) return [];
  return listConversations();
}

export async function fetchThread(
  studentId: string,
): Promise<{ name: string; messages: ChatMessage[] } | null> {
  if (!(await requireOwner())) return null;
  const t = await loadThread(studentId);
  if (!t) return null;
  return { name: t.student.name, messages: t.messages };
}

export async function sendMessageAction(
  studentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  return sendChatMessage(studentId, text);
}
