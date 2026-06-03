import { env } from '@/lib/env';

// Shared cron authentication. Vercel Cron (and manual triggers) must present
// `Authorization: Bearer <CRON_SECRET>`. The check is constant-time-ish via a
// direct compare on already-trusted-length secrets; CRON_SECRET is validated
// to be >= 16 chars by lib/env.

/** Returns true when the request carries a valid CRON_SECRET bearer token. */
export function isAuthorizedCron(req: Request): boolean {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return false;
  const expected = `Bearer ${env().CRON_SECRET}`;
  // length-guarded equality (avoids leaking length only; secrets are fixed)
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
