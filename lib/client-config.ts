// lib/client-config.ts
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CLIENT CONFIGURATION — the dashboard's entire per-client surface        ║
// ║                                                                          ║
// ║  Deploying for a new client: change this file, change nothing else.      ║
// ║  If you find yourself editing a literal elsewhere, it belongs here and   ║
// ║  the extraction is incomplete — fix it here rather than in place, or the ║
// ║  next deployment inherits the same problem.                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Mirrors the CLIENT block in the relay (v10.9.16). Several values MUST match
// the relay exactly — they are marked. A mismatch does not error; it produces
// two systems quietly disagreeing about the same numbers, which is worse.
//
// Anything secret (service-account key, OAuth refresh token, Ads developer
// token) stays in Vercel environment variables and is NOT in this file.

export interface ClientConfig {
  name: string;
  displayName: string;
  industry: string;
  googleAds: { customerId: string };
  sheets: { relayLogId: string; ppcSubmissionsId: string; ppcTab: string };
  recon: { mcpUrl: string };
  tracking: { sgtmDomain: string; ga4PropertyId: string };
  /** MUST MATCH the relay's CLIENT.stageLadder values. */
  ladderValues: Record<string, number>;
  /** Source substrings treated as non-paid in the coverage view. */
  organicSourceHints: string[];
  /** Campaign-name test for brand vs non-brand. Client naming, not a rule. */
  brandCampaignPattern: RegExp;
  timeline: {
    /** When CRM-graded conversions began reaching bidding. */
    biddingSignalLiveFrom: number;
    /** Before this, movement is noise — bidding responds over weeks. */
    conclusiveFrom: number;
  };
  assistant: { role: string; context: string };
}

export const CLIENT: ClientConfig = {
  name: "AnalytixLabs",
  displayName: "AnalytixLabs · Workbench",
  industry: "EdTech",

  googleAds: {
    // MUST MATCH relay CLIENT.googleAds.customerId
    customerId: "4064995850",
  },

  sheets: {
    // The relay is a CONTAINER-BOUND Apps Script — it reaches its own sheet via
    // getActiveSpreadsheet() and has no id. The dashboard reads the same sheet
    // from outside, so the id lives here. Sharing the relay log with the
    // service account as VIEWER is a deployment step; read-only is deliberate,
    // the relay owns that sheet.
    relayLogId: "1U3q09dNFDF-67mrJO-gqEbsKby4ylr-AF631w8zneDc",
    // The PPC submission sheet — the CPL denominator. One row per form
    // submission. NOT the relay log, which is stage-change EVENTS with several
    // rows per lead.
    ppcSubmissionsId: "1mLxadboR2oQO1CNi3ExpsoK-fNTmm9EFcvLh9yTZLqE",
    ppcTab: "NextJS",
  },

  recon: {
    mcpUrl: "https://scalex-recon-mcp.vercel.app/api/mcp",
  },

  tracking: {
    sgtmDomain: "sgtmv1.analytixlabs.co.in",
    ga4PropertyId: "342720890",
  },

  // MUST MATCH the relay's stage ladder. The dashboard multiplies counts by
  // these to show proxy value uploaded; if they drift, the dashboard reports a
  // value Google never received.
  ladderValues: {
    lead_submitted: 200,
    signup: 500,
    qualified: 2000,
    converted: 10000,
    disqualified: 1,
  },

  // Client-specific source naming. "analytixlabs" appears as a Source value in
  // this CRM and means direct/organic, not the company. Rebuild per client.
  organicSourceHints: ["organic", "direct", "analytixlabs", "referral"],

  // Brand search captures existing demand; non-brand generates it. This is the
  // client's campaign naming convention, not a universal rule.
  brandCampaignPattern: /brand/i,

  timeline: {
    // 19 Aug 2026 — when qualified began reaching bidding for this client.
    biddingSignalLiveFrom: Date.UTC(2026, 7, 19),
    // Mid-Oct 2026. Google's bidding responds over weeks, so nothing before
    // this is conclusive and movement should be read as noise either way.
    conclusiveFrom: Date.UTC(2026, 9, 15),
  },

  assistant: {
    role: "an EdTech company running Google Ads to acquire Data Science students",
    context:
      "You assist C-level executives and directors with performance questions " +
      "answered from live data.",
  },
};

/**
 * Fail loudly on an incomplete config rather than rendering a dashboard full of
 * blanks. Called from the server route, so it surfaces at request time with a
 * readable message instead of as undefined deep in a component.
 */
export function validateClientConfig(): void {
  const missing: string[] = [];
  if (!CLIENT.googleAds.customerId) missing.push("googleAds.customerId");
  if (!CLIENT.sheets.relayLogId) missing.push("sheets.relayLogId");
  if (!CLIENT.sheets.ppcSubmissionsId) missing.push("sheets.ppcSubmissionsId");
  if (!CLIENT.recon.mcpUrl) missing.push("recon.mcpUrl");
  if (!Object.keys(CLIENT.ladderValues).length) missing.push("ladderValues");
  if (CLIENT.timeline.conclusiveFrom <= CLIENT.timeline.biddingSignalLiveFrom) {
    missing.push("timeline.conclusiveFrom must be after biddingSignalLiveFrom");
  }
  if (missing.length) {
    throw new Error(
      "CLIENT config incomplete in lib/client-config.ts:\n  - " + missing.join("\n  - ")
    );
  }
}
