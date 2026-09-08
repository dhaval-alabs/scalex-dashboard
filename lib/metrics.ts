// lib/metrics.ts — single source of truth for relay-derived metrics.
// All pages compute from these helpers so numbers never diverge between widgets.

import { RelayRow, BatchRow, PpcRow } from "./sheets";

export interface RelaySummary {
  total: number;
  success: number;
  ecOnly: number;
  failed: number;
  skipped: number;
  waiting: number;         // A5_* states: deliberately held, NOT failures
  other: number;           // statuses matching no bucket at all
  gclidAttached: number;   // rows that reached GAds with a real gclid
  ecOnlyReached: number;   // rows that reached GAds via EC only
  reached: number;         // success + ecOnly (uploaded to GAds)
  gclidAttachRate: number; // gclid / reached
  ecOnlyRate: number;      // ecOnly / reached
  attachRateReliable: boolean; // false when `reached` is too small to quote
  byConv: Record<string, number>;
  byStatus: Record<string, number>;
}

// Minimum `reached` before the attach rate is worth showing as a number.
// Mirrors the guard get_signal_quality_trend already applies to trend
// direction. Measured on live data the attach rate read 31.3%, 54.4%, 64.3%
// and 41.7% across four windows on bases of 502, 125, 14 and 12 rows — the
// swing was sample size, not signal. Anything under this shows as "—".
export const ATTACH_RATE_MIN_BASE = 30;

export function summarize(rows: RelayRow[]): RelaySummary {
  let success = 0, ecOnly = 0, failed = 0, skipped = 0, waiting = 0, other = 0;
  const byConv: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const r of rows) {
    const s = r.status;
    byStatus[s] = (byStatus[s] || 0) + 1;

    if (s === "SUCCESS") success++;
    else if (s === "SUCCESS_EC_ONLY") ecOnly++;
    else if (s.includes("FAIL")) failed++;
    else if (s.startsWith("SKIP")) skipped++;
    // A5 architecture waiting states. These are NOT failures and NOT skips —
    // the first push is deliberately held five days and swept by
    // runDay5Push(). Previously they matched no branch at all, so `total` and
    // the sum of the buckets disagreed by 3,443 of 38,239 rows and the
    // difference silently vanished from every widget.
    else if (s.startsWith("A5_")) waiting++;
    // NO_GCLID, HTTP_503 and anything new the relay starts emitting. Counted
    // rather than dropped, so a new status can never disappear again.
    else other++;

    if (r.convId) byConv[r.convId] = (byConv[r.convId] || 0) + 1;
  }

  const reached = success + ecOnly;
  return {
    total: rows.length, success, ecOnly, failed, skipped, waiting, other,
    gclidAttached: success, ecOnlyReached: ecOnly, reached,
    gclidAttachRate: reached ? success / reached : 0,
    ecOnlyRate: reached ? ecOnly / reached : 0,
    attachRateReliable: reached >= ATTACH_RATE_MIN_BASE,
    byConv, byStatus,
  };
}

// Proxy value actually uploaded per action = count x ladder value.
//
// The dashboard's "Value Ladder" card was plotting `count` under a title and
// subtitle that both said VALUE ("Proxy value uploaded per action (feeds
// tROAS)"), with rupee amounts in the axis labels. So Disqualified at 1 rupee
// showed as the longest bar while Converted at 10,000 rupees showed as one of
// the shortest — the exact inversion of what feeds tROAS. It was also
// identical to the funnel chart beside it, because both were counts.
//
// This is the chart someone would use to reason about bid strategy, so the
// inversion was the most actively misleading thing on the page.
export const LADDER_VALUE: Record<string, number> = {
  lead_submitted: 200,
  signup: 500,
  qualified: 2000,
  converted: 10000,
  disqualified: 1,
};

export interface LadderValueRow {
  key: string;
  label: string;
  count: number;
  unitValue: number;
  totalValue: number;
  shareOfValue: number;
}

