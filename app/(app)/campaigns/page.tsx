"use client";
import { useApp } from "@/context/AppContext";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { BarSeries } from "@/components/charts";

export default function CampaignsPage() {
  const { rangeLabel, gads, loading } = useApp();
  const campaigns = gads?.campaigns || [];

  return (
    <>
      <PageHeader title="Campaigns" sub="Google Ads campaign performance — live, sorted by spend" />
      <div className="kpi-grid">
        <Kpi label="Active Campaigns" value={campaigns.length} accent="var(--teal)" />
        <Kpi label="Total Spend" value={gads ? "₹" + gads.total_spend_lakh + "L" : "—"} foot={rangeLabel} accent="var(--purple)" />
        <Kpi label="Total Conversions" value={gads ? gads.total_conversions.toLocaleString() : "—"} accent="var(--green)" />
        <Kpi label="Blended CPL" value={gads ? "₹" + gads.cpl : "—"} accent="var(--amber)" />
      </div>
      <Card title="Spend by Campaign" sub="Current range" dateLabel={rangeLabel} loading={loading}>
        {campaigns.length ? <BarSeries data={campaigns.map(c => ({ name: c.name.length > 28 ? c.name.slice(0, 28) + "…" : c.name, spend: c.spend }))} xKey="name" yKey="spend" color="var(--purple)" horizontal height={Math.max(220, campaigns.length * 46)} /> : <div className="empty-msg">Loading…</div>}
      </Card>
      <Card title="Campaign Detail" sub="vs prior period" dateLabel={rangeLabel} loading={loading}>
        {campaigns.length ? (
          <table className="tbl">
            <thead><tr><th>Campaign</th><th className="num">Spend</th><th className="num">Clicks</th><th className="num">Conv</th><th className="num">CPL</th><th className="num">CTR</th><th className="num">Δ CPL</th></tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const dCpl = c.cpl != null && c.prev_cpl != null ? c.cpl - c.prev_cpl : null;
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="num">₹{c.spend.toLocaleString()}</td>
                    <td className="num">{c.clicks.toLocaleString()}</td>
                    <td className="num">{c.conversions}</td>
                    <td className="num">{c.cpl != null ? "₹" + c.cpl : "—"}</td>
                    <td className="num">{c.ctr}%</td>
                    <td className="num">{dCpl != null ? <span className={"badge " + (dCpl <= 0 ? "green" : "coral")}>{dCpl <= 0 ? "▼" : "▲"} ₹{Math.abs(dCpl)}</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="empty-msg">Loading Google Ads data…</div>}
      </Card>
    </>
  );
}
