// app/api/ask-ai/route.ts
// Auth-gated, rate-limited proxy → Anthropic claude-haiku-4-5
// Data sources: ScaleX Recon MCP (relay) + GAds Vercel MCP (campaigns/keywords)

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

// ── Call GAds Vercel MCP server-side ──────────────────────────
async function callGadsMCP(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const MCP_URL = "https://alabs-mcp-server.vercel.app/api/mcp";
  const body = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: tool, arguments: args }
  };
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`GAds MCP error: ${resp.status}`);
  const text = await resp.text();
  // SSE format: "event: message\ndata: {...}\n\n"
  const dataLine = text.split("\n").find((l: string) => l.startsWith("data: "));
  const data = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text);
  if (data.error) throw new Error(data.error.message || "GAds MCP error");
  const resultContent = data.result?.content;
  if (Array.isArray(resultContent)) return resultContent.map((c: any) => c.text || "").join("\n");
  if (data.result?.tools) return data.result; // tools/list response
  return data.result;
}

// ── Call ScaleX Recon MCP server-side ─────────────────────────
async function callReconMCP(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const MCP_URL = "https://scalex-recon-mcp.vercel.app/api/mcp";
  const body = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: tool, arguments: args }
  };
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Recon MCP error: ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "Recon MCP error");
  const content = data.result?.content;
  if (Array.isArray(content)) {
    const text = content.find((c: any) => c.type === "text");
    try { return JSON.parse(text?.text || "{}"); } catch { return text?.text || data.result; }
  }
  return data.result;
}

// ── Call GA4 + GSC MCP server-side ───────────────────────────
async function callGA4MCP(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const MCP_URL = "https://alabs-gsc-ga-mcp.vercel.app/api/mcp";
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } };
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`GA4 MCP error: ${resp.status}`);
  const rawText = await resp.text();
  // SSE format: "event: message\ndata: {...}\n\n"
  const dataLine = rawText.split("\n").find((l: string) => l.startsWith("data: "));
  const data = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(rawText);
  if (data.error) throw new Error(data.error.message || "GA4 MCP error");
  const resultContent = data.result?.content;
  if (Array.isArray(resultContent)) {
    const text = resultContent.find((c: any) => c.type === "text");
    try { return JSON.parse(text?.text || "{}"); } catch { return text?.text || data.result; }
  }
  return data.result;
}

