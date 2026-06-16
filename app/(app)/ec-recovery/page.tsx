"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { summarize, ecRecoveryDaily } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { AreaTrend, BarSeries } from "@/components/charts";

export default function ECRecoveryPage() {
  const { range, rangeLabel, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const s = useMemo(() => summarize(rows), [rows]);
  const daily = useMemo(() => ecRecoveryDaily(rows), [rows]);

  return (
    <>
      <PageHeader title="EC Recovery" sub="Enhanced Conversions recovery — how conversions reach Google Ads when no GCLID is present" />
      <div className="kpi-grid">
        <Kpi label="Reached GAds" value={s.reached.toLocaleString()} foot="success + EC-only" accent="var(--teal)" />
        <Kpi label="Via Real GCLID" value={Math.round(s.gclidAttachRate * 100) + "%"} foot={`${s.success} rows`} accent="var(--green)" />
        <Kpi label="Via EC Only" value={Math.round(s.ecOnlyRate * 100) + "%"} foot={`${s.ecOnly} rows`} accent="var(--coral)" />
        <Kpi label="Failed" value={s.failed.toLocaleString()} foot="GADS_PARTIAL_FAIL" accent="var(--amber)" />
      </div>
      <Card title="EC-Only Share — Daily" sub="% of reached conversions matched by Enhanced Conversions (no GCLID)" dateLabel={rangeLabel} loading={loading}>
        {daily.length ? <AreaTrend data={daily} xKey="date" yKey="pct" color="var(--coral)" /> : <div className="empty-msg">No data in range</div>}
      </Card>
      <Card title="GCLID vs EC-Only — Daily Volume" sub="Absolute counts per day" dateLabel={rangeLabel} loading={loading}>
        {daily.length ? <BarSeries data={daily} xKey="date" yKey="gclid" color="var(--teal)" /> : <div className="empty-msg">No data in range</div>}
      </Card>
      <Card title="What is EC Recovery?" sub="">
        <p style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.6 }}>
          When a lead has no Google click ID (GCLID) — common for phone, walk-in, or cross-device journeys — the relay falls back to
          Enhanced Conversions for Leads, matching hashed email/phone against signed-in Google users. The lower the EC-only rate, the
          more conversions carry a real click ID, which gives Smart Bidding a stronger signal. The Stape <code>_gcl_aw</code> cookie route
          (pending activation) is designed to move volume from EC-only into real-GCLID.
        </p>
      </Card>
    </>
  );
}
