"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { LineTrend } from "@/components/charts";

export default function CPLTrendPage() {
  const { rangeLabel, gads, loading } = useApp();
  const weekly = useMemo(
    () => (gads?.weekly_cpl || []).map((v, i) => ({ week: "W" + (i + 1), cpl: v })).filter((d) => d.cpl != null),
    [gads]
  );
  const cplDelta = gads && gads.prev_cpl ? gads.cpl - gads.prev_cpl : null;

  return (
    <>
      <PageHeader title="CPL Trend" sub="Cost per lead over time — before/after ScaleX server-side activation" />
      <div className="kpi-grid">
        <Kpi label="Current CPL" value={gads ? "₹" + gads.cpl : "—"} foot={rangeLabel} accent="var(--teal)" />
        <Kpi label="Prior Period CPL" value={gads?.prev_cpl ? "₹" + gads.prev_cpl : "—"} foot="same length, prior window" accent="var(--purple)" />
        <Kpi label="Change" value={cplDelta != null ? (cplDelta <= 0 ? "▼ ₹" + Math.abs(cplDelta) : "▲ ₹" + cplDelta) : "—"} foot={cplDelta != null && cplDelta <= 0 ? "improving" : "watch"} accent={cplDelta != null && cplDelta <= 0 ? "var(--green)" : "var(--coral)"} />
        <Kpi label="Total Spend" value={gads ? "₹" + gads.total_spend_lakh + "L" : "—"} foot={rangeLabel} accent="var(--amber)" />
      </div>
      <Card title="Weekly CPL — Last 12 Weeks" sub="Trailing 12-week cost-per-lead from Google Ads" dateLabel="Fixed · trailing 12 weeks" loading={loading}>
        {weekly.length ? <LineTrend data={weekly} xKey="week" yKey="cpl" color="var(--teal)" height={320} /> : <div className="empty-msg">Loading Google Ads data…</div>}
      </Card>
    </>
  );
}
