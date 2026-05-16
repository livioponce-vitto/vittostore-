const express = require("express");
const crypto = require("crypto");
const {
  listByShop,
  createCampaign,
  updateCampaign,
  findCampaign,
} = require("../services/campaignStore");
const channelStore = require("../services/channelStore");
const metaApi = require("../services/metaApi");
const googleApi = require("../services/googleApi");
const tiktokApi = require("../services/tiktokApi");

// Push budget update to the real channel if credentials + externalId exist.
// Returns a result object regardless of whether the push succeeded.
async function pushBudgetToChannel(shop, campaign, newBudget) {
  if (!campaign.externalId) {
    return { pushed: false, reason: "no_external_id" };
  }
  const creds = channelStore.getChannelCreds(shop, campaign.channel);
  if (!creds) {
    return { pushed: false, reason: "canal_no_conectado" };
  }
  const apiMap = { meta: metaApi, google: googleApi, tiktok: tiktokApi };
  const api = apiMap[campaign.channel];
  if (!api || typeof api.updateBudget !== "function") {
    return { pushed: false, reason: "canal_no_soporta_update_budget" };
  }
  try {
    await api.updateBudget(creds, campaign.externalId, newBudget);
    return { pushed: true, channel: campaign.channel, externalId: campaign.externalId, newBudget };
  } catch (err) {
    return { pushed: false, reason: err.message };
  }
}

const { validate } = require('../middleware/validateBody');
const { campaignCreateSchema, campaignUpdateSchema } = require('../middleware/schemas');
const router = express.Router();

function mkId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function withDefaults(payload = {}) {
  const creatives = Array.isArray(payload.creatives) && payload.creatives.length
    ? payload.creatives
    : [
        { id: mkId("cr"), name: "Creativo A", format: "image", ctr: 1.1, cpa: 9500, roas: 1.7 },
        { id: mkId("cr"), name: "Creativo B", format: "image", ctr: 0.9, cpa: 11000, roas: 1.3 },
      ];

  return {
    id: mkId("cmp"),
    name: payload.name || "Campana sin nombre",
    shop: payload.shop,
    channel: payload.channel || "meta",
    objective: payload.objective || "ventas",
    status: payload.status || "active",
    budgetDaily: Number(payload.budgetDaily || 12000),
    budgetCurrent: Number(payload.budgetCurrent || payload.budgetDaily || 12000),
    metrics: {
      impressions: Number(payload.impressions || 1200),
      clicks: Number(payload.clicks || 26),
      spend: Number(payload.spend || 9400),
      purchases: Number(payload.purchases || 3),
      revenue: Number(payload.revenue || 23800),
    },
    creatives,
    alerts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildAlerts(c) {
  const alerts = [];
  const ctr = c.metrics.impressions > 0 ? (c.metrics.clicks / c.metrics.impressions) * 100 : 0;
  const cpa = c.metrics.purchases > 0 ? c.metrics.spend / c.metrics.purchases : c.metrics.spend;
  const roas = c.metrics.spend > 0 ? c.metrics.revenue / c.metrics.spend : 0;

  if (ctr < 1) {
    alerts.push({ type: "warning", title: "CTR bajo", description: "Sugerencia: probar un nuevo creativo." });
  }
  if (cpa > 12000) {
    alerts.push({ type: "danger", title: "CPA alto", description: "Sugerencia: pausar anuncios de bajo rendimiento." });
  }
  if (roas >= 2.5) {
    alerts.push({ type: "success", title: "ROAS saludable", description: "Sugerencia: escalar presupuesto gradualmente." });
  }

  return alerts;
}

const authSession = require("../middleware/authSession");
router.get("/", authSession, (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });

  const items = listByShop(shop).map((c) => ({ ...c, alerts: buildAlerts(c) }));
  return res.json({ ok: true, items });
});

router.post("/", validate(campaignCreateSchema), (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });

  const created = createCampaign(withDefaults({ ...req.body, shop }));
  return res.status(201).json({ ok: true, campaign: { ...created, alerts: buildAlerts(created) } });
});

router.post("/:id/optimize", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;
  if (!shop) return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });

  const campaign = findCampaign(id, shop);
  if (!campaign) return res.status(404).json({ ok: false, error: "Campana no encontrada" });

  const ctr = campaign.metrics.impressions > 0
    ? (campaign.metrics.clicks / campaign.metrics.impressions) * 100
    : 0;
  const cpa = campaign.metrics.purchases > 0
    ? campaign.metrics.spend / campaign.metrics.purchases
    : campaign.metrics.spend;
  const roas = campaign.metrics.spend > 0
    ? campaign.metrics.revenue / campaign.metrics.spend
    : 0;

  let newBudget = campaign.budgetCurrent;
  const actions = [];

  if (ctr < 1 || cpa > 12000) {
    newBudget = Math.max(2500, Math.round(campaign.budgetCurrent * 0.85));
    actions.push("Presupuesto reducido 15% por bajo rendimiento.");
  }

  if (roas >= 2.5 && ctr >= 1.2) {
    newBudget = Math.round(campaign.budgetCurrent * 1.15);
    actions.push("Presupuesto aumentado 15% por buen rendimiento.");
  }

  if (actions.length === 0) {
    actions.push("Sin cambios automaticos: rendimiento estable.");
  }

  const updated = updateCampaign(id, shop, {
    budgetCurrent: newBudget,
    status: newBudget <= 3000 ? "paused" : campaign.status,
  });

  // Push budget change to the real channel if available (0, 1 or more canales).
  // Runs even if only local budget changed — push result is informational only.
  const channelSync = await pushBudgetToChannel(shop, campaign, newBudget);
  if (channelSync.pushed) {
    actions.push(`Presupuesto sincronizado en ${channelSync.channel.toUpperCase()}.`);
  }

  return res.json({
    ok: true,
    campaign: { ...updated, alerts: buildAlerts(updated) },
    actions,
    channelSync,
  });
});

router.post("/:id/ab-test", (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;
  if (!shop) return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });

  const campaign = findCampaign(id, shop);
  if (!campaign) return res.status(404).json({ ok: false, error: "Campana no encontrada" });

  if (!campaign.creatives || campaign.creatives.length < 2) {
    return res.status(400).json({ ok: false, error: "Se requieren al menos 2 creativos para A/B test" });
  }

  const winner = [...campaign.creatives].sort((a, b) => (b.roas || 0) - (a.roas || 0))[0];
  const loser = [...campaign.creatives].sort((a, b) => (a.roas || 0) - (b.roas || 0))[0];

  const updatedCreatives = campaign.creatives.map((c) => {
    if (c.id === winner.id) return { ...c, trafficShare: 75 };
    if (c.id === loser.id) return { ...c, trafficShare: 25 };
    return c;
  });

  const updated = updateCampaign(id, shop, {
    creatives: updatedCreatives,
  });

  return res.json({
    ok: true,
    result: {
      winner: winner.name,
      loser: loser.name,
      message: `Ganador: ${winner.name}. Trafico reasignado 75/25.`,
    },
    campaign: { ...updated, alerts: buildAlerts(updated) },
  });
});

module.exports = router;
