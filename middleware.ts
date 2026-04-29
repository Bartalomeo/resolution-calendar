import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, parseCookies } from '@/lib/auth';

const PUBLIC_PATHS = [
  '/',
  '/auth',
  '/v1/subscribe',
  '/v1/success',
  '/v1/payment',
  '/api/auth',
  '/api/markets',
  '/api/cron',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth session
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['rc_session'];

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const payload = verifyToken(token);
  if (!payload) {
    const response = NextResponse.redirect(new URL('/auth/login', request.url));
    // Clear invalid cookie
    response.headers.set('Set-Cookie', 'rc_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/v1/:path*', '/api/user/:path*'],
};
