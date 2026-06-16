"use client";
import { useState, useRef, useEffect } from "react";
import { callReconMCP } from "@/lib/recon";
import { PageHeader } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

// Map intent → Recon MCP tool
function routeToTool(q: string): { tool: string; args: Record<string, unknown>; label: string } | null {
  const t = q.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  if (t.includes("health") || t.includes("attach") || t.includes("ec-only") || t.includes("ec only") || t.includes("gclid rate"))
    return { tool: "get_relay_health", args: { days: 7 }, label: "Relay Health (7d)" };
  if (t.includes("reconcil") || t.includes("vs gads") || t.includes("vs google") || t.includes("match") || t.includes("gap"))
    return { tool: "reconcile_relay_vs_gads", args: { startDate: weekAgo, endDate: today }, label: "Relay vs GAds (7d)" };
  if (t.includes("coverage") || t.includes("source") || t.includes("hole") || t.includes("blind") || t.includes("skip"))
    return { tool: "get_coverage_by_source", args: { days: 7 }, label: "Coverage by Source" };
  if (t.includes("trend") || t.includes("quality") || t.includes("over time") || t.includes("improving") || t.includes("week"))
    return { tool: "get_signal_quality_trend", args: { days: 30 }, label: "Signal Quality Trend (30d)" };
  if (t.includes("batch") || t.includes("landed") || t.includes("restatement") || t.includes("upload") || t.includes("adjustment"))
    return { tool: "verify_batch_landed", args: { lastN: 5 }, label: "Batch Verification" };
  return null;
}

const QUICK = [
  "What's the relay health right now?",
  "Reconcile relay vs Google Ads this week",
  "Show me coverage by source",
  "Is signal quality improving over time?",
  "Did the latest restatement batches land?",
  "Where are we losing GCLID coverage?",
];

// System prompt for Claude
const SYSTEM = `You are the ScaleX Intelligence Assistant for AnalytixLabs — an EdTech company using server-side conversion tracking to reduce their Google Ads Cost Per Lead.

You have access to live data from the ScaleX Relay pipeline — a Google Apps Script relay that sends CRM stage changes (LSQ) as offline conversions to Google Ads via sGTM. 

Key context:
- The relay sends PPC leads only (non-PPC sources are skipped — this is expected, not a bug)
- GCLID Attach Rate = conversions sent with a real Google click ID (good signal for Smart Bidding)
- EC Only = conversions matched via Enhanced Conversions (hashed email/phone) when no GCLID exists
- NEEDS_REVIEW health status = GCLID attach rate below ~30% (currently improving from ~51% EC-only in May to ~25% EC-only now)
- Value ladder: Lead Submitted=₹200, Signup=₹500, Qualified=₹2000, Converted=₹10000, Disqualified=₹1
- Primary conversion actions: lead_submitted_sclx, qualified_sclx, disqualified_sclx
- The _gcl_aw cookie route (Stape) is pending activation ~18 Jun — will further improve GCLID attach rate
- RELAY_AHEAD in reconciliation = normal (relay uploads ahead of Google's attribution window)
- GADS_AHEAD = potential issue worth investigating

When you receive tool data, interpret it clearly. Explain what the numbers mean, whether they are good or bad, what is causing them, and what (if anything) needs attention. Be concise but specific. If someone asks a follow-up question, answer it conversationally using the data already in context. Never just repeat raw numbers without interpretation.`;

export default function AskAiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: Msg = { role: "user", content: question };
    const loadingMsg: Msg = { role: "assistant", content: "", isLoading: true };
    setMsgs((m) => [...m, userMsg, loadingMsg]);

    try {
      // Build conversation history for Claude (exclude the loading placeholder)
      const history = [...msgs, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Check if we should fetch fresh tool data
      const route = routeToTool(question);
      let toolContext = "";

      if (route) {
        try {
          const data = await callReconMCP(route.tool, route.args);
          toolContext = `\n\n[LIVE DATA — ${route.label}]\n${JSON.stringify(data, null, 2)}`;
        } catch (e: any) {
          toolContext = `\n\n[Tool fetch failed: ${e.message}]`;
        }
      }

      // Build the final user message with tool data injected
      const finalUserContent = toolContext
        ? `${question}${toolContext}`
        : question;

      // Replace last user message with tool-enriched version
      const claudeMessages = [
        ...history.slice(0, -1),
        { role: "user", content: finalUserContent },
      ];

      // Call Claude API
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: SYSTEM,
          messages: claudeMessages,
        }),
      });

      const result = await resp.json();
      const answer = result.content?.[0]?.text || "Sorry, I couldn't generate a response.";

      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMsgs((m) => [...m.slice(0, -1), {
        role: "assistant",
        content: `⚠️ Error: ${e.message || "Something went wrong. Please try again."}`,
      }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <>
      <PageHeader title="Ask AI" sub="Conversational analytics powered by the ScaleX Recon engine" />

      <div style={{ background: "var(--teal-dim)", border: "1px solid var(--teal)", color: "var(--teal)", fontSize: "0.82rem", padding: "0.7rem 1rem", borderRadius: "var(--radius2)", marginBottom: "1.25rem" }}>
        Live mode — questions pull real data from the ScaleX Recon MCP + Google Ads. Ask follow-ups naturally — the AI maintains conversation context.
      </div>

      {msgs.length === 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Quick questions</div><div className="card-sub">Click any question or type your own below</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            {QUICK.map((q) => (
              <div key={q} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "0.7rem 0.9rem", cursor: "pointer" }} onClick={() => ask(q)}>
                {q}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "6rem" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "user" ? (
              <div style={{ maxWidth: "70%", background: "var(--teal)", color: "#fff", padding: "0.65rem 1rem", borderRadius: "16px 16px 4px 16px", fontSize: "0.88rem", lineHeight: 1.5 }}>
                {m.content}
              </div>
            ) : (
              <div style={{ maxWidth: "80%" }} className={m.isLoading ? "card shimmer" : "card"} >
                {m.isLoading ? (
                  <div style={{ color: "var(--text4)", fontSize: "0.85rem", padding: "0.25rem 0" }}>Thinking…</div>
                ) : (
                  <div style={{ fontSize: "0.88rem", lineHeight: 1.7, color: "var(--text2)", whiteSpace: "pre-wrap" }}>
                    {m.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Sticky input */}
      <div style={{ position: "fixed", bottom: 0, left: "var(--sidebar-w)", right: 0, padding: "1rem 2rem", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "0.5rem", maxWidth: "900px" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder="Ask about relay health, CPL trends, coverage gaps, what NEEDS_REVIEW means…"
            disabled={busy}
            style={{ flex: 1, padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", color: "var(--text)", fontFamily: "var(--font)", fontSize: "0.88rem", outline: "none" }}
          />
          <button
            className="btn"
            style={{ background: busy ? "var(--surface2)" : "var(--teal)", color: busy ? "var(--text4)" : "#fff", border: "none", padding: "0 1.4rem", borderRadius: "var(--radius2)", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600 }}
            onClick={() => ask(input)}
            disabled={busy}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
