/**
 * googleApi.js
 * Thin wrapper for Google Ads API v17 (REST).
 * Docs: https://developers.google.com/google-ads/api/docs/rest/design/overview
 */
const https = require("https");

const GOOGLE_ADS_VERSION = "v17";
const BASE = "googleads.googleapis.com";

function googleRequest(method, path, accessToken, developerToken, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const options = {
      hostname: BASE,
      path: `/v${GOOGLE_ADS_VERSION.slice(1)}${path}`,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
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
          if (parsed.error) reject(new Error((parsed.error.message || "Google Ads API error")));
          else resolve(parsed);
        } catch {
          reject(new Error("Invalid JSON from Google Ads API"));
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Create a campaign via Google Ads API.
 * `creds` must have: accessToken, accountId (customer ID), developerToken.
 */
async function createCampaign(creds, campaignData) {
  const { accessToken, accountId, extra } = creds;
  const developerToken = extra?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const customerId = accountId.replace(/-/g, "");
  const payload = {
    operations: [
      {
        create: {
          name: campaignData.name,
          advertisingChannelType: mapChannelType(campaignData.objective),
          status: "PAUSED",
          manualCpc: {},
          campaignBudget: `customers/${customerId}/campaignBudgets/~`,
        },
      },
    ],
  };
  const result = await googleRequest(
    "POST",
    `/customers/${customerId}/campaigns:mutate`,
    accessToken,
    developerToken,
    payload
  );
  const resourceName = result.results && result.results[0] && result.results[0].resourceName;
  return { externalId: resourceName, platform: "google" };
}

/**
 * Fetch campaign performance metrics via Google Ads Query Language.
 */
async function getCampaignMetrics(creds, externalId) {
  const { accessToken, accountId, extra } = creds;
  const developerToken = extra?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const customerId = accountId.replace(/-/g, "");
  const campaignId = externalId ? externalId.split("/").pop() : "";
  const gaqlQuery = `
    SELECT campaign.id, metrics.impressions, metrics.clicks,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.id = '${campaignId}'
    AND segments.date DURING LAST_7_DAYS
  `;
  const result = await googleRequest(
    "POST",
    `/customers/${customerId}/googleAds:search`,
    accessToken,
    developerToken,
    { query: gaqlQuery }
  );
  const row = (result.results && result.results[0]) || {};
  const m = row.metrics || {};
  return {
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    spend: (Number(m.costMicros || 0) / 1_000_000),
    conversions: Number(m.conversions || 0),
    revenue: Number(m.conversionsValue || 0),
  };
}

function mapChannelType(objective) {
  const map = { ventas: "SHOPPING", trafico: "SEARCH", leads: "SEARCH" };
  return map[objective] || "SEARCH";
}

/**
 * Update the daily budget for a Google Ads campaign.
 * Requires the campaign budget resource name — stored as externalId or extra.budgetResourceName.
 */
async function updateBudget(creds, externalId, dailyBudgetCLP) {
  const { accessToken, accountId, extra } = creds;
  const developerToken = extra?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const customerId = accountId.replace(/-/g, "");
  const budgetResourceName = extra?.budgetResourceName || externalId;
  // Google Ads budget in micros (1 unit = 1e6 micros). CLP × 1e6.
  const amountMicros = Math.round(dailyBudgetCLP * 1_000_000);
  const payload = {
    operations: [{ update: { resourceName: budgetResourceName, amountMicros }, updateMask: "amount_micros" }],
  };
  await googleRequest("POST", `/customers/${customerId}/campaignBudgets:mutate`, accessToken, developerToken, payload);
  return { updated: true };
}

module.exports = { createCampaign, getCampaignMetrics, updateBudget };