// ── Smart context builder — fetch the right data for the question ──
async function buildContext(userMessage: string, conversationHasData: boolean): Promise<string> {
  const t = userMessage.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const blocks: string[] = [];

  // Google Ads — campaign performance
  if (t.includes("campaign") || t.includes("spend") || t.includes("cpl") ||
      t.includes("cost per lead") || t.includes("performing") || t.includes("performance") ||
      t.includes("how many") || t.includes("best") || t.includes("worst") ||
      t.includes("roas") || t.includes("conversion") || t.includes("week over week") ||
      t.includes("week on week") || t.includes("monthly") || t.includes("budget")) {
    try {
      const data = await callGadsMCP("get_campaign_stats", { days: 30 });
      blocks.push(`[GOOGLE ADS — Campaign Stats (30d)]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[GOOGLE ADS — Campaign Stats: unavailable (${e.message})]`); }
  }

  // Google Ads — budget pacing
  if (t.includes("budget") || t.includes("pacing") || t.includes("daily") || t.includes("overspend") || t.includes("underspend")) {
    try {
      const data = await callGadsMCP("get_budget_pacing");
      blocks.push(`[GOOGLE ADS — Budget Pacing]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[GOOGLE ADS — Budget Pacing: unavailable (${e.message})]`); }
  }

  // Google Ads — keywords
  if (t.includes("keyword") || t.includes("search term") || t.includes("query") ||
      t.includes("negative") || t.includes("wasted") || t.includes("irrelevant")) {
    try {
      const data = await callGadsMCP("get_keyword_stats", { days: 30, limit: 20 });
      blocks.push(`[GOOGLE ADS — Keyword Performance (30d)]\n${JSON.stringify(data, null, 2)}`);
      const terms = await callGadsMCP("get_search_terms", { days: 30, limit: 30 });
      blocks.push(`[GOOGLE ADS — Search Terms (30d)]\n${JSON.stringify(terms, null, 2)}`);
    } catch (e: any) { blocks.push(`[GOOGLE ADS — Keywords: unavailable (${e.message})]`); }
  }

  // GA4 — website traffic, top pages, channel breakdown
  if (t.includes("traffic") || t.includes("website") || t.includes("page") ||
      t.includes("visitor") || t.includes("session") || t.includes("organic") ||
      t.includes("bounce") || t.includes("channel") || t.includes("seo") ||
      t.includes("top page") || t.includes("landing page") || t.includes("realtime")) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [pages, channels] = await Promise.all([
        callGA4MCP("ga4_get_top_pages", { startDate: thirtyAgo, endDate: today, propertyId: "342720890", limit: 10 }),
        callGA4MCP("ga4_get_channel_breakdown", { startDate: thirtyAgo, endDate: today, propertyId: "342720890" }),
      ]);
      blocks.push(`[GA4 — Top Pages (30d)]
${JSON.stringify(pages, null, 2)}`);
      blocks.push(`[GA4 — Channel Breakdown (30d)]
${JSON.stringify(channels, null, 2)}`);
    } catch (e: any) { blocks.push(`[GA4 — unavailable (${e.message})]`); }
  }

  // GA4 — realtime users
  if (t.includes("realtime") || t.includes("real time") || t.includes("live user") || t.includes("right now") || t.includes("active user")) {
    try {
      const rt = await callGA4MCP("ga4_get_realtime", { propertyId: "342720890" });
      blocks.push(`[GA4 — Realtime]
${JSON.stringify(rt, null, 2)}`);
    } catch (e: any) { blocks.push(`[GA4 — Realtime: unavailable (${e.message})]`); }
  }

  // Relay health
  if (t.includes("health") || t.includes("attach") || t.includes("ec only") ||
      t.includes("ec-only") || t.includes("gclid") || t.includes("relay") ||
      t.includes("needs_review") || t.includes("signal quality") || t.includes("upload")) {
    try {
      const data = await callReconMCP("get_relay_health", { days: 7 });
      blocks.push(`[RELAY PIPELINE — Health (7d)]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[RELAY PIPELINE — Health: unavailable (${e.message})]`); }
  }

  // Signal trend
  if (t.includes("trend") || t.includes("over time") || t.includes("improving") ||
      t.includes("week over week") || t.includes("degrading") || t.includes("30 day")) {
    try {
      const data = await callReconMCP("get_signal_quality_trend", { days: 30 });
      blocks.push(`[RELAY PIPELINE — Signal Trend (30d)]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[RELAY PIPELINE — Trend: unavailable (${e.message})]`); }
  }

  // Reconciliation
  if (t.includes("reconcil") || t.includes("vs google") || t.includes("gap") ||
      t.includes("relay ahead") || t.includes("mismatch") || t.includes("difference")) {
    try {
      const data = await callReconMCP("reconcile_relay_vs_gads", { startDate: weekAgo, endDate: today });
      blocks.push(`[RELAY PIPELINE — Reconciliation (7d)]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[RELAY PIPELINE — Reconciliation: unavailable (${e.message})]`); }
  }

  // Coverage by source
  if (t.includes("coverage") || t.includes("source") || t.includes("skip") ||
      t.includes("whatsapp") || t.includes("walk-in") || t.includes("blind spot") || t.includes("losing")) {
    try {
      const data = await callReconMCP("get_coverage_by_source", { days: 7 });
      blocks.push(`[RELAY PIPELINE — Coverage by Source (7d)]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[RELAY PIPELINE — Coverage: unavailable (${e.message})]`); }
  }

  // Batch / restatement
  if (t.includes("batch") || t.includes("landed") || t.includes("restatement") || t.includes("adjustment")) {
    try {
      const data = await callReconMCP("verify_batch_landed", { lastN: 5 });
      blocks.push(`[RELAY PIPELINE — Batch Verification]\n${JSON.stringify(data, null, 2)}`);
    } catch (e: any) { blocks.push(`[RELAY PIPELINE — Batches: unavailable (${e.message})]`); }
  }

  // Broad/overview — fetch both campaign stats + relay health as baseline
  if (blocks.length === 0 && !conversationHasData) {
    try {
      const [campaigns, health] = await Promise.all([
        callGadsMCP("get_campaign_stats", { days: 30 }),
        callReconMCP("get_relay_health", { days: 7 }),
      ]);
      blocks.push(`[GOOGLE ADS — Campaign Stats (30d)]\n${JSON.stringify(campaigns, null, 2)}`);
      blocks.push(`[RELAY PIPELINE — Health (7d)]\n${JSON.stringify(health, null, 2)}`);
    } catch { /* silent */ }
  }

  return blocks.join("\n\n");
}

