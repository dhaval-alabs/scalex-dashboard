// lib/sheets.ts — relay log + batch log via published Google Sheets CSV
// Ported verbatim from the original dashboard's parseCSV logic.

export const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSbEGvqdlB_8anAt8_yNmOtpg0PeGBkdBvs0aPcw651qIFxJunBWHtOYeiON_i1Z5DnAzpM5IHKunTw/pub?gid=1418087288&single=true&output=csv";
export const BATCHLOG_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSbEGvqdlB_8anAt8_yNmOtpg0PeGBkdBvs0aPcw651qIFxJunBWHtOYeiON_i1Z5DnAzpM5IHKunTw/pub?gid=745012896&single=true&output=csv&headers=false";

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
  message: string;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function parseCSV(text: string): RelayRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines
    .slice(1)
    .map((line) => {
      const c = splitCSVLine(line);
      // Log columns: 0:Timestamp 1:Status 2:OldStage 3:NewStage 4:GCLID 5:Value
      // 6:ProspectID 7:Name 8:Email 9:Phone 10:Source 11:Medium 12:Campaign
      // 13:PageURL 14:LeadScore 15:EngScore 16:FBClid 17:Message
      const val = parseFloat(c[5]) || 0;
      const convId =
        val === 200 ? "lead_submitted"
        : val === 500 ? "signup"
        : val >= 1000 && val < 10000 ? "qualified"
        : val === 10000 ? "converted"
        : val === 1 ? "disqualified"
        : "";
      return {
        timestamp: c[0] || "", status: c[1] || "", oldStage: c[2] || "",
        newStage: c[3] || "", gclid: c[4] || "", value: val,
        prospectId: c[6] || "", name: c[7] || "", email: c[8] || "",
        phone: c[9] || "", source: c[10] || "", medium: c[11] || "",
        campaign: c[12] || "", pageUrl: c[13] || "",
        convId, message: c[17] || "",
      };
    })
    .filter((r) => r.timestamp && r.status);
}

export async function fetchRelayRows(): Promise<RelayRow[]> {
  const res = await fetch(CSV_URL + "&t=" + Date.now());
  const text = await res.text();
  return parseCSV(text);
}

// Parse M/D/YYYY H:MM:SS to a Date
export function parseTs(ts: string): Date | null {
  if (!ts) return null;
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// Filter rows to the last N days (or 'today'/'yesterday'/'this_month')
export function filterByPeriod(rows: RelayRow[], period: number | string): RelayRow[] {
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
