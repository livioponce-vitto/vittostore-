/**
 * metaApi.js
 * Thin wrapper for Meta Marketing API v20.
 * Docs: https://developers.facebook.com/docs/marketing-apis
 */
const https = require("https");

const META_VERSION = "v20.0";
const BASE = "graph.facebook.com";

/**
 * Low-level HTTPS call to Meta Graph API.
 */
function metaRequest(method, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const options = {
      hostname: BASE,
      path: `/${META_VERSION}${path}?access_token=${encodeURIComponent(accessToken)}`,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message || "Meta API error"));
          else resolve(parsed);
        } catch {
          reject(new Error("Invalid JSON from Meta API"));
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Create a campaign on Meta Ads.
 * Returns the new campaign id.
 */
async function createCampaign(creds, campaignData) {
  const { accessToken, accountId } = creds;
  const payload = {
    name: campaignData.name,
    objective: mapObjective(campaignData.objective),
    status: "PAUSED",
    special_ad_categories: [],
  };
  const result = await metaRequest("POST", `/act_${accountId}/campaigns`, accessToken, payload);
  return { externalId: result.id, platform: "meta" };
}

/**
 * Update daily budget for a Meta campaign (in centavos, Meta uses cents).
 */
async function updateBudget(creds, externalId, dailyBudgetCLP) {
  const { accessToken } = creds;
  // Meta budget is in cents of account currency. Convert CLP to units (×100).
  const budget = Math.round(dailyBudgetCLP * 100);
  await metaRequest("POST", `/${externalId}`, accessToken, { daily_budget: budget });
  return { updated: true };
}

/**
 * Fetch campaign insights (last 7 days).
 */
async function getCampaignMetrics(creds, externalId) {
  const { accessToken } = creds;
  const result = await metaRequest(
    "GET",
    `/${externalId}/insights?fields=impressions,clicks,spend,actions&date_preset=last_7d&level=campaign`,
    accessToken,
    null
  );
  const d = (result.data && result.data[0]) || {};
  const purchases = (d.actions || []).find((a) => a.action_type === "purchase");
  return {
    impressions: Number(d.impressions || 0),
    clicks: Number(d.clicks || 0),
    spend: parseFloat(d.spend || 0),
    conversions: purchases ? Number(purchases.value || 0) : 0,
    revenue: 0, // Meta doesn't return revenue directly without pixel values
  };
}

function mapObjective(objective) {
  const map = { ventas: "OUTCOME_SALES", trafico: "OUTCOME_TRAFFIC", leads: "OUTCOME_LEADS" };
  return map[objective] || "OUTCOME_SALES";
}

module.exports = { createCampaign, updateBudget, getCampaignMetrics };