export function ladderValue(sum: RelaySummary): LadderValueRow[] {
  const labels: Record<string, string> = {
    lead_submitted: "Lead Submitted", signup: "Signup",
    qualified: "Qualified", converted: "Converted", disqualified: "Disqualified",
  };
  const rows = Object.keys(LADDER_VALUE).map((k) => {
    const count = sum.byConv[k] || 0;
    const unitValue = LADDER_VALUE[k];
    return { key: k, label: labels[k] || k, count, unitValue, totalValue: count * unitValue, shareOfValue: 0 };
  }).filter((r) => r.count > 0);
  const grand = rows.reduce((a, r) => a + r.totalValue, 0);
  for (const r of rows) r.shareOfValue = grand ? r.totalValue / grand : 0;
  return rows.sort((a, b) => b.totalValue - a.totalValue);
}


// ── CPL AND COST PER UNIQUE LEAD ─────────────────────────────────────────────
//
// Definitions settled with Sumeet, 8 Sep 2026. TWO metrics, not one, because
// they answer different questions and differ by roughly 20-25%:
//
//   CPL                  cost per PAID CLICK that produced a lead.
//                        Denominator: submissions, deduped only for TECHNICAL
//                        duplicates. One person who clicked two different ads
//                        and submitted twice counts TWICE — those are two paid
//                        clicks that each produced a lead.
//
//   Cost per Unique Lead cost per PERSON acquired.
//                        Denominator: distinct emails. That same person counts
//                        once.
//
// Blank GCLIDs are IN the denominator. Attribution runs on UTM and landing
// page, not click ID — a blank click ID does not mean the lead was unpaid, and
// someone who taps the call button never has one. Critically, blank-GCLID rows
// are never deduped AGAINST EACH OTHER: two blank rows for the same person are
// two submissions, and collapsing them on an email+GCLID key would
// under-count. That is why CPL dedupes on a technical-duplicate rule rather
// than on email+GCLID.
//
// NO JUNK FILTER, by decision. A junk submission still consumed spend, so
// excluding it would flatter the figure. Quality — junk, dead, RNR — is the
// client's judgement, not the product's.
//
// TECHNICAL DUPLICATE = same email AND same GCLID within 120 seconds. That is
// the signature of the pre-27-Aug OTP-resend bug, which appended the same lead
// several times in the same second (one lead produced 8 rows on 22 Aug; two
// rows 87ms apart on 26 Aug). Genuine resubmissions are minutes apart with the
// name often retyped, and those are real repeat clicks. 120s is deliberately
// generous: a false merge under-counts CPL, which is the conservative
// direction.
const TECHNICAL_DUP_WINDOW_MS = 120 * 1000;

// Brand vs non-brand. Brand search captures existing demand; non-brand
// generates it. Blending them flatters CPL, which is why Sumeet asked for the
// split rather than one number.
export function isBrandCampaign(name: string): boolean {
  return /brand/i.test(name || "");
}

export interface CplSegment {
  label: string;
  spend: number;
  submissions: number;      // CPL denominator
  uniqueLeads: number;      // Cost per Unique Lead denominator
  technicalDupsRemoved: number;
  blankGclid: number;
  cpl: number | null;
  cpul: number | null;
}

function dedupeTechnical(rows: PpcRow[]): { kept: PpcRow[]; removed: number } {
  // Sort by email+gclid then time, so near-duplicates are adjacent.
  const sorted = [...rows].sort((a, b) => {
    const ka = a.email.toLowerCase() + "|" + a.gclid;
    const kb = b.email.toLowerCase() + "|" + b.gclid;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (new Date(a.timestamp).getTime() || 0) - (new Date(b.timestamp).getTime() || 0);
  });
  const kept: PpcRow[] = [];
  let removed = 0;
  for (const r of sorted) {
    const prev = kept[kept.length - 1];
    const sameKey =
      prev &&
      prev.email.toLowerCase() === r.email.toLowerCase() &&
      prev.gclid === r.gclid &&
      // A blank GCLID is NOT a key. Two blank rows for one person are two
      // submissions, never a technical duplicate.
      r.gclid !== "";
    if (sameKey) {
      const dt = Math.abs((new Date(r.timestamp).getTime() || 0) - (new Date(prev.timestamp).getTime() || 0));
      if (dt <= TECHNICAL_DUP_WINDOW_MS) { removed++; continue; }
    }
    kept.push(r);
  }
  return { kept, removed };
}

