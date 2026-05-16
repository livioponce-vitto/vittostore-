const express = require("express");
const shopify = require("../services/shopify");
const { loadSession } = require("../services/sessionStorage");
const { decryptToken } = require("./auth");


const authSession = require("../middleware/authSession");
const { validate } = require('../middleware/validateBody');
const { productSchema, productUpdateSchema } = require('../middleware/schemas');
const router = express.Router();

// Aplica middleware a todas las rutas de products
router.use(authSession);

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
 * /products:
 *   get:
 *     summary: List products with cursor-based pagination
 *     tags: [Products]
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
 *         name: page_info
 *         schema:
 *           type: string
 *         description: Cursor token for next/previous page
 *     responses:
 *       200:
 *         description: Paginated list of products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
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
// ── GET /products?shop=xxx&limit=10&page_info=xxx ────────────────────────────
// Lista productos con paginacion cursor-based
router.get("/", async (req, res) => {
  const { shop, limit = 10, page_info } = req.query;
  console.info(`[Products] GET /products`, { shop, limit, page_info, ip: req.ip });

  if (!shop || typeof shop !== 'string') {
    console.warn("[Products] Param 'shop' requerido o inválido", { shop, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const params = { limit: Math.min(Number(limit), 250) };
    if (page_info) params.page_info = page_info;

    const response = await client.get({ path: "products", query: params });

    return res.json({
      ok: true,
      products: response.body.products,
      pagination: response.pageInfo || null,
    });
  } catch (err) {
    console.error("[products] Error", { error: err.message, stack: err.stack, shop, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a single product by ID
 *     tags: [Products]
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
 *         description: Product found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 product:
 *                   $ref: '#/components/schemas/Product'
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
// ── GET /products/:id?shop=xxx ───────────────────────────────────────────────
// Obtiene un producto por ID
router.get("/:id", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Products] Param 'shop' requerido para GET /products/:id", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }
  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.get({ path: `products/${id}` });

    return res.json({ ok: true, product: response.body.product });
  } catch (err) {
    console.error("[products/:id] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
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
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Zapatillas VittoStore
 *               status:
 *                 type: string
 *                 enum: [active, draft, archived]
 *                 default: draft
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 product:
 *                   $ref: '#/components/schemas/Product'
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
// ── POST /products?shop=xxx ──────────────────────────────────────────────────
// Crea un producto nuevo
router.post("/", async (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    console.warn("[Products] Param 'shop' requerido para POST /products", { ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.post({
      path: "products",
      data: { product: req.body },
      type: "application/json",
    });

    return res.status(201).json({ ok: true, product: response.body.product });
  } catch (err) {
    console.error("[products POST] Error", { error: err.message, stack: err.stack, shop, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update an existing product
 *     tags: [Products]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, draft, archived]
 *     responses:
 *       200:
 *         description: Product updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 product:
 *                   $ref: '#/components/schemas/Product'
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
// ── PUT /products/:id?shop=xxx ───────────────────────────────────────────────
// Actualiza un producto existente
router.put("/:id", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Products] Param 'shop' requerido para PUT /products/:id", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.put({
      path: `products/${id}`,
      data: { product: req.body },
      type: "application/json",
    });

    return res.json({ ok: true, product: response.body.product });
  } catch (err) {
    console.error("[products PUT] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
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
 *         description: Product deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 deleted:
 *                   type: string
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
// ── DELETE /products/:id?shop=xxx ────────────────────────────────────────────
// Elimina un producto
router.delete("/:id", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    console.warn("[Products] Param 'shop' requerido para DELETE /products/:id", { id, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    await client.delete({ path: `products/${id}` });

    return res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error("[products DELETE] Error", { error: err.message, stack: err.stack, shop, id, ip: req.ip });
    const response = buildErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

module.exports = router;
