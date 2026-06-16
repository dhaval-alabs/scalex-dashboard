import { serialize } from "cookie";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST() {
  const cookie = serialize("scalex_auth", "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 0,
  });
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookie);
  return res;
}
