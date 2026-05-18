// api/gads-stats.js
// Vercel serverless function — fetches live Google Ads stats
// v3 — added comparison period for campaign table (prev period columns)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const days = parseInt(req.query.days || '30');

  try {
    const token = await getAccessToken();
    // Fetch current + prior period in parallel
    const [stats, prevStats] = await Promise.all([
      fetchGadsStats(token, days, 0),
      fetchGadsStats(token, days, days), // offset by one full period
    ]);
    // Merge prev campaign data into current
    const prevMap = {};
    (prevStats.campaigns || []).forEach(c => { prevMap[c.id] = c; });
    stats.campaigns = stats.campaigns.map(c => ({
      ...c,
      prev_spend:       prevMap[c.id]?.spend       || null,
      prev_conversions: prevMap[c.id]?.conversions || null,
      prev_cpl:         prevMap[c.id]?.cpl         || null,
      prev_clicks:      prevMap[c.id]?.clicks      || null,
    }));
    stats.prev_cpl   = prevStats.cpl;
    stats.prev_spend = prevStats.total_spend;
    stats.prev_total_conversions = prevStats.total_conversions;

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error('gads-stats error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

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
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data).slice(0,200));
  return data.access_token;
}

// offsetDays=0 → current period, offsetDays=days → prior period
async function fetchGadsStats(token, days, offsetDays) {
  const customerId = process.env.CUSTOMER_ID;
  const mccId      = process.env.MCC_ID;
  const devToken   = process.env.DEVELOPER_TOKEN;

  const endDate   = new Date();
  endDate.setDate(endDate.getDate() - offsetDays);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);
  const fmt = d => d.toISOString().split('T')[0];

  const overallQuery = `
    SELECT metrics.cost_micros, metrics.clicks, metrics.conversions, segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(startDate)}' AND '${fmt(endDate)}'
    AND campaign.status = 'ENABLED'
  `;

  const campaignQuery = `
    SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(startDate)}' AND '${fmt(endDate)}'
    AND campaign.status = 'ENABLED'
  `;

  const convQuery = `
    SELECT conversion_action.name, metrics.all_conversions, metrics.all_conversions_value
    FROM conversion_action
    WHERE conversion_action.name IN ('crm_webhook_qualified_lead','crm_webhook_converted_lead')
  `;

  const [overallResp, campaignResp, convResp] = await Promise.all([
    gadsSearch(overallQuery,  customerId, mccId, devToken, token),
    gadsSearch(campaignQuery, customerId, mccId, devToken, token),
    gadsSearch(convQuery,     customerId, mccId, devToken, token),
  ]);

  // Overall totals
  let totalSpendMicros = 0, totalClicks = 0, totalConversions = 0;
  const dailyData = {};
  (overallResp[0]?.results || []).forEach(r => {
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

  // Campaign breakdown
  const campMap = {};
  (campaignResp[0]?.results || []).forEach(r => {
    const id   = r.campaign?.id || 'unknown';
    const name = r.campaign?.name || 'Unknown';
    if (!campMap[id]) campMap[id] = { id, name, spend: 0, clicks: 0, conversions: 0, impressions: 0 };
    campMap[id].spend       += parseInt(r.metrics?.costMicros || 0) / 1_000_000;
    campMap[id].clicks      += parseInt(r.metrics?.clicks || 0);
    campMap[id].conversions += parseFloat(r.metrics?.conversions || 0);
    campMap[id].impressions += parseInt(r.metrics?.impressions || 0);
  });

  const campaigns = Object.values(campMap)
    .filter(c => c.spend > 10)
    .sort((a, b) => b.spend - a.spend)
    .map(c => ({
      id:          c.id,
      name:        c.name,
      spend:       Math.round(c.spend),
      spend_lakh:  (c.spend / 100000).toFixed(2),
      clicks:      c.clicks,
      conversions: Math.round(c.conversions * 10) / 10,
      cpl:         c.conversions > 0 ? Math.round(c.spend / c.conversions) : null,
      ctr:         c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00',
    }));

  let qualifiedLeads = 0, enrolledLeads = 0;
  (convResp[0]?.results || []).forEach(r => {
    const name = r.conversionAction?.name || '';
    if (name === 'crm_webhook_qualified_lead') qualifiedLeads = parseFloat(r.metrics?.allConversions || 0);
    if (name === 'crm_webhook_converted_lead') enrolledLeads  = parseFloat(r.metrics?.allConversions || 0);
  });

  return {
    period_days:       days,
    total_spend:       Math.round(totalSpend),
    total_spend_lakh:  (totalSpend / 100000).toFixed(2),
    total_clicks:      totalClicks,
    total_conversions: Math.round(totalConversions),
    cpl,
    qualified_leads:   Math.round(qualifiedLeads),
    enrolled_leads:    Math.round(enrolledLeads),
    cost_per_enrolled: enrolledLeads > 0 ? Math.round(totalSpend / enrolledLeads) : 0,
    campaigns,
    weekly_cpl:        offsetDays === 0 ? buildWeeklyCpl(dailyData) : [],
    fetched_at:        new Date().toISOString(),
  };
}

async function gadsSearch(query, customerId, mccId, devToken, token) {
  const resp = await fetch(
    `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization':     `Bearer ${token}`,
        'developer-token':   devToken,
        'login-customer-id': mccId,
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({ query: query.trim() }),
    }
  );
  const text = await resp.text();
  if (!resp.ok) throw new Error(`GAds API ${resp.status}: ${text.slice(0,400)}`);
  try { return JSON.parse(text); }
  catch { return text.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return {}; } }); }
}

function buildWeeklyCpl(dailyData) {
  const weeks = [];
  const today = new Date();
  for (let w = 11; w >= 0; w--) {
    const weekEnd   = new Date(today); weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6);
    let spend = 0, conv = 0;
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      if (dailyData[key]) { spend += dailyData[key].spend; conv += dailyData[key].conversions; }
    }
    weeks.push(conv > 0 ? Math.round(spend / conv) : null);
  }
  return weeks;
}
