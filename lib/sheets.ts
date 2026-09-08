// lib/sheets.ts — relay Log + BatchLog, read through /api/relay-rows
//
// The published-CSV URLs that used to live here are GONE. They exposed 38,239
// rows of customer name, email and phone on an unauthenticated URL that shipped
// in the client JS bundle. Publishing was stopped on 7 Sep 2026. Reads now go
// through the server route, which holds the service-account credentials.
//
// Two column bugs are also fixed here — see COLUMN INDICES below.

export interface RelayRow {
  timestamp: string;
  status: string;
  oldStage: string;
  newStage: string;
  gclid: string;
  value: number;
  prospectId: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  medium: string;
  campaign: string;
  pageUrl: string;
  convId: string;
  convType: string;   // NEW: real column 19, previously derived from value only
  message: string;
}

// A day-5 sweep summary, from the BatchLog tab.
// BatchLog header: Timestamp, Status, Processed, Dropped, Failed, Message
export interface BatchRow {
  timestamp: string;
  status: string;
  processed: number;
  dropped: number;
  failed: number;
  message: string;
  isDay5: boolean;
}

// ── COLUMN INDICES, verified against the live header on 3 Sep 2026 ───────────
//
//  0 Timestamp        7 Name           14 Lead Score
//  1 Status           8 Email          15 Engagement Score
//  2 Old Stage        9 Phone          16 FB Click ID
//  3 New Stage       10 Source         17 Hashed Email
//  4 GCLID           11 Medium         18 Hashed Phone
//  5 Value (INR)     12 Campaign       19 Conv Type
//  6 Prospect ID     13 Page URL       20 Message
//
// TWO BUGS FIXED:
//
// (a) message was read from c[17], which is HASHED EMAIL, not Message. The old
//     comment said "17:Message" - true under an 18-column schema that no longer
//     exists. Consequence: skipBreakdown() ran a regex for Non-PPC source
//     against a SHA-256 hash, never matched, and collapsed every skip reason to
//     "Other". The real strings were in c[20] all along. Anywhere the UI showed
//     "Message" it was showing a hash.
//
// (b) convId was derived from the value ladder even though Conv Type exists as
//     a real column at index 19. Deriving it silently mislabels everything if
//     the ladder changes. The real column is now read into convType; convId
//     keeps the derivation as a fallback for rows written before the
//     21-column schema landed.
const IDX = {
  timestamp: 0, status: 1, oldStage: 2, newStage: 3, gclid: 4, value: 5,
  prospectId: 6, name: 7, email: 8, phone: 9, source: 10, medium: 11,
  campaign: 12, pageUrl: 13, convType: 19, message: 20,
} as const;

function deriveConvId(val: number): string {
  // Fallback only. Ladder: lead_submitted 200, signup 500, qualified 2000,
  // converted 10000, disqualified 1.
  if (val === 200) return "lead_submitted";
  if (val === 500) return "signup";
  if (val === 10000) return "converted";
  if (val >= 1000 && val < 10000) return "qualified";
  if (val === 1) return "disqualified";
  return "";
}

export function rowsFromValues(values: string[][]): RelayRow[] {
  if (!values || values.length < 2) return [];
  return values
    .slice(1)
    .map((c) => {
      const val = parseFloat(String(c[IDX.value] ?? "")) || 0;
      return {
        timestamp:  String(c[IDX.timestamp]  ?? ""),
        status:     String(c[IDX.status]     ?? ""),
        oldStage:   String(c[IDX.oldStage]   ?? ""),
        newStage:   String(c[IDX.newStage]   ?? ""),
        gclid:      String(c[IDX.gclid]      ?? ""),
        value:      val,
        prospectId: String(c[IDX.prospectId] ?? ""),
        name:       String(c[IDX.name]       ?? ""),
        email:      String(c[IDX.email]      ?? ""),
        phone:      String(c[IDX.phone]      ?? ""),
        source:     String(c[IDX.source]     ?? ""),
        medium:     String(c[IDX.medium]     ?? ""),
        campaign:   String(c[IDX.campaign]   ?? ""),
        pageUrl:    String(c[IDX.pageUrl]    ?? ""),
        convId:     deriveConvId(val),
        convType:   String(c[IDX.convType]   ?? "").trim(),
        message:    String(c[IDX.message]    ?? ""),
      };
    })
    .filter((r) => r.timestamp && r.status);
}

