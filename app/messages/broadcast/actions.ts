'use server';

import { auth } from '@/auth';
import { env } from '@/lib/env';
import { revalidatePath } from 'next/cache';
import {
  createBroadcast,
  sendBatch,
  retryFailures,
  type BatchResult,
  type CreateBroadcastResult,
} from '@/lib/broadcast';

// Server actions for the broadcast screen. Every one is owner-gated: these send
// WhatsApp to real people and cannot be undone.

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email;
  return !!email && email === env().ALLOWED_LOGIN_EMAIL;
}

export async function createBroadcastAction(
  body: string,
  studentIds: string[],
): Promise<CreateBroadcastResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  const result = await createBroadcast(body, studentIds);
  if (result.ok) revalidatePath('/messages/broadcast');
  return result;
}

export async function sendBatchAction(broadcastId: string, size = 5): Promise<BatchResult> {
  if (!(await requireOwner())) {
    return { ok: false, sent: 0, failed: 0, remaining: 0, done: false, error: 'אין הרשאה' };
  }
  const result = await sendBatch(broadcastId, size);
  if (result.done) revalidatePath('/messages/broadcast');
  return result;
}

export async function retryFailuresAction(
  broadcastId: string,
): Promise<{ ok: boolean; requeued: number; error?: string }> {
  if (!(await requireOwner())) return { ok: false, requeued: 0, error: 'אין הרשאה' };
  const result = await retryFailures(broadcastId);
  revalidatePath('/messages/broadcast');
  return result;
}
