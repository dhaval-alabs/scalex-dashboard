// Vercel Edge Middleware — auth guard
// Runs on every request. Checks httpOnly scalex_auth cookie.
// Unprotected: /login.html, /api/auth/*, /_vercel/*, /favicon.ico
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/((?!_vercel|favicon.ico).*)'],
};

const PUBLIC_PATHS = ['/login.html', '/api/auth/request-otp', '/api/auth/verify-otp'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check cookie
  const token = request.cookies.get('scalex_auth')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login.html', request.url));
  }

  // Verify JWT
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    // Expired or invalid — clear and redirect
    const response = NextResponse.redirect(new URL('/login.html', request.url));
    response.cookies.delete('scalex_auth');
    return response;
  }
}
