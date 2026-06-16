"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { summarize, ecRecoveryDaily, biddingMaturity, coverageBySource } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { AreaTrend, LineTrend, BarSeries } from "@/components/charts";

export default function DashboardPage() {
  const { range, rangeLabel, relayRows, gads, loading } = useApp();
  const rows    = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  const s       = useMemo(() => summarize(rows), [rows]);
  const ecDaily = useMemo(() => ecRecoveryDaily(rows), [rows]);
  const maturity = useMemo(() => biddingMaturity(rows), [rows]);
  const coverage = useMemo(() => coverageBySource(rows), [rows]);

  const weeklyCpl = useMemo(
    () => (gads?.weekly_cpl || []).map((v, i) => ({ week: "W" + (i + 1), cpl: v })).filter((d) => d.cpl != null),
    [gads]
  );

  // Top campaign by spend
  const topCampaign = gads?.campaigns?.[0];
  // Best CPL campaign
  const bestCpl = gads?.campaigns?.filter((c) => c.cpl != null).sort((a, b) => (a.cpl ?? 9999) - (b.cpl ?? 9999))[0];

  // Stage flow counts from relay
  const stageFlow = useMemo(() => {
    const order = ["lead_submitted", "signup", "qualified", "converted", "disqualified"];
    const labels: Record<string, string> = {
      lead_submitted: "Lead Submitted", signup: "Signup",
      qualified: "Qualified", converted: "Converted", disqualified: "Disqualified",
    };
    return order.filter((k) => s.byConv[k]).map((k) => ({ stage: labels[k], count: s.byConv[k] }));
  }, [s]);

  return (
    <>
      <PageHeader title="Performance Overview" sub="Server-side conversion intelligence · live" />

      {/* ── KPI strip ── */}
      <div className="kpi-grid">
        <Kpi label="Total Conversions" value={gads ? gads.total_conversions.toLocaleString() : "—"} foot={`${gads?.total_clicks?.toLocaleString() || "—"} clicks · ${rangeLabel}`} accent="var(--teal)" />
        <Kpi label="Cost Per Lead" value={gads ? "₹" + gads.cpl : "—"} foot={gads?.prev_cpl ? `prev ₹${gads.prev_cpl}` : rangeLabel} accent="var(--green)" />
        <Kpi label="Ad Spend" value={gads ? "₹" + gads.total_spend_lakh + "L" : "—"} foot={`₹${gads?.total_spend?.toLocaleString() || "—"} total`} accent="var(--purple)" />
        <Kpi label="CRM Conversions Sent" value={s.reached.toLocaleString()} foot={`${s.success} gclid · ${s.ecOnly} EC-only`} accent="var(--teal)" />
        <Kpi label="GCLID Attach Rate" value={Math.round(s.gclidAttachRate * 100) + "%"} foot={`${s.success} of ${s.reached} with real click ID`} accent="var(--amber)" />
        <Kpi label="EC Only" value={Math.round(s.ecOnlyRate * 100) + "%"} foot={`${s.ecOnly} matched via hashed email/phone`} accent="var(--coral)" />
      </div>

      {/* ── Row 1: EC Recovery + CPL Trend ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
        <Card title="EC Recovery — Daily" sub="% of conversions matched via Enhanced Conversions (no GCLID)" dateLabel={rangeLabel} loading={loading}>
          {ecDaily.length
            ? <AreaTrend data={ecDaily} xKey="date" yKey="pct" color="var(--coral)" height={220} />
            : <div className="empty-msg">No conversion data in range</div>}
        </Card>
        <Card title="CPL Trend — Weekly" sub="Cost per lead — trailing 12 weeks" dateLabel={rangeLabel} loading={loading}>
          {weeklyCpl.length
            ? <LineTrend data={weeklyCpl} xKey="week" yKey="cpl" color="var(--teal)" height={220} />
            : <div className="empty-msg">Loading Google Ads data…</div>}
        </Card>
      </div>

      {/* ── Row 2: Signal Flow + Smart Bidding ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
        <Card title="Signal Flow — Funnel" sub="Conversions by value-ladder stage in this range" dateLabel={rangeLabel} loading={loading}>
          {stageFlow.length
            ? <BarSeries data={stageFlow} xKey="stage" yKey="count" color="var(--teal)" height={220} />
            : <div className="empty-msg">No stage data in range</div>}
        </Card>
        <Card title="Smart Bidding — Value Ladder" sub="Proxy value uploaded per action (feeds tROAS)" dateLabel={rangeLabel} loading={loading}>
          {maturity.length
            ? <BarSeries data={maturity.map(m => ({ ...m, name: m.label }))} xKey="name" yKey="count" color="var(--purple)" horizontal height={220} />
            : <div className="empty-msg">No conversion data in range</div>}
        </Card>
      </div>

      {/* ── Row 3: Campaigns ── */}
      <Card title="All Campaigns — Performance" sub="Google Ads · sorted by spend · vs prior period" dateLabel={rangeLabel} loading={loading}>
        {gads?.campaigns?.length ? (
          <table className="tbl">
            <thead>
              <tr><th>Campaign</th><th className="num">Spend</th><th className="num">Clicks</th><th className="num">Conv</th><th className="num">CPL</th><th className="num">CTR</th><th className="num">Δ CPL</th></tr>
            </thead>
            <tbody>
              {gads.campaigns.map((c) => {
                const dCpl = c.cpl != null && c.prev_cpl != null ? c.cpl - c.prev_cpl : null;
                return (
                  <tr key={c.id}>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                    <td className="num">₹{c.spend.toLocaleString()}</td>
                    <td className="num">{c.clicks.toLocaleString()}</td>
                    <td className="num">{c.conversions}</td>
                    <td className="num">{c.cpl != null ? "₹" + c.cpl : "—"}</td>
                    <td className="num">{c.ctr}%</td>
                    <td className="num">
                      {dCpl != null
                        ? <span className={"badge " + (dCpl <= 0 ? "green" : "coral")}>{dCpl <= 0 ? "▼" : "▲"} ₹{Math.abs(dCpl)}</span>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="empty-msg">Loading campaign data…</div>}
      </Card>

      {/* ── Row 4: Coverage summary + Highlights ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <Card title="Coverage by Source" sub="PPC leads that reached Google Ads vs skipped" dateLabel={rangeLabel} loading={loading}>
          <table className="tbl" style={{ fontSize: "0.8rem" }}>
            <thead><tr><th>Source</th><th className="num">Total</th><th className="num">Reached</th><th>Rate</th></tr></thead>
            <tbody>
              {coverage.filter(c => c.total >= 3).slice(0, 8).map((c) => (
                <tr key={c.source}>
                  <td>{c.source}</td>
                  <td className="num">{c.total}</td>
                  <td className="num">{c.reached}</td>
                  <td>
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", fontWeight: 700, color: c.coverage === 0 ? "var(--text4)" : c.coverage < 0.3 ? "var(--amber)" : "var(--green)" }}>
                      {Math.round(c.coverage * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Highlights" sub="Key numbers at a glance">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {topCampaign && (
              <div style={{ padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", borderLeft: "3px solid var(--purple)" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--purple)", fontWeight: 600 }}>Top spend campaign</div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: "0.2rem" }}>{topCampaign.name.split("-").slice(0, 2).join(" ")}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text3)" }}>₹{topCampaign.spend.toLocaleString()} · CPL ₹{topCampaign.cpl ?? "—"}</div>
              </div>
            )}
            {bestCpl && bestCpl.id !== topCampaign?.id && (
              <div style={{ padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", borderLeft: "3px solid var(--green)" }}>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--green)", fontWeight: 600 }}>Best CPL campaign</div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: "0.2rem" }}>{bestCpl.name.split("-").slice(0, 2).join(" ")}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text3)" }}>₹{bestCpl.cpl} CPL · {bestCpl.conversions} conversions</div>
              </div>
            )}
            <div style={{ padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", borderLeft: "3px solid var(--teal)" }}>
              <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--teal)", fontWeight: 600 }}>Signal quality</div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: "0.2rem" }}>{Math.round(s.gclidAttachRate * 100)}% real GCLID · {Math.round(s.ecOnlyRate * 100)}% EC-only</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text3)" }}>{s.reached.toLocaleString()} total conversions sent to GAds</div>
            </div>
            <div style={{ padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: "var(--radius3)", borderLeft: "3px solid var(--amber)" }}>
              <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--amber)", fontWeight: 600 }}>Relay pipeline</div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: "0.2rem" }}>{s.total.toLocaleString()} total events · {s.skipped.toLocaleString()} skipped</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text3)" }}>Skip rate {s.total ? Math.round((s.skipped / s.total) * 100) : 0}% · expected (non-PPC exclusion)</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
