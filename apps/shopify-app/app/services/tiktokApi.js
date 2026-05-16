/**
 * tiktokApi.js
 * Thin wrapper for TikTok Marketing API v1.3.
 * Docs: https://ads.tiktok.com/marketing_api/docs
 */
const https = require("https");

const BASE = "business-api.tiktok.com";
const API_VERSION = "v1.3";

function tiktokRequest(method, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const options = {
      hostname: BASE,
      path: `/open_api/${API_VERSION}${path}`,
      method,
      headers: {
        "Access-Token": accessToken,
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
          if (parsed.code !== 0) {
            reject(new Error(parsed.message || "TikTok API error"));
          } else {
            resolve(parsed.data);
          }
        } catch {
          reject(new Error("Invalid JSON from TikTok API"));
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Create a campaign on TikTok Ads.
 * `creds` must have: accessToken, accountId (advertiser_id)
 */
async function createCampaign(creds, campaignData) {
  const { accessToken, accountId } = creds;
  const payload = {
    advertiser_id: accountId,
    campaign_name: campaignData.name,
    objective_type: mapObjective(campaignData.objective),
    budget_mode: "BUDGET_MODE_TOTAL",
    budget: campaignData.budgetDaily * 30, // monthly estimate
    operation_status: "DISABLE",
  };
  const result = await tiktokRequest("POST", "/campaign/create/", accessToken, payload);
  return { externalId: result.campaign_id, platform: "tiktok" };
}

/**
 * Fetch campaign metrics from TikTok (last 7 days).
 */
async function getCampaignMetrics(creds, externalId) {
  const { accessToken, accountId } = creds;
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const qs = new URLSearchParams({
    advertiser_id: accountId,
    service_type: "AUCTION",
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(["campaign_id"]),
    metrics: JSON.stringify(["show_cnt", "click_cnt", "cost", "conversion", "value"]),
    start_date: startDate,
    end_date: endDate,
    filtering: JSON.stringify([{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify([externalId]) }]),
  }).toString();
  const result = await tiktokRequest("GET", `/report/integrated/get/?${qs}`, accessToken, "");
  const row = result && result.list && result.list[0] && result.list[0].metrics || {};
  return {
    impressions: Number(row.show_cnt || 0),
    clicks: Number(row.click_cnt || 0),
    spend: parseFloat(row.cost || 0),
    conversions: Number(row.conversion || 0),
    revenue: parseFloat(row.value || 0),
  };
}

function mapObjective(objective) {
  const map = { ventas: "CONVERSIONS", trafico: "TRAFFIC", leads: "LEAD_GENERATION" };
  return map[objective] || "CONVERSIONS";
}

/**
 * Update total budget for a TikTok campaign.
 * TikTok uses BUDGET_MODE_TOTAL — we set a new total = dailyBudget × 30.
 */
async function updateBudget(creds, externalId, dailyBudgetCLP) {
  const { accessToken, accountId } = creds;
  const payload = {
    advertiser_id: accountId,
    campaign_id: externalId,
    budget: dailyBudgetCLP * 30,
  };
  await tiktokRequest("POST", "/campaign/update/", accessToken, payload);
  return { updated: true };
}

module.exports = { createCampaign, getCampaignMetrics, updateBudget };
