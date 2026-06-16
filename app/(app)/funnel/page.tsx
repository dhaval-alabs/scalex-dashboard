"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { funnel } from "@/lib/metrics";
import { PageHeader, Card } from "@/components/ui";
import { BarSeries } from "@/components/charts";

export default function FunnelPage() {
  const { range, rangeLabel, relayRows, loading } = useApp();
  const rows = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const stages = useMemo(() => funnel(rows), [rows]);

  return (
    <>
      <PageHeader title="Funnel Analysis" sub="Lead progression through value-ladder stages" />
      <Card title="Conversions by Stage" sub="Counts per bucket in the selected range" dateLabel={rangeLabel} loading={loading}>
        {stages.length ? <BarSeries data={stages} xKey="stage" yKey="count" color="var(--teal)" horizontal height={Math.max(200, stages.length * 48)} /> : <div className="empty-msg">No data in range</div>}
      </Card>
      <Card title="Stage Counts" loading={loading}>
        <table className="tbl">
          <thead><tr><th>Stage</th><th className="num">Count</th></tr></thead>
          <tbody>{stages.map((s) => <tr key={s.stage}><td>{s.stage}</td><td className="num">{s.count}</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}
