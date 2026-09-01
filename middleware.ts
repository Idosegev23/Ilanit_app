import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protects Ilanit's private dashboard areas. Public booking / action-token
// routes / cron / auth are intentionally open. Auth.js JWT session cookie
// presence is the gate; the route handlers themselves re-validate via auth().

/*
  Every owner-only page must appear BOTH here and in `config.matcher` below —
  the matcher decides whether the middleware runs at all, so a page listed in
  one and not the other is served with no gate. `/messages`, `/availability`
  and `/standby` were missing from both and were readable by anyone with the
  URL; `/messages` in particular lists parents' phone numbers.
*/
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/students',
  '/lessons',
  '/availability',
  '/groups',
  '/reports',
  '/messages',
  '/standby',
  '/settings',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function hasSessionCookie(req: NextRequest): boolean {
  return (
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }
  if (hasSessionCookie(req)) {
    return NextResponse.next();
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/students/:path*',
    '/lessons/:path*',
    '/availability/:path*',
    '/groups/:path*',
    '/reports/:path*',
    '/messages/:path*',
    '/standby/:path*',
    '/settings/:path*',
  ],
};
