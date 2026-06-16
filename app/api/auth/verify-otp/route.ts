import jwt from "jsonwebtoken";
import { serialize } from "cookie";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { otp, pendingToken } = await req.json().catch(() => ({}));
  if (!otp || !pendingToken) return NextResponse.json({ error: "Missing otp or pendingToken." }, { status: 400 });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  let payload: any;
  try { payload = jwt.verify(pendingToken, secret); }
  catch (e: any) {
    if (e.name === "TokenExpiredError") return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 401 });
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const ok = String(payload.otp) === String(otp).trim();
  if (!ok) return NextResponse.json({ error: "Incorrect code." }, { status: 401 });

  const sessionToken = jwt.sign({ email: payload.email }, secret, { expiresIn: "7d" });
  const cookie = serialize("scalex_auth", sessionToken, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  const res = NextResponse.json({ redirect: "/dashboard" });
  res.headers.set("Set-Cookie", cookie);
  return res;
}