function segment(label: string, rows: PpcRow[], spend: number): CplSegment {
  const { kept, removed } = dedupeTechnical(rows);
  const uniqueEmails = new Set(kept.map((r) => r.email.toLowerCase()));
  const blankGclid = kept.filter((r) => !r.gclid).length;
  return {
    label, spend,
    submissions: kept.length,
    uniqueLeads: uniqueEmails.size,
    technicalDupsRemoved: removed,
    blankGclid,
    cpl:  kept.length ? spend / kept.length : null,
    cpul: uniqueEmails.size ? spend / uniqueEmails.size : null,
  };
}

export interface CplBreakdown {
  brand: CplSegment;
  nonBrand: CplSegment;
  blended: CplSegment;
  unmatchedCampaign: number;  // submissions with no UTM campaign at all
}

// campaignSpend: campaign name -> spend, from the Google Ads API.
export function cplBreakdown(ppc: PpcRow[], campaignSpend: Record<string, number>): CplBreakdown {
  let brandSpend = 0, nonBrandSpend = 0;
  for (const [name, spend] of Object.entries(campaignSpend)) {
    if (isBrandCampaign(name)) brandSpend += spend; else nonBrandSpend += spend;
  }
  const brandRows    = ppc.filter((r) => r.campaign && isBrandCampaign(r.campaign));
  const nonBrandRows = ppc.filter((r) => r.campaign && !isBrandCampaign(r.campaign));
  // Submissions carrying no UTM campaign at all. Reported, not silently
  // dropped into one side or the other — they would bias whichever got them.
  const unmatched = ppc.filter((r) => !r.campaign).length;
  return {
    brand:    segment("Brand", brandRows, brandSpend),
    nonBrand: segment("Non-brand", nonBrandRows, nonBrandSpend),
    blended:  segment("Blended", ppc.filter((r) => r.campaign), brandSpend + nonBrandSpend),
    unmatchedCampaign: unmatched,
  };
}

// ── DAY-5 DELIVERY ───────────────────────────────────────────────────────────
//
// The number the dashboard was missing entirely.
//
// runDay5Push() writes its outcomes to BatchLog and Firestore, never to the
// Log tab. BATCHLOG_URL was declared in lib/sheets.ts and never fetched, so
// every metric on every page was computed from the Log tab alone — which
// excludes the day-5 sweep, the larger share of what the relay actually
// delivers to Google Ads. The dashboard was understating our own delivery to
// the client.
//
// `dropped` is terminal-only as of relay v10.9.11: leads whose click window
// expired. Not a failure of ours, but a real loss, so it is reported
// separately rather than folded into either success or failure.
export interface Day5Summary {
  runs: number;
  pushed: number;
  dropped: number;
  failed: number;
  delivered: number;      // pushed, i.e. accepted by the Google Ads API
  errorRate: number;      // failed / (pushed + failed)
  dropRate: number;       // dropped / (pushed + dropped + failed)
  lastRun: string;
}

export function day5Summary(batch: BatchRow[]): Day5Summary {
  let runs = 0, pushed = 0, dropped = 0, failed = 0;
  let lastRun = "";
  for (const b of batch) {
    // Day-5 rows only. Legacy forward-upgrade runs share this tab and
    // double-count if not filtered — the same guard the recon MCP applies.
    if (!b.isDay5) continue;
    runs++;
    pushed  += b.processed;
    dropped += b.dropped;
    failed  += b.failed;
    if (!lastRun || b.timestamp > lastRun) lastRun = b.timestamp;
  }
  const attempted = pushed + failed;
  return {
    runs, pushed, dropped, failed, delivered: pushed,
    errorRate: attempted ? failed / attempted : 0,
    dropRate: (pushed + dropped + failed) ? dropped / (pushed + dropped + failed) : 0,
    lastRun,
  };
}

