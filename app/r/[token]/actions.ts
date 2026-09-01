'use server';

import { answerReschedule } from '@/lib/lessons/reschedule';

/** Public — holding the link is the authorization, as in the booking flows. */
export async function answerRescheduleAction(
  token: string,
  accepted: boolean,
): Promise<{ ok: boolean; error?: string }> {
  return answerReschedule(token, accepted);
}
