"use client";
import { useEffect, useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { coverageBySource, skipBreakdown } from "@/lib/metrics";
import { callReconMCP } from "@/lib/recon";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { BarSeries } from "@/components/charts";

export default function ReconciliationPage() {
  const { range, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const coverage = useMemo(() => coverageBySource(rows), [rows]);
  const skips = useMemo(() => skipBreakdown(rows), [rows]);

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

  const zeroCoverage = coverage.filter((c) => c.reached === 0 && c.total >= 3);

  return (
    <>
      <PageHeader title="Signal Reconciliation" sub="Relay output vs Google Ads — completeness, coverage, and skip reasons" />

      <Card title="Relay vs Google Ads — Last 7 Days" sub="New Lead rows the relay sent vs lead_submitted Google received (live via Recon MCP)" fixedLabel="Fixed · last 7 days · live recon" loading={reconBusy}>
        {reconErr && <div className="empty-msg">⚠️ {reconErr}</div>}
        {recon?.daily_diff && (
          <>
            <div className="kpi-grid" style={{ marginBottom: "1rem" }}>
              <Kpi label="Relay Sent" value={recon.summary?.relay_total_sent} accent="var(--teal)" />
              <Kpi label="GAds Received" value={recon.summary?.gads_total_received} accent="var(--purple)" />
              <Kpi label="Gap" value={recon.summary?.gap_pct} accent="var(--amber)" />
              <Kpi label="Health" value={recon.summary?.health} accent="var(--green)" />
            </div>
            <table className="tbl">
              <thead><tr><th>Date</th><th className="num">Relay</th><th className="num">GAds</th><th>Status</th></tr></thead>
              <tbody>{recon.daily_diff.map((r: any) => <tr key={r.date}><td>{r.date}</td><td className="num">{r.relay_total_sent}</td><td className="num">{r.gads_lead_submitted}</td><td>{r.status}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </Card>

      <Card title="Coverage by Source" sub="Leads per source and how many reached Google Ads (current range)" loading={loading}>
        <table className="tbl">
          <thead><tr><th>Source</th><th className="num">Total</th><th className="num">Reached</th><th className="num">Skipped</th><th>Coverage</th></tr></thead>
          <tbody>
            {coverage.slice(0, 14).map((c) => (
              <tr key={c.source}>
                <td>{c.source}</td><td className="num">{c.total}</td><td className="num">{c.reached}</td><td className="num">{c.skipped}</td>
                <td><span className={"badge " + (c.coverage > 0.5 ? "green" : c.coverage > 0 ? "amber" : "coral")}>{Math.round(c.coverage * 100)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {zeroCoverage.length > 0 && (
        <Card title="⚠️ Zero-Coverage Sources" sub="Sources with leads but zero reaching Google Ads — confirm intentional vs miss">
          <table className="tbl">
            <thead><tr><th>Source</th><th className="num">Leads</th></tr></thead>
            <tbody>{zeroCoverage.map((c) => <tr key={c.source}><td>{c.source}</td><td className="num">{c.total}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      <Card title="Skip-Reason Breakdown" sub="Why rows were skipped (parsed from relay message)" loading={loading}>
        {skips.length ? <BarSeries data={skips.slice(0, 8)} xKey="reason" yKey="count" color="var(--text4)" horizontal height={Math.max(200, skips.slice(0,8).length * 36)} /> : <div className="empty-msg">No skips in range</div>}
      </Card>
    </>
  );
}