export function batchFromValues(values: string[][]): BatchRow[] {
  if (!values || values.length < 2) return [];
  return values
    .slice(1)
    .map((c) => {
      const message = String(c[5] ?? "");
      const status  = String(c[1] ?? "");
      return {
        timestamp: String(c[0] ?? ""),
        status,
        processed: parseFloat(String(c[2] ?? "")) || 0,
        dropped:   parseFloat(String(c[3] ?? "")) || 0,
        failed:    parseFloat(String(c[4] ?? "")) || 0,
        message,
        // Day-5 vs legacy. Verified against live BatchLog rows on 8 Sep 2026 —
        // an earlier cut tested for a "DAY5" marker, borrowed from the recon
        // MCP's Log-TAB filter. BatchLog does not use it, so nothing matched
        // and the day-5 card was empty for every range.
        //
        // What BatchLog actually looks like:
        //   day-5:  7/27/2026 3:42:38  SUCCESS  34 0 0  "eligible:34 remaining:0"
        //   legacy: 7/19/2026 2:29:05  PARTIAL_FAIL 4 0 4  "[LEGACY] Multiple errors..."
        //   noise:  7/14/2026 7:57:05  DISABLED 0 0 0  "ENABLE_A5_FORWARD_ONLY is false"
        //
        // So the discriminator is the inverse of what was assumed: LEGACY rows
        // are tagged, day-5 rows are not. runDay5Push()'s logBatchRun writes
        // "eligible:N remaining:N", which is the positive signal.
        //
        // DISABLED rows are excluded — they are a config state, not a run, and
        // counting them would inflate the run count with zero-work entries.
        //
        // Rows with an empty message and a zero count are day-5 sweeps that
        // found nothing; they are kept so the run count is honest.
        isDay5:
          !/\[LEGACY\]/i.test(message) &&
          status !== "DISABLED" &&
          (/eligible:\s*\d+/i.test(message) || message.trim() === ""),
      };
    })
    .filter((r) => r.timestamp);
}


// ── PPC SUBMISSION SHEET (NextJS tab) — the CPL denominator ──────────────────
//
// One row per form submission, written by the landing pages. Column indices
// verified against the live header on 1 Sep 2026:
//
//   0 Timestamp (ISO)   5 Source Section & CTA   10 UTM Term    22 UTM Content
//   1 Full Name         6 Master Source Filter   11 GCLID       23 Raw Source CTA
//   2 Email             7 UTM Source             ...            24 ScaleX ID
//   3 Phone             8 UTM Medium             16 OTP_Status  25 Click Timestamp
//   4 City              9 UTM Campaign           17 Email Ver.  26 Click ID Source
export interface PpcRow {
  timestamp: string;   // ISO 8601, NOT the M/D/YYYY the relay log uses
  email: string;
  phone: string;
  campaign: string;
  gclid: string;
  sclxId: string;
  masterSource: string;
}

export function ppcFromValues(values: string[][]): PpcRow[] {
  if (!values || values.length < 2) return [];
  return values
    .slice(1)
    .map((c) => ({
      timestamp:    String(c[0]  ?? ""),
      email:        String(c[2]  ?? "").trim(),
      phone:        String(c[3]  ?? "").trim(),
      masterSource: String(c[6]  ?? "").trim(),
      campaign:     String(c[9]  ?? "").trim(),
      gclid:        String(c[11] ?? "").trim(),
      sclxId:       String(c[24] ?? "").trim(),
    }))
    .filter((r) => r.timestamp && r.email);
}

// PPC sheet timestamps are ISO; the relay log's are M/D/YYYY. filterByPeriod
// calls parseTs, which handles both — ISO falls through to new Date(). Kept
// explicit so the difference is not rediscovered later.

export interface RelayData {
  rows: RelayRow[];
  batch: BatchRow[];
  ppc: PpcRow[];
  ppcError: string | null;
  fetchedAt: string;
}

export async function fetchRelayData(): Promise<RelayData> {
  const resp = await fetch("/api/relay-rows?t=" + Date.now());
  if (!resp.ok) {
    // Fail loudly. The old published-CSV path returned a 401 sign-in page that
    // parsed as CSV into garbage rows, so a broken data path looked like an
    // empty dashboard rather than a fault.
    let detail = "";
    try { detail = (await resp.json())?.error || ""; } catch {}
    throw new Error("relay-rows API error " + resp.status + (detail ? ": " + detail : ""));
  }
  const json = await resp.json();
  if (!json.success) throw new Error(json.error || "relay-rows failed");
  return {
    rows:      rowsFromValues(json.data.log),
    batch:     batchFromValues(json.data.batch),
    ppc:       ppcFromValues(json.data.ppc || []),
    ppcError:  json.data.ppcError ?? null,
    fetchedAt: json.data.fetched_at || new Date().toISOString(),
  };
}

/** @deprecated Use fetchRelayData(). Kept so existing callers still compile. */
export async function fetchRelayRows(): Promise<RelayRow[]> {
  return (await fetchRelayData()).rows;
}

// Parse M/D/YYYY H:MM:SS to a Date
export function parseTs(ts: string): Date | null {
  if (!ts) return null;
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

type Periodish = { timestamp: string };

// Filter rows to the last N days (or today / yesterday / this_month).
// Generic so it works on both RelayRow and BatchRow.
export function filterByPeriod<T extends Periodish>(rows: T[], period: number | string): T[] {
  const now = new Date();
  if (period === "today") {
    const t = now.toDateString();
    return rows.filter((r) => { const d = parseTs(r.timestamp); return d && d.toDateString() === t; });
  }
  if (period === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const ys = y.toDateString();
    return rows.filter((r) => { const d = parseTs(r.timestamp); return d && d.toDateString() === ys; });
  }
  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    return rows.filter((r) => { const d = parseTs(r.timestamp); return d && d >= start && d < end; });
  }
  if (period === "this_month") {
    return rows.filter((r) => {
      const d = parseTs(r.timestamp);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }
  const days = typeof period === "number" ? period : parseInt(period);
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days);
  return rows.filter((r) => { const d = parseTs(r.timestamp); return d && d >= cutoff; });
}
