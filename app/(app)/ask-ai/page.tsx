"use client";
import { useState, useRef, useEffect } from "react";
import { callReconMCP } from "@/lib/recon";
import { PageHeader } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string; isLoading?: boolean; data?: any; tool?: string; }

function routeToTool(q: string): { tool: string; args: Record<string, unknown>; label: string } | null {
  const t = q.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  if (t.includes("health") || t.includes("attach") || t.includes("ec only") || t.includes("ec-only") || t.includes("gclid rate"))
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

// Render markdown-ish text: bold, bullets, ## headers
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: "0.88rem", lineHeight: 1.75, color: "var(--text2)" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: "0.5rem" }} />;
        // ## header
        if (trimmed.startsWith("## ")) {
          return <div key={i} style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)", marginBottom: "0.35rem", marginTop: i > 0 ? "0.75rem" : 0 }}>{trimmed.slice(3)}</div>;
        }
        // bullet
        if (trimmed.startsWith("- ")) {
          return (
            <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.2rem" }}>
              <span style={{ color: "var(--teal)", marginTop: "2px", flexShrink: 0 }}>▸</span>
              <span dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }} />
            </div>
          );
        }
        // normal line with bold
        return (
          <div key={i} style={{ marginBottom: "0.15rem" }}
            dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }} />
        );
      })}
    </div>
  );
}

// Mini KPI cards for tool data
function DataCards({ tool, data }: { tool: string; data: any }) {
  if (tool === "get_relay_health") {
    const cards = [
      { label: "GCLID Attach", value: data.rates?.gclid_attach_rate, accent: "var(--teal)" },
      { label: "EC Only", value: data.rates?.ec_only_rate, accent: "var(--amber)" },
      { label: "Error Rate", value: data.rates?.error_rate, accent: "var(--coral)" },
      { label: "Total Rows (7d)", value: data.total_rows, accent: "var(--purple)" },
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.5rem", marginBottom: "0.9rem" }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "var(--surface2)", borderRadius: "var(--radius3)", padding: "0.6rem 0.75rem", borderTop: `2px solid ${c.accent}` }}>
            <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text4)", fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.2rem", color: "var(--text)" }}>{c.value ?? "—"}</div>
          </div>
        ))}
      </div>
    );
  }
  if (tool === "reconcile_relay_vs_gads" && data.daily_diff) {
    return (
      <div style={{ marginBottom: "0.9rem", overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: "0.78rem" }}>
          <thead><tr><th>Date</th><th className="num">Relay</th><th className="num">GAds</th><th>Status</th></tr></thead>
          <tbody>{data.daily_diff.slice(0,7).map((r: any) => (
            <tr key={r.date}><td>{r.date}</td><td className="num">{r.relay_total_sent}</td><td className="num">{r.gads_lead_submitted}</td><td style={{ fontSize: "0.75rem" }}>{r.status}</td></tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
  if (tool === "get_coverage_by_source") {
    const rows = data.sources || data.coverage || [];
    return (
      <div style={{ marginBottom: "0.9rem", overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: "0.78rem" }}>
          <thead><tr><th>Source</th><th className="num">Total</th><th className="num">Reached</th><th>Coverage</th></tr></thead>
          <tbody>{rows.slice(0,8).map((r: any, i: number) => (
            <tr key={i}><td>{r.source || r.stage}</td><td className="num">{r.total ?? r.total_leads}</td><td className="num">{r.reached ?? r.reaching_gads}</td><td>{r.coverage_pct || r.coverage}</td></tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function AskAiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: Msg = { role: "user", content: question };
    setMsgs((m) => [...m, userMsg, { role: "assistant", content: "", isLoading: true }]);

    try {
      const route = routeToTool(question);
      let finalContent = question;
      let toolData: any = null;
      let toolName = "";

      if (route) {
        try {
          toolData = await callReconMCP(route.tool, route.args);
          toolName = route.tool;
          finalContent = `${question}\n\n[LIVE DATA — ${route.label}]\n${JSON.stringify(toolData, null, 2)}`;
        } catch (e: any) {
          finalContent = `${question}\n\n[Could not fetch ${route.label}: ${e.message}]`;
        }
      }

      const history = [...msgs, userMsg].map((m) => ({
        role: m.role,
        content: m.role === "user" && m === userMsg ? finalContent : m.content,
      }));

      const resp = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (resp.status === 401) throw new Error("Session expired — please sign in again.");
      if (resp.status === 429) { const d = await resp.json(); throw new Error(d.error); }
      if (!resp.ok) throw new Error("AI service error. Please try again.");

      const data = await resp.json();
      if (data.remaining_requests !== undefined) setRemaining(data.remaining_requests);

      setMsgs((m) => [...m.slice(0, -1), {
        role: "assistant",
        content: data.answer,
        data: toolData,
        tool: toolName,
      }]);
    } catch (e: any) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠️ ${e.message || "Something went wrong."}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <>
      <PageHeader title="Ask AI" sub="Conversational analytics powered by the ScaleX Recon engine" />

      <div style={{ background: "var(--teal-dim)", border: "1px solid var(--teal)", color: "var(--teal)", fontSize: "0.82rem", padding: "0.7rem 1rem", borderRadius: "var(--radius2)", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Live mode — pulls real Recon MCP data, interpreted by AI. Ask follow-ups naturally.</span>
        {remaining !== null && <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", opacity: 0.8 }}>{remaining} requests left this hour</span>}
      </div>

      {msgs.length === 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Quick questions</div><div className="card-sub">Click any question or type your own below</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            {QUICK.map((q) => (
              <div key={q} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "0.7rem 0.9rem", cursor: "pointer" }} onClick={() => ask(q)}>{q}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "6rem" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "user" ? (
              // User bubble — dark surface, readable text
              <div style={{ maxWidth: "70%", background: "var(--surface2)", color: "var(--text)", padding: "0.65rem 1rem", borderRadius: "16px 16px 4px 16px", fontSize: "0.88rem", lineHeight: 1.5, border: "1px solid var(--border2)" }}>
                {m.content}
              </div>
            ) : (
              <div style={{ maxWidth: "85%" }} className={m.isLoading ? "card shimmer" : "card"}>
                {m.isLoading ? (
                  <div style={{ color: "var(--text4)", fontSize: "0.85rem", padding: "0.25rem 0" }}>Thinking…</div>
                ) : (
                  <>
                    {/* Data cards first if tool was called */}
                    {m.data && m.tool && <DataCards tool={m.tool} data={m.data} />}
                    {/* Then the AI interpretation */}
                    <RenderMarkdown text={m.content} />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "var(--sidebar-w)", right: 0, padding: "1rem 2rem", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "0.5rem", maxWidth: "900px" }}>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder="Ask about relay health, CPL, coverage gaps, what NEEDS_REVIEW means…"
            disabled={busy}
            style={{ flex: 1, padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", color: "var(--text)", fontFamily: "var(--font)", fontSize: "0.88rem", outline: "none" }}
          />
          <button className="btn"
            style={{ background: busy ? "var(--surface2)" : "var(--teal)", color: busy ? "var(--text4)" : "#fff", border: "none", padding: "0 1.4rem", borderRadius: "var(--radius2)", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600 }}
            onClick={() => ask(input)} disabled={busy}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
