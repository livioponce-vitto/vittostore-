/**
 * channels.js — Ad channel integration routes
 *
 * POST   /channels/connect          — store channel credentials
 * GET    /channels?shop=            — list connected channels
 * DELETE /channels/:channel?shop=   — disconnect channel
 * POST   /channels/sync-campaign    — push campaign to channel API
 * GET    /channels/metrics?shop=&campaignId= — pull metrics from channel
 */
const express = require("express");
const router = express.Router();
const channelStore = require("../services/channelStore");
const campaignStore = require("../services/campaignStore");
const metaApi = require("../services/metaApi");
const googleApi = require("../services/googleApi");
const tiktokApi = require("../services/tiktokApi");

const SUPPORTED = ["meta", "google", "tiktok"];

// ── helpers ─────────────────────────────────────────────────────────────────

function getApi(channel) {
  if (channel === "meta") return metaApi;
  if (channel === "google") return googleApi;
  if (channel === "tiktok") return tiktokApi;
  return null;
}

/**
 * @swagger
 * /channels/connect:
 *   post:
 *     summary: Store ad channel credentials for a shop
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shop, channel, accessToken, accountId]
 *             properties:
 *               shop:
 *                 type: string
 *                 example: mi-tienda.myshopify.com
 *               channel:
 *                 type: string
 *                 enum: [meta, google, tiktok]
 *               accessToken:
 *                 type: string
 *               accountId:
 *                 type: string
 *               extra:
 *                 type: object
 *     responses:
 *       201:
 *         description: Channel credentials saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 channel:
 *                   type: object
 *       400:
 *         description: Missing or invalid params
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ── POST /channels/connect ───────────────────────────────────────────────────

router.post("/connect", (req, res) => {
  const { shop, channel, accessToken, accountId, extra } = req.body || {};
  if (!shop || typeof shop !== 'string') {
    console.warn("[Channels] shop requerido o inválido:", shop);
    return res.status(400).json({ error: "shop requerido" });
  }
  if (!SUPPORTED.includes(channel)) {
    console.warn(`[Channels] canal no soportado: ${channel}`);
    return res.status(400).json({ error: `canal no soportado, usa: ${SUPPORTED.join(", ")}` });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    console.warn("[Channels] accessToken requerido o inválido");
    return res.status(400).json({ error: "accessToken requerido" });
  }
  if (!accountId || typeof accountId !== 'string') {
    console.warn("[Channels] accountId requerido o inválido");
    return res.status(400).json({ error: "accountId requerido" });
  }

  try {
    const saved = channelStore.saveChannel(shop, channel, { accessToken, accountId, extra: extra || {} });
    console.log(`[Channels] Canal conectado: ${channel} para shop ${shop}`);
    res.status(201).json({ ok: true, channel: saved });
  } catch (err) {
    console.error(`[Channels] Error al guardar canal:`, err.stack || err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /channels:
 *   get:
 *     summary: List connected ad channels for a shop
 *     tags: [Channels]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Connected channels list (tokens redacted)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       channel:
 *                         type: string
 *                       accountId:
 *                         type: string
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ── GET /channels ────────────────────────────────────────────────────────────
const authSession = require("../middleware/authSession");
router.get("/", authSession, (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "shop requerido" });
  try {
    const channels = channelStore.listChannels(shop);
    res.json({ items: channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /channels/{channel}:
 *   delete:
 *     summary: Disconnect an ad channel from a shop
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: channel
 *         required: true
 *         schema:
 *           type: string
 *           enum: [meta, google, tiktok]
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Channel disconnected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       400:
 *         description: Missing shop or unsupported channel
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ── DELETE /channels/:channel ────────────────────────────────────────────────

router.delete("/:channel", authSession, (req, res) => {
  const { shop } = req.query;
  const { channel } = req.params;
  if (!shop || typeof shop !== 'string') {
    console.warn("[Channels] shop requerido o inválido en DELETE:", shop);
    return res.status(400).json({ error: "shop requerido" });
  }
  if (!SUPPORTED.includes(channel)) {
    console.warn(`[Channels] canal no soportado en DELETE: ${channel}`);
    return res.status(400).json({ error: "canal no soportado" });
  }
  channelStore.removeChannel(shop, channel);
  console.log(`[Channels] Canal eliminado: ${channel} para shop ${shop}`);
  res.json({ ok: true });
});

/**
 * @swagger
 * /channels/sync-campaign:
 *   post:
 *     summary: Push a VittoStore campaign to its ad channel API
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shop, campaignId]
 *             properties:
 *               shop:
 *                 type: string
 *                 example: mi-tienda.myshopify.com
 *               campaignId:
 *                 type: string
 *                 example: cmp_a1b2c3d4
 *     responses:
 *       200:
 *         description: Campaign synced to channel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 externalId:
 *                   type: string
 *                 platform:
 *                   type: string
 *       400:
 *         description: Missing params or channel not connected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Campaign not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Channel API error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ── POST /channels/sync-campaign ─────────────────────────────────────────────
// Pushes a VittoStore campaign to the specified ad channel.

router.post("/sync-campaign", async (req, res) => {
  const { shop, campaignId } = req.body || {};
  if (!shop || typeof shop !== 'string' || !campaignId || typeof campaignId !== 'string') {
    console.warn("[Channels] shop y campaignId requeridos o inválidos en sync-campaign:", shop, campaignId);
    return res.status(400).json({ error: "shop y campaignId requeridos" });
  }

  const campaign = campaignStore.getCampaign(campaignId);
  if (!campaign) {
    console.warn(`[Channels] Campaña no encontrada: ${campaignId}`);
    return res.status(404).json({ error: "Campana no encontrada" });
  }

  const channel = campaign.channel;
  const creds = channelStore.getChannelCreds(shop, channel);
  if (!creds) {
    console.warn(`[Channels] Canal ${channel} no conectado para tienda ${shop}`);
    return res.status(400).json({ error: `Canal ${channel} no conectado para esta tienda` });
  }

  const api = getApi(channel);
  if (!api) {
    console.warn(`[Channels] Canal no soportado en sync-campaign: ${channel}`);
    return res.status(400).json({ error: "Canal no soportado" });
  }

  try {
    const result = await api.createCampaign(creds, campaign);
    campaignStore.updateCampaign(campaignId, { externalId: result.externalId, syncedAt: new Date().toISOString() });
    console.log(`[Channels] Campaña sincronizada: ${campaignId} en canal ${channel}`);
    res.json({ ok: true, externalId: result.externalId, platform: result.platform });
  } catch (err) {
    console.error(`[Channels] Error al sincronizar campaña:`, err.stack || err.message);
    res.status(502).json({ error: `Error al sincronizar con ${channel}: ${err.message}` });
  }
});

/**
 * @swagger
 * /channels/metrics:
 *   get:
 *     summary: Fetch real-time metrics from channel and merge into campaign
 *     tags: [Channels]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *       - in: query
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *         example: cmp_a1b2c3d4
 *     responses:
 *       200:
 *         description: Live metrics merged into campaign
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 campaignId:
 *                   type: string
 *                 metrics:
 *                   type: object
 *       400:
 *         description: Missing params or campaign not yet synced
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Campaign not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Channel API error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ── GET /channels/metrics ─────────────────────────────────────────────────────
// Fetches real metrics from channel and merges into the campaign.
router.get("/metrics", async (req, res) => {
  const { shop, campaignId } = req.query;
  if (!shop || !campaignId) return res.status(400).json({ error: "shop y campaignId requeridos" });

  const campaign = campaignStore.getCampaign(campaignId);
  if (!campaign) return res.status(404).json({ error: "Campana no encontrada" });
  if (!campaign.externalId) return res.status(400).json({ error: "Campana aun no sincronizada con canal" });

  const channel = campaign.channel;
  const creds = channelStore.getChannelCreds(shop, channel);
  if (!creds) return res.status(400).json({ error: `Canal ${channel} no conectado` });

  const api = getApi(channel);
  if (!api) return res.status(400).json({ error: "Canal no soportado" });

  try {
    const metrics = await api.getCampaignMetrics(creds, campaign.externalId);
    // Merge real metrics back into stored campaign
    campaignStore.updateCampaign(campaignId, {
      metrics: { ...campaign.metrics, ...metrics },
      metricsUpdatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, campaignId, metrics });
  } catch (err) {
    res.status(502).json({ error: `Error al obtener metricas de ${channel}: ${err.message}` });
  }
});

module.exports = router;
