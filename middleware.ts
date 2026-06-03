import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protects Ilanit's private dashboard areas. Public booking / action-token
// routes / cron / auth are intentionally open. Auth.js JWT session cookie
// presence is the gate; the route handlers themselves re-validate via auth().

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/students',
  '/lessons',
  '/groups',
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
    '/groups/:path*',
    '/settings/:path*',
  ],
};
