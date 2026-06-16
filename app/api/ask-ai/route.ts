// app/api/ask-ai/route.ts
// Auth-gated, rate-limited proxy → Anthropic claude-haiku-4-5
// - Validates scalex_auth JWT before touching Anthropic
// - Max 20 requests per user per hour
// - Max 600 output tokens, last 6 messages of history only

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS  = 60 * 60 * 1000;

function checkRateLimit(email: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(email);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitStore.set(email, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

const SYSTEM = `You are the ScaleX Intelligence Assistant for AnalytixLabs — an EdTech company using server-side conversion tracking to reduce their Google Ads Cost Per Lead (CPL).

You have access to live data from the ScaleX Relay pipeline — a Google Apps Script relay that sends CRM stage changes (LSQ CRM) as offline conversions to Google Ads via server-side GTM (sGTM).

Key context:
- The relay only sends PPC (Google Ads) leads. Non-PPC sources (social, WhatsApp, phone, organic) are intentionally skipped — skip rate ~62% is normal and expected, not a bug.
- GCLID Attach Rate = % of uploaded conversions with a real Google click ID. Higher = better Smart Bidding signal.
- EC Only = conversions matched via Enhanced Conversions (hashed email/phone) when no GCLID. Fallback, not goal.
- NEEDS_REVIEW = GCLID attach rate below ~30%. Currently 24-26%, improving from ~51% EC-only in May.
- RELAY_AHEAD in reconciliation = normal. Relay uploads before Google attributes. Not an incident.
- GADS_AHEAD = potential issue worth investigating.
- Value ladder: Lead Submitted=₹200, Signup=₹500, Qualified=₹2,000, Converted=₹10,000, Disqualified=₹1.
- Primary conversion actions (feed Smart Bidding): lead_submitted_sclx, qualified_sclx, disqualified_sclx.
- Secondary (signal only): converted_sclx, signup_sclx.
- PARTIAL_FAIL with [LEGACY] tag = benign. Expired GCLIDs outside adjustment window. Not a new problem.
- The _gcl_aw cookie route via Stape activates ~18 Jun — this will improve GCLID attach rate meaningfully.
- CPL data comes from Google Ads. Signal quality (GCLID attach rate) directly impacts CPL — better signals = smarter bidding = lower CPL over time.

When you receive tool data, interpret it clearly:
- Explain what the numbers mean in plain English
- Say whether it is good, concerning, or expected — use actual status values (NEEDS_REVIEW, OK, RELAY_AHEAD)
- Explain the cause if known
- Suggest next steps only if there is a clear action
- Be concise — 3-5 sentences for simple questions, more for complex ones
- For follow-up questions, answer conversationally using prior context. Never hallucinate statuses or invent numbers not in the data.`;

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────
  const token = req.cookies.get("scalex_auth")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let email: string;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    email = payload.email as string;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // ── 2. Rate limit ──────────────────────────────────────────────
  const { allowed, remaining } = checkRateLimit(email);
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — ${RATE_LIMIT} messages per hour. Try again later.` },
      { status: 429 }
    );
  }

  // ── 3. Parse ───────────────────────────────────────────────────
  const { messages } = await req.json().catch(() => ({ messages: [] }));
  if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

  const trimmedMessages = messages.slice(-6);

  // ── 4. Call Anthropic Haiku ────────────────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM,
      messages: trimmedMessages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "AI service error — please try again." }, { status: 502 });
  }

  const result = await resp.json();
  const answer = result.content?.[0]?.text ?? "No response generated.";

  return NextResponse.json({ answer, remaining_requests: remaining });
}
