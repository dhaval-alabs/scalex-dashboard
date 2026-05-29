// POST /api/auth/verify-otp
// Verifies OTP against JWT, sets 7-day httpOnly auth cookie
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { otp, pendingToken } = req.body || {};
  if (!otp || !pendingToken) {
    return res.status(400).json({ error: 'Missing otp or pendingToken.' });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured.' });

  let payload;
  try {
    payload = jwt.verify(pendingToken, secret);
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Code expired. Please request a new one.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }

  if (String(payload.otp) !== String(otp.trim())) {
    return res.status(401).json({ error: 'Incorrect code. Please try again.' });
  }

  // Issue 7-day session cookie
  const sessionToken = jwt.sign({ email: payload.email }, secret, { expiresIn: '7d' });

  const cookie = serialize('scalex_auth', sessionToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7, // 7 days in seconds
  });

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ redirect: '/' });
}
