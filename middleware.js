// Vercel Edge Middleware — auth guard (plain Vercel Edge, no next/server)
// Works with static HTML + Vercel serverless (no Next.js required)
import { jwtVerify } from 'jose';

export const config = {
  matcher: '/((?!_vercel|favicon\\.ico|login\\.html|api/auth).*)',
};

export default async function middleware(request) {
  const url = new URL(request.url);

  // Parse cookies manually (no next/server cookie helper needed)
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
  const token = cookies['scalex_auth'];

  if (!token) {
    return Response.redirect(new URL('/login.html', request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    await jwtVerify(token, secret);
    return; // Allow request through
  } catch {
    // Expired or invalid — redirect to login, clear cookie
    const response = Response.redirect(new URL('/login.html', request.url));
    response.headers.append(
      'Set-Cookie',
      'scalex_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    );
    return response;
  }
}
