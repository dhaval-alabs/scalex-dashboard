// POST /api/auth/logout
// Clears the auth cookie and redirects to login
import { serialize } from 'cookie';

export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  const cookie = serialize('scalex_auth', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   0,
  });
  res.setHeader('Set-Cookie', cookie);
  res.redirect(302, '/login.html');
}
