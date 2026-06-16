"use client";
import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string; isLoading?: boolean; }

const QUICK = [
  "How many campaigns are running and which performs best?",
  "What's my total spend and CPL this month?",
  "What's the relay health right now?",
  "Show me coverage by source",
  "Which keywords are wasting budget?",
  "Is signal quality improving over time?",
  "Reconcile relay vs Google Ads this week",
  "What's my budget pacing today?",
];

function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: "0.88rem", lineHeight: 1.75, color: "var(--text2)" }}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: "0.4rem" }} />;
        if (t.startsWith("### "))
          return <div key={i} style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)", margin: "0.6rem 0 0.2rem" }}>{t.slice(4)}</div>;
        if (t.startsWith("## "))
          return <div key={i} style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)", margin: "0.75rem 0 0.25rem" }}>{t.slice(3)}</div>;
        if (t.startsWith("- ") || t.startsWith("• "))
          return (
            <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.2rem" }}>
              <span style={{ color: "var(--teal)", flexShrink: 0, marginTop: "2px" }}>▸</span>
              <span dangerouslySetInnerHTML={{ __html: t.slice(2).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }} />
            </div>
          );
        return (
          <div key={i} style={{ marginBottom: "0.1rem" }}
            dangerouslySetInnerHTML={{ __html: t.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }} />
        );
      })}
    </div>
  );
}

export default function AskAiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
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
      // Send full conversation history — backend handles all data fetching
      const history = [...msgs, userMsg].map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (resp.status === 401) throw new Error("Session expired — please sign in again.");
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || "AI service error. Please try again.");
      }

      const data = await resp.json();
      if (data.remaining_requests !== undefined) setRemaining(data.remaining_requests);
      setLastUpdated(new Date().toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }));

      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: data.answer }]);
    } catch (e: any) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠️ ${e.message || "Something went wrong."}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <>
      <PageHeader title="Ask AI" sub="Live Google Ads + relay intelligence — powered by ScaleX" />

      {/* Status bar */}
      <div style={{ background: "var(--teal-dim)", border: "1px solid var(--teal)", color: "var(--teal)", fontSize: "0.8rem", padding: "0.65rem 1rem", borderRadius: "var(--radius2)", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
            Google Ads live
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
            Relay pipeline live
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text4)", display: "inline-block" }} />
            Meta Ads (not connected)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text4)", display: "inline-block" }} />
            GA4 (not connected)
          </span>
        </div>
        {remaining !== null && <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", opacity: 0.8 }}>{remaining} requests left this hour</span>}
      </div>

      {/* Quick questions */}
      {msgs.length === 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ask anything about AnalytixLabs performance</div>
            <div className="card-sub">Pulls live data from Google Ads and the ScaleX relay pipeline</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {QUICK.map((q) => (
              <div key={q} className="btn"
                style={{ justifyContent: "flex-start", textAlign: "left", padding: "0.65rem 0.9rem", cursor: "pointer", fontSize: "0.82rem" }}
                onClick={() => ask(q)}>
                {q}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "6rem" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "user" ? (
              <div style={{ maxWidth: "70%", background: "var(--surface2)", color: "var(--text)", padding: "0.65rem 1rem", borderRadius: "16px 16px 4px 16px", fontSize: "0.88rem", lineHeight: 1.5, border: "1px solid var(--border2)" }}>
                {m.content}
              </div>
            ) : (
              <div style={{ maxWidth: "85%" }} className={m.isLoading ? "card shimmer" : "card"}>
                {m.isLoading
                  ? <div style={{ color: "var(--text4)", fontSize: "0.85rem", padding: "0.25rem 0" }}>Fetching live data and thinking…</div>
                  : <RenderMarkdown text={m.content} />
                }
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Sticky input */}
      <div style={{ position: "fixed", bottom: 0, left: "var(--sidebar-w)", right: 0, padding: "1rem 2rem", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
        {lastUpdated && <div style={{ fontSize: "0.65rem", color: "var(--text4)", marginBottom: "0.4rem", fontFamily: "var(--mono)" }}>Last response: {lastUpdated}</div>}
        <div style={{ display: "flex", gap: "0.5rem", maxWidth: "900px" }}>
          <input ref={inputRef} value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder="Ask about campaigns, CPL, keywords, relay health, budget pacing…"
            disabled={busy}
            style={{ flex: 1, padding: "0.75rem 1rem", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", color: "var(--text)", fontFamily: "var(--font)", fontSize: "0.88rem", outline: "none" }}
          />
          <button className="btn"
            style={{ background: busy ? "var(--surface2)" : "var(--teal)", color: busy ? "var(--text4)" : "#fff", border: "none", padding: "0 1.4rem", borderRadius: "var(--radius2)", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.88rem" }}
            onClick={() => ask(input)} disabled={busy}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
