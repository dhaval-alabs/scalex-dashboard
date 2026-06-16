// lib/gads.ts — client wrapper for the /api/gads-stats serverless function

export interface GadsCampaign {
  id: string; name: string; spend: number; spend_lakh: string;
  clicks: number; conversions: number; cpl: number | null; ctr: string;
  prev_spend?: number | null; prev_conversions?: number | null;
  prev_cpl?: number | null; prev_clicks?: number | null;
}

export interface GadsStats {
  period_days: number;
  total_spend: number; total_spend_lakh: string;
  total_clicks: number; total_conversions: number; cpl: number;
  qualified_leads: number; enrolled_leads: number; cost_per_enrolled: number;
  campaigns: GadsCampaign[];
  weekly_cpl: (number | null)[];
  prev_cpl?: number; prev_spend?: number; prev_total_conversions?: number;
  fetched_at: string;
}

export async function fetchGadsStats(days: number | string): Promise<GadsStats> {
  const d = typeof days === "number" ? days : (parseInt(days) || 30);
  const resp = await fetch(`/api/gads-stats?days=${d}&t=` + Date.now());
  if (!resp.ok) throw new Error("gads-stats API error " + resp.status);
  const json = await resp.json();
  if (!json.success) throw new Error(json.error || "gads-stats failed");
  return json.data as GadsStats;
}
