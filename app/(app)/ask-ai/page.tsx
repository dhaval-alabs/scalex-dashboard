"use client";
import { useState, useRef, useEffect } from "react";
import { callReconMCP } from "@/lib/recon";
import { PageHeader } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string; data?: any; tool?: string; }

// Map a natural-language question to a Recon MCP tool + args.
// (Heuristic router — the Recon MCP tools are deterministic, so we map intent → tool.)
function routeQuestion(q: string): { tool: string; args: Record<string, unknown>; label: string } | null {
  const t = q.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  if (t.includes("health") || t.includes("attach") || t.includes("ec-only") || t.includes("ec only")) return { tool: "get_relay_health", args: { days: 7 }, label: "Relay health (7d)" };
  if (t.includes("reconcile") || t.includes("vs gads") || t.includes("vs google") || t.includes("match")) return { tool: "reconcile_relay_vs_gads", args: { startDate: weekAgo, endDate: today }, label: "Reconcile relay vs GAds" };
  if (t.includes("coverage") || t.includes("source") || t.includes("hole") || t.includes("blind")) return { tool: "get_coverage_by_source", args: { days: 7 }, label: "Coverage by source" };
  if (t.includes("trend") || t.includes("quality") || t.includes("over time") || t.includes("improving")) return { tool: "get_signal_quality_trend", args: { days: 30 }, label: "Signal quality trend" };
  if (t.includes("batch") || t.includes("landed") || t.includes("restatement") || t.includes("upload")) return { tool: "verify_batch_landed", args: { lastN: 5 }, label: "Verify batch landed" };
  return null;
}

const QUICK = [
  "What's the relay health right now?",
  "Reconcile relay vs Google Ads",
  "Show me coverage by source",
  "Is signal quality improving over time?",
  "Did the latest batches land in Google Ads?",
  "Where are we losing GCLID coverage?",
];

export default function AskAiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    const route = routeQuestion(q);
    if (!route) {
      setMsgs((m) => [...m, { role: "assistant", content: "I can answer questions about relay health, reconciliation, coverage by source, signal-quality trend, and batch verification. Try one of the quick questions below." }]);
      setBusy(false);
      return;
    }
    try {
      const data = await callReconMCP(route.tool, route.args);
      setMsgs((m) => [...m, { role: "assistant", content: `Here's what I found via **${route.label}**:`, data, tool: route.tool }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠️ " + (e.message || "Recon MCP call failed") }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Ask AI" sub="Conversational analytics powered by the ScaleX Recon engine" />

      <div className="card" style={{ background: "var(--teal-dim)", border: "1px solid var(--teal)", color: "var(--teal)", fontSize: "0.82rem", padding: "0.7rem 1rem" }}>
        Live mode — questions are answered directly from the ScaleX Recon MCP against production relay + Google Ads data. The date range in the sidebar applies to the dashboard pages; Ask AI queries its own windows per tool.
      </div>

      {msgs.length === 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Quick questions</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            {QUICK.map((q) => (
              <div key={q} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "0.7rem 0.9rem" }} onClick={() => ask(q)}>{q}</div>
            ))}
          </div>
        </div>
      )}

      {msgs.map((m, i) => (
        <div key={i} style={{ marginBottom: "1rem", display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
          <div style={{ maxWidth: "80%" }}>
            {m.role === "user" ? (
              <div style={{ background: "var(--teal)", color: "#fff", padding: "0.6rem 0.9rem", borderRadius: "12px 12px 2px 12px", fontSize: "0.88rem" }}>{m.content}</div>
            ) : (
              <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ fontSize: "0.88rem", marginBottom: m.data ? "0.7rem" : 0 }} dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                {m.data && <ReconResult tool={m.tool!} data={m.data} />}
              </div>
            )}
          </div>
        </div>
      ))}
      {busy && <div className="loading-msg">Thinking…</div>}
      <div ref={endRef} />

      <div style={{ position: "sticky", bottom: 0, paddingTop: "0.5rem", background: "var(--bg)" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
            placeholder="Ask about relay health, reconciliation, coverage…"
            style={{ flex: 1, padding: "0.7rem 0.9rem", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", color: "var(--text)", fontFamily: "var(--font)", fontSize: "0.88rem" }}
          />
          <button className="btn" style={{ background: "var(--teal)", color: "#fff", border: "none", padding: "0 1.2rem" }} onClick={() => ask(input)} disabled={busy}>Send</button>
        </div>
      </div>
    </>
  );
}

function ReconResult({ tool, data }: { tool: string; data: any }) {
  if (typeof data === "string") return <pre style={{ fontSize: "0.75rem", whiteSpace: "pre-wrap", color: "var(--text3)" }}>{data}</pre>;

  if (tool === "get_relay_health") {
    return (
      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <Kpi2 label="GCLID Attach" value={data.rates?.gclid_attach_rate} />
        <Kpi2 label="EC Only" value={data.rates?.ec_only_rate} />
        <Kpi2 label="Error Rate" value={data.rates?.error_rate} />
        <Kpi2 label="Total Rows" value={data.total_rows} />
        <Kpi2 label="Health" value={data.health} />
      </div>
    );
  }
  if (tool === "reconcile_relay_vs_gads") {
    const rows = data.daily_diff || [];
    return (
      <table className="tbl">
        <thead><tr><th>Date</th><th className="num">Relay</th><th className="num">GAds</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.date}><td>{r.date}</td><td className="num">{r.relay_total_sent}</td><td className="num">{r.gads_lead_submitted}</td><td>{r.status}</td></tr>)}</tbody>
      </table>
    );
  }
  if (tool === "get_coverage_by_source") {
    const rows = data.sources || data.coverage || [];
    return (
      <table className="tbl">
        <thead><tr><th>Source</th><th className="num">Total</th><th className="num">Reached</th><th>Coverage</th></tr></thead>
        <tbody>{rows.slice(0, 12).map((r: any, i: number) => <tr key={i}><td>{r.source || r.stage}</td><td className="num">{r.total ?? r.total_leads}</td><td className="num">{r.reached ?? r.reaching_gads}</td><td>{r.coverage_pct || r.coverage}</td></tr>)}</tbody>
      </table>
    );
  }
  return <pre style={{ fontSize: "0.72rem", whiteSpace: "pre-wrap", color: "var(--text3)", maxHeight: 300, overflow: "auto" }}>{JSON.stringify(data, null, 2)}</pre>;
}

function Kpi2({ label, value }: { label: string; value: any }) {
  return (
    <div className="kpi" style={{ borderTop: "2px solid var(--teal)" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: "1.1rem" }}>{value ?? "—"}</div>
    </div>
  );
}
