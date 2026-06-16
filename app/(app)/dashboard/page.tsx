"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { summarize, ecRecoveryDaily } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { AreaTrend, LineTrend } from "@/components/charts";

export default function DashboardPage() {
  const { range, rangeLabel, relayRows, gads, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const s = useMemo(() => summarize(rows), [rows]);
  const ecDaily = useMemo(() => ecRecoveryDaily(rows), [rows]);

  const weeklyCpl = useMemo(
    () => (gads?.weekly_cpl || []).map((v, i) => ({ week: "W" + (i + 1), cpl: v })).filter((d) => d.cpl != null),
    [gads]
  );

  return (
    <>
      <PageHeader title="Performance Overview" sub="Server-side conversion intelligence · live" />

      <div className="kpi-grid" id="card-kpis">
        <Kpi label="Total Conversions" value={gads ? gads.total_conversions.toLocaleString() : "—"} foot={`${gads?.total_clicks?.toLocaleString() || "—"} clicks`} accent="var(--teal)" />
        <Kpi label="Cost Per Lead" value={gads ? "₹" + gads.cpl : "—"} foot={`${gads?.qualified_leads || "—"} qualified`} accent="var(--green)" />
        <Kpi label="Ad Spend" value={gads ? "₹" + gads.total_spend_lakh + "L" : "—"} foot={`₹${gads?.total_spend?.toLocaleString() || "—"} total`} accent="var(--purple)" />
        <Kpi label="CRM Conversions Sent" value={s.reached.toLocaleString()} foot={`${s.success} gclid · ${s.ecOnly} EC`} accent="var(--teal)" />
        <Kpi label="GCLID Attach" value={Math.round(s.gclidAttachRate * 100) + "%"} foot={`${s.success} of ${s.reached} reached`} accent="var(--amber)" />
        <Kpi label="EC Only" value={Math.round(s.ecOnlyRate * 100) + "%"} foot={`${s.ecOnly} matched by EC`} accent="var(--coral)" />
      </div>

      <Card title="EC Recovery — Daily" sub="% of conversions recovered via Enhanced Conversions (no GCLID, matched email/phone)" dateLabel={rangeLabel} loading={loading}>
        {ecDaily.length ? <AreaTrend data={ecDaily} xKey="date" yKey="pct" color="var(--coral)" /> : <div className="empty-msg">No conversion data in range</div>}
      </Card>

      <Card title="CPL Trend — Weekly" sub="Before/after ScaleX server-side activation" dateLabel={rangeLabel} loading={loading}>
        {weeklyCpl.length ? <LineTrend data={weeklyCpl} xKey="week" yKey="cpl" color="var(--teal)" /> : <div className="empty-msg">Loading Google Ads data…</div>}
      </Card>
    </>
  );
}
