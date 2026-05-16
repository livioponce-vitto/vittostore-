const express = require("express");
const shopify = require("../services/shopify");
const { loadSession } = require("../services/sessionStorage");
const { decryptToken } = require("./auth");
const { validate } = require("../middleware/validateBody");
const { orderUpdateSchema, orderCloseSchema } = require("../middleware/schemas");

const router = express.Router();

// ── Helper: obtener cliente REST autenticado ─────────────────────────────────
function getClient(shop, accessToken) {
  return new shopify.clients.Rest({ session: { shop, accessToken } });
}

// ── Helper: cargar sesion y desencriptar token ────────────────────────────────
function getSession(shop) {
  const session = loadSession(`offline_${shop}`);
  if (!session) throw new Error(`No hay sesion para la tienda: ${shop}`);
  const accessToken = session.isEncrypted
    ? decryptToken(session.accessToken)
    : session.accessToken;
  return { shop, accessToken };
}

function buildErrorResponse(err) {
  if (err.message && err.message.startsWith("No hay sesion para la tienda:")) {
    return {
      status: 401,
      body: {
        ok: false,
        error: err.message,
        next: "Instala la app primero en /auth?shop=tu-tienda.myshopify.com",
      },
    };
  }

  return {
    status: 500,
    body: { ok: false, error: err.message || "Error interno" },
  };
}

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List orders with optional filters
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 250
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: any
 *           enum: [any, open, closed, cancelled]
 *       - in: query
 *         name: page_info
 *         schema:
 *           type: string
 *         description: Cursor token for next/previous page
 *     responses:
 *       200:
 *         description: Paginated list of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No session for shop
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
// ── GET /orders?shop=xxx&limit=10&status=any ─────────────────────────────────
// Lista ordenes con filtros opcionales
router.get("/", async (req, res) => {
  const { shop, limit = 10, status = "any", page_info } = req.query;
  console.info(`[Orders] GET /orders`, { shop, limit, status, page_info, ip: req.ip });

  if (!shop || typeof shop !== 'string') {
    console.warn("[Orders] Param 'shop' requerido o inválido", { shop, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const params = { limit: Math.min(Number(limit), 250), status };
    if (page_info) params.page_info = page_info;

    const response = await client.get({ path: "orders", query: params });

    return res.json({
      ok: true,
      orders: response.body.orders,
      pagination: response.pageInfo || null,
    });
  } catch (err) {
    console.error("[orders] Error", { error: err.message, stack: err.stack, shop, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get a single order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Shopify order ID
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Order found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No session for shop
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
// ── GET /orders/:id?shop=xxx ─────────────────────────────────────────────────
// Obtiene una orden por ID
router.get("/:id", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Orders] Param 'shop' requerido para GET /orders/:id", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.get({ path: `orders/${id}` });

    return res.json({ ok: true, order: response.body.order });
  } catch (err) {
    console.error("[orders/:id] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update an order (e.g. add note or tags)
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Shopify order ID
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
 *             properties:
 *               note:
 *                 type: string
 *               tags:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Missing shop param or invalid body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No session for shop
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
// ── PUT /orders/:id?shop=xxx ─────────────────────────────────────────────────
// Actualiza una orden (ej: agregar nota, tags)
router.put("/:id", validate(orderUpdateSchema), async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Orders] Param 'shop' requerido para PUT /orders/:id", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.put({
      path: `orders/${id}`,
      data: { order: req.body },
      type: "application/json",
    });

    return res.json({ ok: true, order: response.body.order });
  } catch (err) {
    console.error("[orders PUT] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /orders/{id}/close:
 *   post:
 *     summary: Close an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Shopify order ID
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Order closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No session for shop
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
// ── POST /orders/:id/close?shop=xxx ──────────────────────────────────────────
// Cierra una orden
router.post("/:id/close", validate(orderCloseSchema), async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Orders] Param 'shop' requerido para POST /orders/:id/close", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.post({ path: `orders/${id}/close`, data: {} });

    return res.json({ ok: true, order: response.body.order });
  } catch (err) {
    console.error("[orders/close] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Shopify order ID
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [customer, inventory, fraud, declined, other]
 *               email:
 *                 type: boolean
 *                 description: Send cancellation email
 *     responses:
 *       200:
 *         description: Order cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Missing shop param
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No session for shop
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
// ── POST /orders/:id/cancel?shop=xxx ─────────────────────────────────────────
// Cancela una orden
router.post("/:id/cancel", validate(orderCloseSchema), async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Orders] Param 'shop' requerido para POST /orders/:id/cancel", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.post({
      path: `orders/${id}/cancel`,
      data: req.body,
      type: "application/json",
    });

    return res.json({ ok: true, order: response.body.order });
  } catch (err) {
    console.error("[orders/cancel] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

module.exports = router;
