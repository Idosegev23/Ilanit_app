'use server';

import { declareIntent } from '@/lib/payments';

/*
  Public — reached only by holding the emailed link, exactly like the booking
  and cancel flows. The token is the authorization.
*/
export async function declareIntentAction(
  token: string,
  intent: 'paid' | 'bit',
): Promise<{ ok: boolean; error?: string }> {
  if (intent !== 'paid' && intent !== 'bit') {
    return { ok: false, error: 'בחירה לא תקינה' };
  }
  return declareIntent(token, intent);
}
