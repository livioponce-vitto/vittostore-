const express = require("express");
const verifyWebhook = require("../middleware/verifyWebhook");
const router = express.Router();

/**
 * @swagger
 * /shopify/webhooks/orders/paid:
 *   post:
 *     summary: Shopify webhook — order paid event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: orders/paid
router.post("/webhooks/orders/paid", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] orders/paid: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] orders/paid from ${shop}`, { orderId: payload.id });
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] orders/paid: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/webhooks/orders/create:
 *   post:
 *     summary: Shopify webhook — order created event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: orders/create
router.post("/webhooks/orders/create", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] orders/create: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] orders/create from ${shop}`, { orderId: payload.id });
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] orders/create: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/webhooks/products/create:
 *   post:
 *     summary: Shopify webhook — product created event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: products/create
router.post("/webhooks/products/create", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] products/create: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] products/create from ${shop}`, { productId: payload.id, title: payload.title });
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] products/create: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/webhooks/app/scopes_update:
 *   post:
 *     summary: Shopify webhook — app scopes updated
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: app/scopes_update
router.post("/webhooks/app/scopes_update", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] app/scopes_update: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] app/scopes_update from ${shop}`, { shop, payload });
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] app/scopes_update: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/products/{id}/metafields/demo_info:
 *   get:
 *     summary: Get demo_info metafield for a product
 *     tags: [Shopify]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Shopify product ID
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Metafield data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 metafield:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Missing shop param
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
// --- BASE PARA METAOBJETOS Y METACAMPOS ---
// Ejemplo: obtener metacampo Demo Info de un producto
router.get("/products/:id/metafields/demo_info", async (req, res) => {
  const { id } = req.params;
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }
  try {
    const { accessToken } = require("../services/sessionStorage").loadSession(`offline_${shop}`) || {};
    if (!accessToken) throw new Error("Sesión inválida");
    const shopify = require("../services/shopify");
    const client = new shopify.clients.Rest({ session: { shop, accessToken } });
    const response = await client.get({ path: `products/${id}/metafields`, query: { namespace: "app", key: "demo_info" } });
    res.json({ ok: true, metafield: response.body.metafields[0] || null });
  } catch (err) {
    console.error("[metaobject] Error obteniendo Demo Info", { error: err.message, stack: err.stack, shop, id });
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * @swagger
 * /shopify/metaobjects/qrcode:
 *   post:
 *     summary: Create a QR Code metaobject (requires type app.qrcode defined in Shopify admin)
 *     tags: [Shopify]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, product, destination]
 *             properties:
 *               title:
 *                 type: string
 *               product:
 *                 type: string
 *               product_variant:
 *                 type: string
 *               destination:
 *                 type: string
 *                 enum: [product, checkout]
 *               scans:
 *                 type: integer
 *                 default: 0
 *     responses:
 *       200:
 *         description: Metaobject created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 metaobject:
 *                   type: object
 *       400:
 *         description: Missing shop param
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
// Ejemplo: crear metaobjeto QR Code (requiere definición previa en Shopify admin)
router.post("/metaobjects/qrcode", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }
  try {
    const { accessToken } = require("../services/sessionStorage").loadSession(`offline_${shop}`) || {};
    if (!accessToken) throw new Error("Sesión inválida");
    const shopify = require("../services/shopify");
    const client = new shopify.clients.Rest({ session: { shop, accessToken } });
    const { title, product, product_variant, destination, scans } = req.body;
    const response = await client.post({
      path: "metaobjects",
      data: {
        metaobject: {
          type: "app.qrcode",
          fields: {
            title,
            product,
            product_variant,
            destination,
            scans
          }
        }
      },
      type: "application/json"
    });
    res.json({ ok: true, metaobject: response.body.metaobject });
  } catch (err) {
    console.error("[metaobject] Error creando QR Code", { error: err.message, stack: err.stack, shop });
    res.status(500).json({ ok: false, error: err.message });
  }
});


/**
 * @swagger
 * /shopify/webhooks/products/update:
 *   post:
 *     summary: Shopify webhook — product updated event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: products/update
router.post("/webhooks/products/update", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] products/update: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] products/update from ${shop}`, { productId: payload.id, title: payload.title });
    // Aquí puedes agregar lógica de negocio
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] products/update: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/webhooks/orders/cancelled:
 *   post:
 *     summary: Shopify webhook — order cancelled event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: orders/cancelled
router.post("/webhooks/orders/cancelled", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] orders/cancelled: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] orders/cancelled from ${shop}`, { orderId: payload.id, reason: payload.cancel_reason });
    // Aquí puedes agregar lógica de negocio
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] orders/cancelled: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/webhooks/customers/create:
 *   post:
 *     summary: Shopify webhook — customer created event
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
// Webhook: customers/create
router.post("/webhooks/customers/create", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] customers/create: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    console.info(`[webhook] customers/create from ${shop}`, { customerId: payload.id, email: payload.email });
    // Aquí puedes agregar lógica de negocio
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] customers/create: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});

/**
 * @swagger
 * /shopify/config:
 *   get:
 *     summary: Get app configuration (host, scopes, API version)
 *     tags: [Shopify]
 *     responses:
 *       200:
 *         description: App configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 app:
 *                   type: string
 *                 hostName:
 *                   type: string
 *                 scopes:
 *                   type: string
 *                 runtime:
 *                   type: string
 *                 apiVersion:
 *                   type: string
 *       500:
 *         description: Internal error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/config", (req, res) => {
  try {
    const hostName = (process.env.SHOPIFY_APP_URL || process.env.HOST || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    res.json({
      ok: true,
      app: "VittoStore",
      hostName,
      scopes: process.env.SHOPIFY_SCOPES,
      runtime: process.env.SHOPIFY_RUNTIME || "node",
      apiVersion: "2025-07",
    });
  } catch (err) {
    console.error("[Shopify] Error en /config", { error: err.message, stack: err.stack, ip: req.ip });
    res.status(500).json({ ok: false, error: "Error obteniendo configuración" });
  }
});

/**
 * @swagger
 * /shopify/install:
 *   get:
 *     summary: Installation entrypoint for Shopify partner app setup
 *     tags: [Shopify]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Installation entrypoint ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 next:
 *                   type: string
 *                 shop:
 *                   type: string
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/install", (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    console.warn("[Shopify] Param 'shop' requerido para /install", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "Missing query param: shop" });
  }

  return res.status(200).json({
    ok: true,
    message: "Installation entrypoint ready",
    next: "Implement OAuth begin/callback with online session after partner app setup",
    shop,
  });
});



const { deleteSession } = require("../services/sessionStorage");

/**
 * @swagger
 * /shopify/webhooks/app/uninstalled:
 *   post:
 *     summary: Shopify webhook — app uninstalled (GDPR mandatory)
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Session deleted, app uninstalled
 *       400:
 *         description: Invalid payload or missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
router.post("/webhooks/app/uninstalled", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.error("[Shopify] app/uninstalled: header x-shopify-shop-domain requerido o inválido", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "shop header requerido" });
  }
  try {
    const payload = JSON.parse(req.body.toString());
    deleteSession(`offline_${shop}`);
    console.info(`[webhook] app/uninstalled from ${shop} (sesión eliminada)`, { shop, email: payload.email });
    res.status(200).send("ok");
  } catch (err) {
    console.error("[Shopify] app/uninstalled: error procesando payload", { error: err.message, stack: err.stack, shop, ip: req.ip });
    res.status(400).json({ ok: false, error: "Payload inválido" });
  }
});


/**
 * @swagger
 * /shopify/webhooks/customers/data_request:
 *   post:
 *     summary: Shopify GDPR — customer data request
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Request acknowledged
 *       400:
 *         description: Missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
router.post("/webhooks/customers/data_request", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.warn("[Shopify] customers/data_request: header x-shopify-shop-domain requerido o inválido");
    return res.status(400).send("shop header requerido");
  }
  console.log(`[webhook] customers/data_request from ${shop}`);
  res.status(200).send("ok");
});


/**
 * @swagger
 * /shopify/webhooks/customers/redact:
 *   post:
 *     summary: Shopify GDPR — customer data redact request
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Redact request acknowledged
 *       400:
 *         description: Missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
router.post("/webhooks/customers/redact", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.warn("[Shopify] customers/redact: header x-shopify-shop-domain requerido o inválido");
    return res.status(400).send("shop header requerido");
  }
  console.log(`[webhook] customers/redact from ${shop}`);
  res.status(200).send("ok");
});


/**
 * @swagger
 * /shopify/webhooks/shop/redact:
 *   post:
 *     summary: Shopify GDPR — shop data redact request
 *     tags: [Shopify]
 *     security:
 *       - WebhookHmac: []
 *     parameters:
 *       - in: header
 *         name: X-Shopify-Shop-Domain
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Shopify-Hmac-Sha256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Redact request acknowledged
 *       400:
 *         description: Missing shop header
 *       401:
 *         description: Invalid HMAC signature
 */
router.post("/webhooks/shop/redact", express.raw({ type: "*/*" }), verifyWebhook, (req, res) => {
  const shop = req.get("x-shopify-shop-domain");
  if (!shop || typeof shop !== 'string') {
    console.warn("[Shopify] shop/redact: header x-shopify-shop-domain requerido o inválido");
    return res.status(400).send("shop header requerido");
  }
  console.log(`[webhook] shop/redact from ${shop}`);
  res.status(200).send("ok");
});

module.exports = router;
