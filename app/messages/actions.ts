'use server';

import { auth } from '@/auth';
import {
  listConversations,
  loadThread,
  sendChatMessage,
  type Conversation,
  type ChatMessage,
} from '@/lib/messages';
import { refreshMissingAvatars } from '@/lib/whatsapp/avatars';

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
): Promise<{ name: string; avatarUrl: string | null; messages: ChatMessage[] } | null> {
  if (!(await requireOwner())) return null;
  const t = await loadThread(studentId);
  if (!t) return null;
  return { name: t.student.name, avatarUrl: t.student.avatarUrl, messages: t.messages };
}

/**
 * Pulls WhatsApp profile pictures (avatars) for students that don't have one
 * cached yet. Called by the inbox on mount; the next poll picks up the new URLs.
 */
export async function refreshAvatarsAction(): Promise<number> {
  if (!(await requireOwner())) return 0;
  return refreshMissingAvatars(25);
}

export async function sendMessageAction(
  studentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  return sendChatMessage(studentId, text);
}
