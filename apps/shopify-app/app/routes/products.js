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
