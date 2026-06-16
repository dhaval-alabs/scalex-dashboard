import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const config = {
  matcher: "/((?!_next|favicon.ico|login|api/auth).*)",
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("scalex_auth")?.value;
  const loginUrl = new URL("/login", req.url);

  if (!token) return NextResponse.redirect(loginUrl);
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set("scalex_auth", "", { path: "/", maxAge: 0 });
    return res;
  }
}
