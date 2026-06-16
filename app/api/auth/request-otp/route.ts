import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") return NextResponse.json({ error: "Email is required." }, { status: 400 });
  const normalised = email.trim().toLowerCase();
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured (AUTH_SECRET missing)." }, { status: 500 });

  // Dev bypass
  if (normalised === "dev@scaletrix.ai") {
    const pendingToken = jwt.sign({ email: normalised, otp: "098765" }, secret, { expiresIn: "10m" });
    return NextResponse.json({ pendingToken });
  }

  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(normalised)) return NextResponse.json({ error: "This email is not authorised." }, { status: 403 });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const pendingToken = jwt.sign({ email: normalised, otp }, secret, { expiresIn: "10m" });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "Server misconfigured (RESEND_API_KEY missing)." }, { status: 500 });

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "ScaleX Workbench <noreply@scaletrix.ai>",
      to: [normalised],
      subject: `Your ScaleX sign-in code: ${otp}`,
      html: `<div style="font-family:'IBM Plex Sans',sans-serif;max-width:400px;margin:0 auto;padding:2rem"><h2 style="color:#0F1923">Your sign-in code</h2><p style="color:#374151">Use this code to sign in. It expires in 10 minutes.</p><div style="font-family:monospace;font-size:2rem;font-weight:700;letter-spacing:0.3em;color:#0D9488;background:#F0FDFA;padding:1rem 1.5rem;border-radius:8px;display:inline-block">${otp}</div></div>`,
    }),
  });
  if (!emailRes.ok) return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  return NextResponse.json({ pendingToken });
}
