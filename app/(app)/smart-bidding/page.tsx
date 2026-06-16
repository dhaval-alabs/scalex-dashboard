"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { biddingMaturity, summarize } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { BarSeries } from "@/components/charts";

export default function SmartBiddingPage() {
  const { range, rangeLabel, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const maturity = useMemo(() => biddingMaturity(rows), [rows]);
  const s = useMemo(() => summarize(rows), [rows]);

  return (
    <>
      <PageHeader title="Smart Bidding Maturity" sub="Conversion volume per _sclx action — the signal feeding Google's bid strategy" />
      <div className="kpi-grid">
        <Kpi label="Lead Submitted" value={s.byConv.lead_submitted || 0} foot="₹200 · Primary" accent="var(--teal)" />
        <Kpi label="Qualified" value={s.byConv.qualified || 0} foot="₹2,000 · Primary" accent="var(--green)" />
        <Kpi label="Disqualified" value={s.byConv.disqualified || 0} foot="₹1 · Primary (Every)" accent="var(--coral)" />
        <Kpi label="Signup" value={s.byConv.signup || 0} foot="₹500 · Secondary" accent="var(--purple)" />
        <Kpi label="Converted" value={s.byConv.converted || 0} foot="₹10,000 · Secondary" accent="var(--amber)" />
      </div>
      <Card title="Conversion Volume by Action" sub="Per-action counts in the selected range — Smart Bidding needs sufficient volume per Primary action to learn" dateLabel={rangeLabel} loading={loading}>
        {maturity.length ? <BarSeries data={maturity} xKey="label" yKey="count" color="var(--teal)" horizontal height={Math.max(220, maturity.length * 44)} /> : <div className="empty-msg">No conversions in range</div>}
      </Card>
      <Card title="Value Ladder (v9.1)" sub="Proxy values assigned per stage">
        <table className="tbl">
          <thead><tr><th>Bucket</th><th className="num">Proxy Value</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td>Lead Submitted</td><td className="num">₹200</td><td><span className="badge teal">Primary</span></td></tr>
            <tr><td>Signup</td><td className="num">₹500</td><td><span className="badge amber">Secondary</span></td></tr>
            <tr><td>Qualified</td><td className="num">₹2,000</td><td><span className="badge teal">Primary</span></td></tr>
            <tr><td>Converted</td><td className="num">₹10,000</td><td><span className="badge amber">Secondary</span></td></tr>
            <tr><td>Disqualified</td><td className="num">₹1</td><td><span className="badge coral">Primary · Every</span></td></tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}
