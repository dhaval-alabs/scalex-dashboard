// app/api/ask-ai/route.ts
// Auth-gated, rate-limited proxy to Anthropic API
// - Validates scalex_auth JWT before touching Anthropic
// - Max 20 requests per user per hour
// - Max 600 output tokens, last 6 messages of history only
// - Uses claude-haiku-4-5 (~20x cheaper than Sonnet, sufficient for this use case)

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

// In-memory rate limit store (resets on cold start — fine for demo scale)
// Map: email -> { count, windowStart }
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 20;       // requests per window
const WINDOW_MS  = 60 * 60 * 1000; // 1 hour

function checkRateLimit(email: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(email);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitStore.set(email, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

const SYSTEM = `You are the ScaleX Intelligence Assistant for AnalytixLabs — an EdTech company using server-side conversion tracking to reduce their Google Ads Cost Per Lead (CPL).

You have access to live data from the ScaleX Relay pipeline — a Google Apps Script relay that sends CRM stage changes (LSQ CRM) as offline conversions to Google Ads via server-side GTM (sGTM).

Key context you must know:
- The relay only sends PPC (Google Ads) leads. Non-PPC sources (social, WhatsApp, phone, organic) are skipped — this is intentional and expected, not a bug. Skip rate ~62% is normal.
- GCLID Attach Rate = % of uploaded conversions that carry a real Google click ID. Higher = better signal for Smart Bidding.
- EC Only = conversions matched by Enhanced Conversions (hashed email/phone) when no GCLID exists. This is the fallback, not the goal.
- NEEDS_REVIEW health = GCLID attach rate below ~30%. The current 24-26% is improving (was ~51% EC-only in May). A _gcl_aw cookie route via Stape is pending activation (~18 Jun) which will improve this further.
- RELAY_AHEAD in reconciliation = normal and healthy. Relay uploads before Google attributes conversions. Not an incident.
- GADS_AHEAD = potential issue worth flagging.
- Value ladder: Lead Submitted=₹200, Signup=₹500, Qualified=₹2,000, Converted=₹10,000, Disqualified=₹1.
- Primary conversion actions (feed Smart Bidding): lead_submitted_sclx, qualified_sclx, disqualified_sclx.
- Secondary (signal only): converted_sclx, signup_sclx.
- PARTIAL_FAIL with [LEGACY] tag = benign. Old conversions outside the adjustment window. Not a new problem.

When interpreting data:
- Always explain what the numbers mean in plain English
- Say whether it is good, concerning, or expected
- Explain the cause if known
- Suggest next steps only if there is a clear action
- Be concise — 3-5 sentences is usually enough
- For follow-up questions, answer conversationally using prior context. Do not re-fetch data unless asked.`;

export async function POST(req: NextRequest) {
  // ── 1. Auth check ──────────────────────────────────────────────
  const token = req.cookies.get("scalex_auth")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

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
      { error: `Rate limit reached. You can send ${RATE_LIMIT} messages per hour. Try again later.` },
      { status: 429 }
    );
  }

  // ── 3. Parse request ───────────────────────────────────────────
  const { messages } = await req.json().catch(() => ({ messages: [] }));
  if (!messages?.length) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  // Cap conversation history to last 6 messages to control token cost
  const trimmedMessages = messages.slice(-6);

  // ── 4. Call OpenRouter ─────────────────────────────────────────
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openrouterKey}`,
      "HTTP-Referer": "https://analytixlabs.scaletrix.ai",
      "X-Title": "ScaleX Dashboard",
    },
    body: JSON.stringify({
      model: "google/gemma-4-31b-it:free",
      messages: [
        { role: "system", content: SYSTEM },
        ...trimmedMessages
      ],
      max_tokens: 600,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("OpenRouter error:", err);
    return NextResponse.json({ error: `AI service error: ${resp.status} - ${err}` }, { status: 502 });
  }

  const result = await resp.json();
  const answer = result.choices?.[0]?.message?.content ?? "No response generated.";

  return NextResponse.json({
    answer,
    remaining_requests: remaining,
  });
}
