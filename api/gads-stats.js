// api/gads-stats.js
// Vercel serverless function — fetches live Google Ads stats
// Returns: CPL, spend, leads, cost_per_enrolled for last N days

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const days = parseInt(req.query.days || '30');

  try {
    const token = await getAccessToken();
    const stats = await fetchGadsStats(token, days);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error('gads-stats error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── OAuth token ───────────────────────────────────────────────
async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Google Ads query ──────────────────────────────────────────
async function fetchGadsStats(token, days) {
  const customerId  = process.env.CUSTOMER_ID;
  const mccId       = process.env.MCC_ID;
  const devToken    = process.env.DEVELOPER_TOKEN;

  // Date range: last N days
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = d => d.toISOString().split('T')[0].replace(/-/g, '-');

  // Query 1: Overall campaign stats (spend, clicks, conversions)
  const campaignQuery = `
    SELECT
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(startDate)}' AND '${fmt(endDate)}'
      AND campaign.status = 'ENABLED'
  `;

  // Query 2: Conversion action breakdown
  const convQuery = `
    SELECT
      conversion_action.name,
      conversion_action.id,
      metrics.all_conversions,
      metrics.all_conversions_value
    FROM conversion_action
    WHERE conversion_action.name IN (
      'crm_webhook_qualified_lead',
      'crm_webhook_converted_lead'
    )
  `;

  const [campaignResp, convResp] = await Promise.all([
    gadsSearch(campaignQuery, customerId, mccId, devToken, token),
    gadsSearch(convQuery,    customerId, mccId, devToken, token),
  ]);

  // Process campaign stats
  let totalSpendMicros = 0, totalClicks = 0, totalConversions = 0;

  const dailyData = {};
  (campaignResp[0]?.results || []).forEach(r => {
    const date = r.segments?.date || '';
    const cost = parseInt(r.metrics?.costMicros || 0);
    totalSpendMicros += cost;
    totalClicks      += parseInt(r.metrics?.clicks || 0);
    totalConversions += parseFloat(r.metrics?.conversions || 0);

    if (date) {
      if (!dailyData[date]) dailyData[date] = { spend: 0, conversions: 0 };
      dailyData[date].spend       += cost / 1_000_000;
      dailyData[date].conversions += parseFloat(r.metrics?.conversions || 0);
    }
  });

  const totalSpend = totalSpendMicros / 1_000_000;
  const cpl        = totalConversions > 0 ? Math.round(totalSpend / totalConversions) : 0;

  // Process conversion actions
  let qualifiedLeads = 0, enrolledLeads = 0,
      qualifiedValue = 0, enrolledValue = 0;

  (convResp[0]?.results || []).forEach(r => {
    const name = r.conversionAction?.name || '';
    const ct   = parseFloat(r.metrics?.allConversions || 0);
    const cv   = parseFloat(r.metrics?.allConversionsValue || 0);
    if (name === 'crm_webhook_qualified_lead') { qualifiedLeads = ct; qualifiedValue = cv; }
    if (name === 'crm_webhook_converted_lead') { enrolledLeads  = ct; enrolledValue  = cv; }
  });

  const costPerEnrolled = enrolledLeads > 0
    ? Math.round(totalSpend / enrolledLeads) : 0;

  // Weekly CPL for trend chart (last 12 weeks)
  const weeklyCpl = buildWeeklyCpl(dailyData);

  return {
    period_days:       days,
    total_spend:       Math.round(totalSpend),
    total_spend_lakh:  (totalSpend / 100000).toFixed(2),
    total_clicks:      totalClicks,
    total_conversions: Math.round(totalConversions),
    cpl:               cpl,
    qualified_leads:   Math.round(qualifiedLeads),
    enrolled_leads:    Math.round(enrolledLeads),
    qualified_value:   Math.round(qualifiedValue),
    enrolled_value:    Math.round(enrolledValue),
    cost_per_enrolled: costPerEnrolled,
    weekly_cpl:        weeklyCpl,
    fetched_at:        new Date().toISOString(),
  };
}

// ── Google Ads search stream ──────────────────────────────────
async function gadsSearch(query, customerId, mccId, devToken, token) {
  const resp = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    {
      method:  'POST',
      headers: {
        'Authorization':     `Bearer ${token}`,
        'developer-token':   devToken,
        'login-customer-id': mccId,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Ads API ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

// ── Weekly CPL builder ────────────────────────────────────────
function buildWeeklyCpl(dailyData) {
  const weeks = [];
  const today = new Date();

  for (let w = 11; w >= 0; w--) {
    const weekEnd   = new Date(today);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    let spend = 0, conversions = 0;
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      if (dailyData[key]) {
        spend       += dailyData[key].spend;
        conversions += dailyData[key].conversions;
      }
    }
    weeks.push(conversions > 0 ? Math.round(spend / conversions) : null);
  }
  return weeks;
}
