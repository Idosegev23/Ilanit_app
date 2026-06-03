import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { env } from '@/lib/env';
import { saveGoogleRefreshToken } from '@/lib/google-tokens';

// Auth.js v5 — single Google account (Ilanit's). The same consent grants both
// login and Calendar access (offline → refresh token captured & stored
// encrypted). Sign-in is restricted to ALLOWED_LOGIN_EMAIL.

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  return {
    secret: e.AUTH_SECRET,
    trustHost: true,
    session: { strategy: 'jwt' },
    providers: [
      Google({
        clientId: e.AUTH_GOOGLE_ID,
        clientSecret: e.AUTH_GOOGLE_SECRET,
        authorization: {
          params: {
            access_type: 'offline',
            prompt: 'consent',
            scope: `openid email profile ${CALENDAR_SCOPE}`,
          },
        },
      }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        const email = (profile?.email ?? '').toLowerCase();
        if (email !== e.ALLOWED_LOGIN_EMAIL.toLowerCase()) {
          return false;
        }
        // Capture the long-lived refresh token (present on first consent).
        if (account?.refresh_token) {
          await saveGoogleRefreshToken(
            email,
            account.refresh_token,
            typeof account.scope === 'string' ? account.scope : undefined,
          );
        }
        return true;
      },
      async session({ session }) {
        return session;
      },
    },
    pages: {
      signIn: '/login',
    },
  };
});
