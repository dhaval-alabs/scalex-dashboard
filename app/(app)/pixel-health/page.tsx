"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { summarize } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";

export default function PixelHealthPage() {
  const { range, rangeLabel, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const s = useMemo(() => summarize(rows), [rows]);
  const noGclidFlag = useMemo(() => rows.filter(r => r.message.includes("GCLID_SRC:NONE")).length, [rows]);

  return (
    <>
      <PageHeader title="Pixel Health" sub="Relay + sGTM signal integrity" />
      <div className="kpi-grid">
        <Kpi label="Total Events" value={s.total.toLocaleString()} foot={rangeLabel} accent="var(--teal)" />
        <Kpi label="Success" value={s.success.toLocaleString()} foot="full gclid+ec" accent="var(--green)" />
        <Kpi label="EC Only" value={s.ecOnly.toLocaleString()} foot="no gclid" accent="var(--amber)" />
        <Kpi label="Failed" value={s.failed.toLocaleString()} foot="GADS_PARTIAL_FAIL" accent="var(--coral)" />
        <Kpi label="⚠️ No-GCLID Flags" value={noGclidFlag.toLocaleString()} foot="ScaleX_pixel_team" accent="var(--coral)" />
      </div>
      <Card title="Signal Integrity" sub="">
        <p style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.6 }}>
          The relay tags every row whose GCLID could not be resolved with <code>GCLID_SRC:NONE ⚠️ ScaleX_pixel_team</code>.
          A rising count signals the pixel/cookie path is dropping click IDs before they reach the CRM — the gap the Stape <code>_gcl_aw</code> route
          targets. Current range: <strong>{noGclidFlag}</strong> flagged of <strong>{s.reached}</strong> reached.
        </p>
      </Card>
      <Card title="Pipeline Status" sub="">
        <table className="tbl">
          <tbody>
            <tr><td>sGTM Container</td><td className="num">GTM-NL8L86MW</td></tr>
            <tr><td>sGTM Domain</td><td className="num">sgtmv1.analytixlabs.co.in</td></tr>
            <tr><td>Google Ads API</td><td className="num">v23</td></tr>
            <tr><td>Relay Status</td><td><span className="badge green">● Live</span></td></tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}