// Total delivery to Google Ads: forward upgrades (Log tab) PLUS the day-5
// sweep (BatchLog). Use this anywhere the client is shown "conversions
// delivered" — the Log tab alone is less than the full picture.
export function totalDelivered(sum: RelaySummary, d5: Day5Summary): {
  forward: number; day5: number; total: number;
} {
  return { forward: sum.reached, day5: d5.delivered, total: sum.reached + d5.delivered };
}

// EC Recovery daily series: % of reached conversions that were EC-only
export function ecRecoveryDaily(rows: RelayRow[]): { date: string; ecOnly: number; gclid: number; pct: number }[] {
  const byDate: Record<string, { ec: number; gclid: number }> = {};
  for (const r of rows) {
    if (r.status !== "SUCCESS" && r.status !== "SUCCESS_EC_ONLY") continue;
    const m = r.timestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    const key = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    if (!byDate[key]) byDate[key] = { ec: 0, gclid: 0 };
    if (r.status === "SUCCESS_EC_ONLY") byDate[key].ec++;
    else byDate[key].gclid++;
  }
  return Object.entries(byDate).sort().map(([date, v]) => {
    const tot = v.ec + v.gclid;
    return { date, ecOnly: v.ec, gclid: v.gclid, pct: tot ? Math.round((v.ec / tot) * 100) : 0 };
  });
}

// Coverage by source: leads per source, how many reached GAds vs skipped
export function coverageBySource(rows: RelayRow[]): { source: string; total: number; reached: number; skipped: number; coverage: number }[] {
  const bySrc: Record<string, { total: number; reached: number; skipped: number }> = {};
  for (const r of rows) {
    const src = r.source || "(unknown)";
    if (!bySrc[src]) bySrc[src] = { total: 0, reached: 0, skipped: 0 };
    bySrc[src].total++;
    if (r.status === "SUCCESS" || r.status === "SUCCESS_EC_ONLY") bySrc[src].reached++;
    else if (r.status.startsWith("SKIP")) bySrc[src].skipped++;
  }
  return Object.entries(bySrc)
    .map(([source, v]) => ({ source, ...v, coverage: v.total ? v.reached / v.total : 0 }))
    .sort((a, b) => b.total - a.total);
}

// Skip-reason breakdown (parse Message column)
export function skipBreakdown(rows: RelayRow[]): { reason: string; count: number }[] {
  const reasons: Record<string, number> = {};
  for (const r of rows) {
    if (!r.status.startsWith("SKIP")) continue;
    // Reads r.message, which now actually IS the Message column. It was being
    // read from index 17 (Hashed Email), so this regex ran against a SHA-256
    // hash, never matched, and every skip collapsed to "Other".
    let reason = "Other";
    const m = r.message.match(/Non-PPC source:\s*"([^"]*)"/);
    if (m) reason = `Non-PPC: ${m[1] || "(blank)"}`;
    else if (r.status === "SKIP_DROP_STAGE") reason = "Drop stage";
    else if (r.message.toLowerCase().includes("inactive")) reason = "Drop stage (inactive)";
    else if (r.message) reason = r.message.slice(0, 60);
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
  return Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// Smart bidding maturity: conversion volume per _sclx-mapped convId
export function biddingMaturity(rows: RelayRow[]): { action: string; count: number; label: string }[] {
  const sum = summarize(rows);
  const labels: Record<string, string> = {
    lead_submitted: "Lead Submitted (₹200)",
    signup: "Signup (₹500)",
    qualified: "Qualified (₹2,000)",
    converted: "Converted (₹10,000)",
    disqualified: "Disqualified (₹1)",
  };
  return Object.entries(sum.byConv)
    .map(([action, count]) => ({ action, count, label: labels[action] || action }))
    .sort((a, b) => b.count - a.count);
}

// Funnel: count by bucket in ladder order
export function funnel(rows: RelayRow[]): { stage: string; count: number }[] {
  const sum = summarize(rows);
  const order = ["lead_submitted", "signup", "qualified", "converted", "disqualified"];
  const labels: Record<string, string> = {
    lead_submitted: "Lead Submitted", signup: "Signup", qualified: "Qualified",
    converted: "Converted", disqualified: "Disqualified",
  };
  return order.filter((k) => sum.byConv[k]).map((k) => ({ stage: labels[k], count: sum.byConv[k] }));
}