const SYSTEM = `You are the ScaleX Intelligence Assistant for AnalytixLabs — an EdTech company running Google Ads to acquire Data Science students. You assist C-level executives and directors with performance questions answered from live data.

You have access to TWO live data sources injected as [LIVE DATA] blocks in messages:
1. GOOGLE ADS — campaign performance, CPL, spend, keywords, search terms, budget pacing
2. RELAY PIPELINE — GCLID attach rate, EC-only rate, signal quality, upload health, coverage by source

Key context:
- Campaigns: DS (Data Science) courses in Noida, Gurgaon, Bangalore, Delhi + Brand campaigns
- Value ladder: Lead Submitted=₹200, Signup=₹500, Qualified=₹2,000, Converted=₹10,000, Disqualified=₹1
- Primary conversion actions for Smart Bidding: lead_submitted_sclx, qualified_sclx, disqualified_sclx
- GCLID Attach Rate = % of conversions with a real Google click ID. Target: 30%+. Currently ~22-25%, improving from ~51% EC-only in May
- EC Only = Enhanced Conversions fallback (hashed email/phone). Works but weaker than GCLID for Smart Bidding
- NEEDS_REVIEW = GCLID attach below ~30%. Not a failure — actively being fixed via Stape _gcl_aw cookie route (~18 Jun activation)
- RELAY_AHEAD in reconciliation = normal (relay uploads before Google attributes). Not an incident
- Skip rate ~62-72% = expected (non-PPC sources excluded by design)
- PARTIAL_FAIL [LEGACY] = benign expired GCLIDs. Not a new problem
- GA4 website data IS available: sessions, top pages, channel breakdown (Organic/Paid/Direct), bounce rate, realtime users
- Meta Ads data is NOT currently available
- CPA shown in Google Ads = cost per conversion action (includes all Primary actions). True CPL = spend ÷ qualified leads

When answering executives:
- Lead with the key number or answer immediately — no preamble
- Use actual numbers from the live data injected in the message
- Be specific: name campaigns, cite exact figures, compare periods where data allows
- Connect relay signal quality to campaign performance where relevant
- Flag anything that needs attention clearly
- Keep it concise — executives want the point, not the explanation
- Never say you don't have data if [LIVE DATA] is present`;

export async function POST(req: NextRequest) {
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

  const { allowed, remaining } = checkRateLimit(email);
  if (!allowed) {
    return NextResponse.json({ error: `Rate limit reached — ${RATE_LIMIT} messages/hour. Try again later.` }, { status: 429 });
  }

  const { messages } = await req.json().catch(() => ({ messages: [] }));
  if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
  const conversationHasData = messages.some((m: any) => m.content?.includes("[LIVE DATA]") || m.content?.includes("[GOOGLE ADS") || m.content?.includes("[RELAY PIPELINE"));

  // Fetch relevant live data server-side (no API keys exposed to browser)
  const liveContext = await buildContext(lastUserMsg, conversationHasData);

  // Inject live data into the last user message
  const trimmed = messages.slice(-6);
  if (liveContext) {
    const lastIdx = trimmed.length - 1;
    for (let i = lastIdx; i >= 0; i--) {
      if (trimmed[i].role === "user") {
        trimmed[i] = { ...trimmed[i], content: `${trimmed[i].content}\n\n${liveContext}` };
        break;
      }
    }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SYSTEM,
      messages: trimmed,
    }),
  });

  if (!resp.ok) {
    console.error("Anthropic error:", await resp.text());
    return NextResponse.json({ error: "AI service error — please try again." }, { status: 502 });
  }

  const result = await resp.json();
  const answer = result.content?.[0]?.text ?? "No response generated.";
  return NextResponse.json({ answer, remaining_requests: remaining });
}
