import { db } from '@/lib/db';
import { googleTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/crypto';
import { env } from '@/lib/env';

// Encrypted store for the Google OAuth refresh token (single account =
// Ilanit's). Access tokens are short-lived and refreshed on demand.

/**
 * Persists (encrypted) the long-lived refresh token captured during sign-in.
 * Upserts on account email.
 */
export async function saveGoogleRefreshToken(
  email: string,
  refreshToken: string,
  scope?: string,
): Promise<void> {
  const enc = encrypt(refreshToken);
  const calendarId = env().GOOGLE_CALENDAR_ID;
  const existing = await db
    .select()
    .from(googleTokens)
    .where(eq(googleTokens.accountEmail, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(googleTokens)
      .set({
        refreshToken: enc,
        scope: scope ?? existing[0].scope,
        calendarId,
        updatedAt: new Date(),
      })
      .where(eq(googleTokens.accountEmail, email));
    return;
  }

  await db.insert(googleTokens).values({
    accountEmail: email,
    refreshToken: enc,
    scope,
    calendarId,
  });
}

/** Returns the decrypted refresh token, or null if none stored. */
export async function getGoogleRefreshToken(): Promise<string | null> {
  const rows = await db.select().from(googleTokens).limit(1);
  if (rows.length === 0) return null;
  return decrypt(rows[0].refreshToken);
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/**
 * Exchanges the stored refresh token for a fresh access token via Google's
 * OAuth token endpoint. Caches the access token + expiry (encrypted) in the
 * google_tokens row and reuses it while still valid.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const rows = await db.select().from(googleTokens).limit(1);
  if (rows.length === 0) {
    throw new Error('NO_GOOGLE_TOKEN: Ilanit must connect her Google account first');
  }
  const row = rows[0];

  // reuse cached access token if it has >60s of life left
  if (row.accessToken && row.expiry && row.expiry.getTime() - Date.now() > 60_000) {
    return decrypt(row.accessToken);
  }

  const refreshToken = decrypt(row.refreshToken);
  const e = env();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: e.AUTH_GOOGLE_ID,
      client_secret: e.AUTH_GOOGLE_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as GoogleTokenResponse;
  const expiry = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(googleTokens)
    .set({
      accessToken: encrypt(data.access_token),
      expiry,
      updatedAt: new Date(),
    })
    .where(eq(googleTokens.id, row.id));

  return data.access_token;
}
