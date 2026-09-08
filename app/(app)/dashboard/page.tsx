"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod } from "@/lib/sheets";
import { summarize, ecRecoveryDaily, biddingMaturity, coverageBySource, day5Summary, totalDelivered, ladderValue, cplBreakdown } from "@/lib/metrics";
import { PageHeader, Card, Kpi } from "@/components/ui";
import { AreaTrend, LineTrend, BarSeries } from "@/components/charts";

export default function DashboardPage() {
  const { range, rangeLabel, rangeFootnote, relayRows, batchRows, ppcRows, ppcError, gads, loading } = useApp();
  const rows    = useMemo(() => filterByPeriod(relayRows, range), [relayRows, range]);
  // Day-5 sweeps live in BatchLog, not the Log tab. Without this the delivery
  // figures below count only forward upgrades and understate what we send.
  const batch   = useMemo(() => filterByPeriod(batchRows, range), [batchRows, range]);
  const d5      = useMemo(() => day5Summary(batch), [batch]);
  const ppc     = useMemo(() => filterByPeriod(ppcRows, range), [ppcRows, range]);
  const cpl     = useMemo(() => {
    const spendByCampaign: Record<string, number> = {};
    (gads?.campaigns || []).forEach((c) => { spendByCampaign[c.name] = c.spend; });
    return cplBreakdown(ppc, spendByCampaign);
  }, [ppc, gads]);
  const s       = useMemo(() => summarize(rows), [rows]);
  const ecDaily = useMemo(() => ecRecoveryDaily(rows), [rows]);
  const maturity = useMemo(() => biddingMaturity(rows), [rows]);
  const coverage = useMemo(() => coverageBySource(rows), [rows]);
  const ladder   = useMemo(() => ladderValue(s), [s]);
  const delivery = useMemo(() => totalDelivered(s, d5), [s, d5]);

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

      {rangeFootnote && (
        <div style={{
          padding: "0.6rem 0.85rem", marginBottom: "1.25rem",
          background: "var(--surface2)", borderRadius: "var(--radius3)",
          borderLeft: "3px solid var(--amber)", fontSize: "0.78rem",
          color: "var(--text3)", lineHeight: 1.5,
        }}>
          {rangeFootnote}
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="kpi-grid">
        <Kpi label="Total Conversions" value={gads ? gads.total_conversions.toLocaleString() : "—"} foot={`${gads?.total_clicks?.toLocaleString() || "—"} clicks · ${rangeLabel}`} accent="var(--teal)" />
        <Kpi label="Ad Spend" value={gads ? "₹" + gads.total_spend_lakh + "L" : "—"} foot={`₹${gads?.total_spend?.toLocaleString() || "—"} total`} accent="var(--purple)" />
        <Kpi label="CRM Conversions Sent" value={delivery.total.toLocaleString()} foot={`${delivery.forward.toLocaleString()} forward · ${delivery.day5.toLocaleString()} day-5 sweep`} accent="var(--teal)" />
        <Kpi label="GCLID Attach Rate" value={s.attachRateReliable ? Math.round(s.gclidAttachRate * 100) + "%" : "—"} foot={s.attachRateReliable ? `${s.success} of ${s.reached} with real click ID` : `Base too small (${s.reached}) — needs 30+`} accent="var(--amber)" />
        <Kpi label="EC Only" value={Math.round(s.ecOnlyRate * 100) + "%"} foot={`${s.ecOnly} matched via hashed email/phone`} accent="var(--coral)" />
      </div>

      {/* ── Google's own cost metric — deliberately separated ── */}
      <Card
        title="Google Ads — Cost per Conversion (Google's own number)"
        sub="Google Ads' native metric: spend ÷ conversions Google recorded. NOT a CRM cost-per-lead — the denominator is Google's conversion count, which includes call and WhatsApp taps and excludes CRM leads Google never attributed. Shown separately so it is not mistaken for CPL."
        dateLabel={rangeLabel}
        loading={loading}
      >
        <div className="kpi-grid">
          <Kpi
            label="Google Cost / Conversion"
            value={gads ? "₹" + gads.cpl : "—"}
            foot={gads?.prev_cpl ? `prev ₹${gads.prev_cpl} · Google Ads API` : "Google Ads API"}
            accent="var(--text3)"
          />
          <Kpi
            label="Google Conversions"
            value={gads ? gads.total_conversions.toLocaleString() : "—"}
            foot="the denominator above — Google's count, not CRM leads"
            accent="var(--text3)"
          />
        </div>
      </Card>

      {/* ── CRM-basis CPL, split brand vs non-brand ── */}
      <Card
        title="Cost per Lead — CRM basis"
        sub="Denominator is form submissions from the PPC sheet, not Google's conversion count. CPL counts each paid click that produced a lead; Cost per Unique Lead counts each person once. Blank click IDs are included — attribution runs on UTM and landing page. No junk filter: a junk submission still consumed spend."
        dateLabel={rangeLabel}
        loading={loading}
      >
        {ppcError ? (
          <div className="empty-msg">PPC sheet unavailable — {ppcError}</div>
        ) : cpl.blended.submissions ? (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Segment</th>
                  <th className="num">Spend</th>
                  <th className="num">Submissions</th>
                  <th className="num">Unique leads</th>
                  <th className="num">CPL</th>
                  <th className="num">Cost / unique lead</th>
                </tr>
              </thead>
              <tbody>
                {[cpl.nonBrand, cpl.brand, cpl.blended].map((seg) => (
                  <tr key={seg.label} style={seg.label === "Blended" ? { fontWeight: 600 } : undefined}>
                    <td>{seg.label}</td>
                    <td className="num">₹{Math.round(seg.spend).toLocaleString()}</td>
                    <td className="num">{seg.submissions.toLocaleString()}</td>
                    <td className="num">{seg.uniqueLeads.toLocaleString()}</td>
                    <td className="num">{seg.cpl != null ? "₹" + Math.round(seg.cpl).toLocaleString() : "—"}</td>
                    <td className="num">{seg.cpul != null ? "₹" + Math.round(seg.cpul).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "0.74rem", color: "var(--text3)", marginTop: "0.6rem", lineHeight: 1.6 }}>
              Brand search captures existing demand; non-brand generates it. Read the two separately — blending flatters CPL.<br />
              {cpl.blended.technicalDupsRemoved > 0 && <>{cpl.blended.technicalDupsRemoved} technical duplicate{cpl.blended.technicalDupsRemoved === 1 ? "" : "s"} removed (same email and click ID within 120s — the pre-27-Aug OTP-resend signature). Genuine resubmissions are kept.<br /></>}
              {cpl.blended.blankGclid > 0 && <>{cpl.blended.blankGclid} submission{cpl.blended.blankGclid === 1 ? "" : "s"} with no click ID, included by design.<br /></>}
              {cpl.unmatchedCampaign > 0 && <>{cpl.unmatchedCampaign} submission{cpl.unmatchedCampaign === 1 ? "" : "s"} carry no UTM campaign and are excluded from all three rows rather than assigned to either side.</>}
            </div>
          </>
        ) : <div className="empty-msg">No PPC submissions in range</div>}
      </Card>

      {/* ── Row 1: EC Recovery + CPL Trend ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
        <Card title="EC Recovery — Daily" sub="% of conversions matched via Enhanced Conversions (no GCLID)" dateLabel={rangeLabel} loading={loading}>
          {ecDaily.length
            ? <AreaTrend data={ecDaily} xKey="date" yKey="pct" color="var(--coral)" height={220} />
            : <div className="empty-msg">No conversion data in range</div>}
        </Card>
        <Card title="Google Cost / Conversion — Weekly" sub="Google Ads' own metric, trailing 12 weeks. Not CRM cost-per-lead — see the card above." dateLabel={rangeLabel} loading={loading}>
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
        <Card title="Smart Bidding — Proxy Value Uploaded" sub="Count × ladder value — this is what feeds tROAS, not the counts beside it" dateLabel={rangeLabel} loading={loading}>
          {ladder.length ? (
            <>
              <BarSeries data={ladder.map(r => ({ ...r, name: `${r.label} (₹${r.unitValue.toLocaleString()})` }))} xKey="name" yKey="totalValue" color="var(--purple)" horizontal height={220} />
              <table className="tbl" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
                <thead><tr><th>Action</th><th className="num">Count</th><th className="num">₹ each</th><th className="num">₹ total</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {ladder.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="num">{r.count.toLocaleString()}</td>
                      <td className="num">₹{r.unitValue.toLocaleString()}</td>
                      <td className="num">₹{r.totalValue.toLocaleString()}</td>
                      <td className="num">{Math.round(r.shareOfValue * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <div className="empty-msg">No conversion data in range</div>}
        </Card>
      </div>

      {/* ── Row 2b: Day-5 sweep — previously invisible ── */}
      <Card title="Day-5 Sweep — Delivery" sub="runDay5Push() writes to BatchLog, not the Log tab. This was excluded from every figure on this page until 7 Sep 2026." dateLabel={rangeLabel} loading={loading}>
        {d5.runs ? (
          <div className="kpi-grid">
            <Kpi label="Day-5 Pushed" value={d5.pushed.toLocaleString()} foot={`${d5.runs} sweep${d5.runs === 1 ? "" : "s"} in range`} accent="var(--teal)" />
            <Kpi label="Forward Upgrades" value={delivery.forward.toLocaleString()} foot="from the Log tab" accent="var(--purple)" />
            <Kpi label="Total Delivered" value={delivery.total.toLocaleString()} foot="forward + day-5 · accepted by the GAds API" accent="var(--green)" />
            <Kpi label="Failed" value={d5.failed.toLocaleString()} foot={`${(d5.errorRate * 100).toFixed(2)}% of attempted · retried next sweep`} accent="var(--coral)" />
            <Kpi label="Dropped" value={d5.dropped.toLocaleString()} foot={`${(d5.dropRate * 100).toFixed(2)}% · click window expired (terminal)`} accent="var(--amber)" />
            <Kpi label="Last Sweep" value={d5.lastRun ? d5.lastRun.split(" ")[0] : "—"} foot={d5.lastRun ? d5.lastRun.split(" ").slice(1).join(" ") + " · 3:40 AM IST daily" : "no sweep in range"} accent="var(--teal)" />
          </div>
        ) : <div className="empty-msg">No day-5 sweeps in range</div>}
      </Card>

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
              <div style={{ fontSize: "0.88rem", fontWeight: 600, marginTop: "0.2rem" }}>{s.total.toLocaleString()} events · {s.skipped.toLocaleString()} skipped · {s.waiting.toLocaleString()} waiting</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text3)" }}>Skip {s.total ? Math.round((s.skipped / s.total) * 100) : 0}% (non-PPC) · {s.waiting.toLocaleString()} held for day-5 sweep{s.other ? ` · ${s.other} other` : ""}</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
