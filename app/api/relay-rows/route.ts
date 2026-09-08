// app/api/relay-rows/route.ts
//
// Server-side read of the relay log spreadsheet, via a service account.
//
// WHY THIS EXISTS. lib/sheets.ts previously fetched two "publish to web" CSV
// URLs directly from the BROWSER. That meant:
//
//   · the URLs shipped in the client-side JS bundle, so anyone who opened the
//     dashboard had permanent unauthenticated access to them
//   · 38,239 rows of customer name, email and phone were downloadable by
//     anyone with the link — no login, no API key. Verified on 3 Sep 2026 by
//     fetching 7.8 MB from an anonymous session
//   · the dashboard's OTP login protected nothing, because the data path
//     bypassed it entirely
//
// Publishing was stopped on 7 Sep 2026 (both tabs now return HTTP 401). This
// route is the replacement: credentials stay server-side, and the client only
// ever receives rows through an authenticated request.
//
// IT ALSO FIXES THE DAY-5 BLIND SPOT. BATCHLOG_URL was declared in lib/sheets.ts
// and never fetched by anything, so every dashboard metric was computed from the
// Log tab alone. runDay5Push() writes its outcomes to BatchLog and Firestore,
// NOT the Log tab — so day-5 delivery, which is the larger share of what the
// relay sends to Google Ads, was invisible. This route returns both tabs.
//
// SETUP REQUIRED — this route does not work until both are done:
//   1. Vercel env vars GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY
//      (the same shape the landing-page repo uses; \n in the key stays escaped)
//   2. share the relay log spreadsheet with that service account as VIEWER
//
// Read-only by design. The service account must NOT have edit access — the
// relay owns that sheet and the dashboard has no business writing to it.

import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPREADSHEET_ID = "1U3q09dNFDF-67mrJO-gqEbsKby4ylr-AF631w8zneDc";
const LOG_TAB = "Log";
const BATCHLOG_TAB = "BatchLog";

// The PPC submission sheet — one row per form submission, written by the
// landing pages. This is the CPL denominator source.
//
// Why not the relay Log tab: that is a log of stage-change EVENTS, several rows
// per lead, with Campaign populated from the LSQ webhook. Deriving submissions
// back out of stage events is how you end up with a figure that agrees with
// nothing. The PPC sheet is already one row per submission, which is exactly
// the shape Sumeet's CPL definition asks for.
const PPC_SPREADSHEET_ID = "1mLxadboR2oQO1CNi3ExpsoK-fNTmm9EFcvLh9yTZLqE";
const PPC_TAB = "NextJS";

// ── Service-account access token (JWT bearer flow) ────────────────────────────
// Scoped to spreadsheets.readonly. Narrower than the sheets scope the relay
// uses, because this route only ever reads.
async function getSheetsToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY. " +
      "Set both in Vercel, and share the relay log spreadsheet with that " +
      "service account as Viewer."
    );
  }
  const key = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Token exchange failed ${resp.status}: ${await resp.text()}`);
  }
  const json = await resp.json();
  if (!json.access_token) throw new Error("Token exchange returned no access_token");
  return json.access_token as string;
}

async function readRange(token: string, range: string, spreadsheetId = SPREADSHEET_ID): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE` +
    `&dateTimeRenderOption=FORMATTED_STRING`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 403) {
      throw new Error(
        `403 reading ${range}. The spreadsheet is probably not shared with ` +
        `the service account. Share it as Viewer. (${body.slice(0, 200)})`
      );
    }
    throw new Error(`Sheets read failed ${resp.status} for ${range}: ${body.slice(0, 300)}`);
  }
  const json = await resp.json();
  return (json.values || []) as string[][];
}

export async function GET() {
  try {
    const token = await getSheetsToken();

    // Both tabs, in parallel. Column letters, not open-ended ranges, so a
    // trailing empty column in the sheet cannot shift the indices.
    // Three reads in parallel. PPC is allowed to fail on its own without
    // taking the relay figures down with it — it is a newer dependency and the
    // rest of the dashboard does not need it.
    const [logValues, batchValues, ppcResult] = await Promise.all([
      readRange(token, `${LOG_TAB}!A:U`),
      readRange(token, `${BATCHLOG_TAB}!A:F`),
      readRange(token, `${PPC_TAB}!A:AA`, PPC_SPREADSHEET_ID).then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, err: String(e?.message || e) })
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        // Row 0 is the header in both tabs; the client drops it.
        log: logValues,
        batch: batchValues,
        ppc: ppcResult.ok ? ppcResult.v : [],
        ppcError: ppcResult.ok ? null : (ppcResult as { ok: false; err: string }).err,
        logRowCount: Math.max(0, logValues.length - 1),
        batchRowCount: Math.max(0, batchValues.length - 1),
        ppcRowCount: ppcResult.ok ? Math.max(0, ppcResult.v.length - 1) : 0,
        fetched_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    // Surface the reason rather than an empty array. The previous published-CSV
    // path failed SILENTLY — a 401 sign-in page parsed as CSV yields garbage
    // rows, not an error, which is how a broken data path could look like a
    // quiet dashboard instead of a fault.
    console.error("[relay-rows] read failed:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "relay-rows read failed" },
      { status: 500 }
    );
  }
}
