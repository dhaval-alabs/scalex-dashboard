"use client";
import { useEffect, useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { coverageBySource, skipBreakdown } from "@/lib/metrics";
import { callReconMCP } from "@/lib/recon";
import { PageHeader, Card, Kpi } from "@/components/ui";

// Coverage meaning helper
function coverageIntent(source: string, coverage: number): { label: string; note: string; color: string } {
  const s = source.toLowerCase();
  if (coverage === 1) return { label: "100%", note: "Full coverage", color: "var(--green)" };
  if (coverage === 0) {
    if (s.includes("whatsapp") || s.includes("walkin") || s.includes("walk-in") || s.includes("phone") || s.includes("inbound"))
      return { label: "0%", note: "Expected — off-site lead, no GCLID", color: "var(--text4)" };
    if (s.includes("ppc-sm") || s.includes("social"))
      return { label: "0%", note: "Expected — Meta/Social, not Google Ads", color: "var(--text4)" };
    if (s.includes("organic") || s.includes("direct") || s.includes("analytixlabs") || s.includes("referral"))
      return { label: "0%", note: "Expected — non-paid source", color: "var(--text4)" };
    return { label: "0%", note: "⚠️ Verify — may be a gap", color: "var(--coral)" };
  }
  if (coverage < 0.1) return { label: `${Math.round(coverage * 100)}%`, note: "Very low — check source mapping", color: "var(--coral)" };
  if (coverage < 0.4) return { label: `${Math.round(coverage * 100)}%`, note: "Partial — some leads missing GCLID", color: "var(--amber)" };
  return { label: `${Math.round(coverage * 100)}%`, note: "Good coverage", color: "var(--green)" };
}

// Horizontal bar chart with inline labels — built without recharts so we control everything
function SkipChart({ data }: { data: { reason: string; count: number }[] }) {
  if (!data.length) return <div className="empty-msg">No skips in range</div>;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      {data.map((d) => {
        const pct = max > 0 ? (d.count / max) * 100 : 0;
        const barWide = pct > 15; // enough room to put label inside
        return (
          <div key={d.reason}>
            <div style={{ fontSize: "0.75rem", color: "var(--text3)", marginBottom: "0.2rem", fontFamily: "var(--mono)" }}>
              {d.reason}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ flex: 1, background: "var(--surface2)", borderRadius: "4px", overflow: "visible", position: "relative", height: "28px" }}>
                <div style={{
                  width: `${pct}%`, minWidth: "4px", height: "100%",
                  background: "var(--text4)", borderRadius: "4px",
                  display: "flex", alignItems: "center",
                  justifyContent: barWide ? "flex-end" : "flex-start",
                  position: "relative", transition: "width 0.4s ease",
                }}>
                  {barWide && (
                    <span style={{ color: "var(--bg)", fontSize: "0.72rem", fontWeight: 700, fontFamily: "var(--mono)", paddingRight: "8px" }}>
                      {d.count.toLocaleString()}
                    </span>
                  )}
                </div>
                {!barWide && (
                  <span style={{ position: "absolute", left: `calc(${pct}% + 8px)`, top: "50%", transform: "translateY(-50%)", color: "var(--text2)", fontSize: "0.72rem", fontWeight: 700, fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                    {d.count.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ReconciliationPage() {
  const { range, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const coverage = useMemo(() => coverageBySource(rows), [rows]);

  // Expand "Other" — don't bucket non-PPC sources together
  const skips = useMemo(() => {
    const reasons: Record<string, number> = {};
    for (const r of rows) {
      if (!r.status.startsWith("SKIP")) continue;
      let reason = "Other";
      const m = r.message.match(/Non-PPC source:\s*"([^"]*)"/);
      if (m) {
        const src = m[1] || "(blank)";
        reason = src ? `Non-PPC: ${src}` : "Non-PPC: (blank source)";
      } else if (r.message.includes("inactive")) reason = "Drop stage (inactive)";
      else if (r.status === "SKIP_DROP_STAGE") reason = "Drop stage";
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    return Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const totalSkips = skips.reduce((s, r) => s + r.count, 0);

  const [recon, setRecon] = useState<any>(null);
  const [reconErr, setReconErr] = useState<string | null>(null);
  const [reconBusy, setReconBusy] = useState(false);

  async function runReconcile() {
    setReconBusy(true); setReconErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      setRecon(await callReconMCP("reconcile_relay_vs_gads", { startDate: weekAgo, endDate: today }));
    } catch (e: any) { setReconErr(e.message); } finally { setReconBusy(false); }
  }
  useEffect(() => { runReconcile(); }, []);

  return (
    <>
      <PageHeader title="Signal Reconciliation" sub="Relay output vs Google Ads — completeness, coverage, and skip reasons" />

      {/* Relay vs GAds */}
      <Card title="Relay vs Google Ads — Last 7 Days" sub="New Lead rows uploaded vs lead_submitted conversions Google Ads recorded" fixedLabel="Fixed window · live via Recon MCP" loading={reconBusy}>
        {reconErr && <div className="empty-msg">⚠️ {reconErr}</div>}
        {recon?.daily_diff && (
          <>
            <div className="kpi-grid" style={{ marginBottom: "1rem" }}>
              <Kpi label="Relay Sent" value={recon.summary?.relay_total_sent} foot="New Lead rows uploaded" accent="var(--teal)" />
              <Kpi label="GAds Received" value={recon.summary?.gads_total_received} foot="lead_submitted_sclx recorded" accent="var(--purple)" />
              <Kpi label="Gap" value={recon.summary?.gap_pct} foot="expected — attribution lag" accent="var(--amber)" />
              <Kpi label="Health" value={recon.summary?.health} foot="RELAY_AHEAD = normal" accent="var(--green)" />
            </div>
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th className="num">Relay sent</th><th className="num">GAds received</th><th>Status</th><th>What it means</th></tr>
              </thead>
              <tbody>
                {recon.daily_diff.map((r: any) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td className="num">{r.relay_total_sent}</td>
                    <td className="num">{r.gads_lead_submitted}</td>
                    <td>{r.status}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text4)" }}>
                      {r.status === "⚠️ RELAY_AHEAD" ? "Normal — GAds attributes over 90d window" :
                       r.status === "✅ OK" ? "Balanced" :
                       r.status?.includes("GADS_AHEAD") ? "⚠️ Check relay logs" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {/* Coverage by Source */}
      <Card title="Coverage by Source" sub="How many leads per source reached Google Ads vs were intentionally skipped" loading={loading}>
        <table className="tbl">
          <thead>
            <tr><th>Source</th><th className="num">Total leads</th><th className="num">Reached GAds</th><th className="num">Skipped</th><th>Coverage</th><th>What this means</th></tr>
          </thead>
          <tbody>
            {coverage.slice(0, 16).map((c) => {
              const intent = coverageIntent(c.source, c.coverage);
              return (
                <tr key={c.source}>
                  <td>{c.source}</td>
                  <td className="num">{c.total}</td>
                  <td className="num">{c.reached}</td>
                  <td className="num">{c.skipped}</td>
                  <td><span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 700, color: intent.color }}>{intent.label}</span></td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text4)" }}>{intent.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: "0.9rem", padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", fontSize: "0.78rem", color: "var(--text4)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text3)" }}>Reading this table:</strong> 0% is expected for WhatsApp, walk-ins, social (PPC-SM), and phone leads — these sources don't carry a Google click ID. Only Google Search/Display PPC sources should reach 30%+. The goal is improving GCLID attach within PPC sources, not eliminating 0% rows.
        </div>
      </Card>

      {/* Skip breakdown */}
      <Card title="Skip-Reason Breakdown" sub={`Why ${totalSkips.toLocaleString()} rows were skipped in this range — all expected, none are errors`} loading={loading}>
        <SkipChart data={skips} />
        <div style={{ marginTop: "0.9rem", padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", fontSize: "0.78rem", color: "var(--text4)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text3)" }}>Why skips are fine:</strong> The relay is designed to upload only Google Ads PPC leads. Everything else (social, WhatsApp, phone, organic, walk-in) is intentionally excluded — uploading these would pollute Smart Bidding with unconvertible traffic. A high skip count means AnalytixLabs gets a lot of non-PPC traffic, not that the relay is broken.
        </div>
      </Card>
    </>
  );
}
