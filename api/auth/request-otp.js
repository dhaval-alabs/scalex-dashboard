// POST /api/auth/request-otp
// Validates email, generates 6-digit OTP, signs JWT, sends via Resend
import jwt from 'jsonwebtoken';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalised = email.trim().toLowerCase();

  // Check against allowlist
  const allowed = (process.env.ALLOWED_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!allowed.includes(normalised)) {
    return res.status(403).json({ error: 'This email is not authorised to access the dashboard.' });
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  // Sign JWT: { email, otp } — expires in 10 minutes
  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured (AUTH_SECRET missing).' });

  const pendingToken = jwt.sign({ email: normalised, otp }, secret, { expiresIn: '10m' });

  // Send via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'Server misconfigured (RESEND_API_KEY missing).' });

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'ScaleX Dashboard <noreply@scaletrix.ai>',
      to:   [normalised],
      subject: `Your ScaleX sign-in code: ${otp}`,
      html: `
        <div style="font-family:'IBM Plex Sans',sans-serif;max-width:400px;margin:0 auto;padding:2rem">
          <p style="font-size:0.85rem;color:#6B7280;margin-bottom:1rem">ScaleX Intelligence Dashboard</p>
          <h2 style="font-size:1.5rem;font-weight:700;color:#0F1923;margin-bottom:0.5rem">Your sign-in code</h2>
          <p style="color:#374151;margin-bottom:1.5rem">Use this code to sign in. It expires in 10 minutes.</p>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:2rem;font-weight:700;
            letter-spacing:0.3em;color:#0D9488;background:#F0FDFA;padding:1rem 1.5rem;
            border-radius:8px;display:inline-block;margin-bottom:1.5rem">${otp}</div>
          <p style="font-size:0.78rem;color:#9CA3AF">If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const errBody = await emailRes.text();
    console.error('Resend error:', errBody);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }

  return res.status(200).json({ pendingToken });
}
