const express = require("express");
const shopify = require("../services/shopify");
const { loadSession } = require("../services/sessionStorage");
const { decryptToken } = require("./auth");

const router = express.Router();

function getSession(shop) {
  const session = loadSession(`offline_${shop}`);
  if (!session) {
    const err = new Error(`No hay sesion para la tienda: ${shop}`);
    err.code = "SESSION_NOT_FOUND";
    throw err;
  }

  const accessToken = session.isEncrypted
    ? decryptToken(session.accessToken)
    : session.accessToken;

  return { accessToken, session };
}

function getClient(shop, accessToken) {
  return new shopify.clients.Rest({ session: { shop, accessToken } });
}

function toErrorResponse(err) {
  if (err.code === "SESSION_NOT_FOUND") {
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

router.get("/overview", async (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const [productsResp, ordersResp] = await Promise.all([
      client.get({ path: "products", query: { limit: 50 } }),
      client.get({ path: "orders", query: { limit: 50, status: "any" } }),
    ]);

    const products = productsResp.body.products || [];
    const orders = ordersResp.body.orders || [];

    const lowStock = products.filter((p) => {
      const firstVariant = p.variants && p.variants[0];
      const qty = Number(firstVariant && firstVariant.inventory_quantity);
      return Number.isFinite(qty) && qty <= 5;
    }).length;

    const pendingOrders = orders.filter(
      (o) => o.financial_status !== "paid" || o.fulfillment_status !== "fulfilled"
    ).length;

    const revenue = orders.reduce((sum, o) => sum + Number(o.current_total_price || 0), 0);

    const alerts = [];
    if (pendingOrders > 0) {
      alerts.push({
        type: "warning",
        title: "Ordenes por revisar",
        description: `${pendingOrders} orden(es) pendientes de pago o despacho.`,
        action: "Revisar ordenes",
      });
    }
    if (lowStock > 0) {
      alerts.push({
        type: "danger",
        title: "Stock bajo detectado",
        description: `${lowStock} producto(s) con inventario critico.`,
        action: "Ver productos",
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        type: "success",
        title: "Todo en orden",
        description: "No hay alertas criticas por ahora.",
        action: "Actualizar",
      });
    }

    return res.json({
      ok: true,
      status: {
        server: "online",
        oauth: "connected",
        shop,
      },
      kpis: {
        ordersToday: orders.length,
        productsActive: products.length,
        revenueToday: Number(revenue.toFixed(2)),
        lowStock,
      },
      alerts,
      quickActions: [
        { id: "create-product", label: "Crear producto rapido" },
        { id: "refresh", label: "Actualizar panel" },
      ],
    });
  } catch (err) {
    console.error("[dashboard/overview] Error:", err.message);
    const response = toErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

router.get("/products", async (req, res) => {
  const { shop, limit = 20 } = req.query;

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);
    const response = await client.get({
      path: "products",
      query: { limit: Math.min(Number(limit) || 20, 100) },
    });

    return res.json({ ok: true, items: response.body.products || [] });
  } catch (err) {
    console.error("[dashboard/products] Error:", err.message);
    const response = toErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

router.get("/orders", async (req, res) => {
  const { shop, limit = 20 } = req.query;

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);
    const response = await client.get({
      path: "orders",
      query: { limit: Math.min(Number(limit) || 20, 100), status: "any" },
    });

    return res.json({ ok: true, items: response.body.orders || [] });
  } catch (err) {
    console.error("[dashboard/orders] Error:", err.message);
    const response = toErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

router.post("/quick-actions/create-product", async (req, res) => {
  const { shop } = req.query;
  const { title, price, inventory } = req.body || {};

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  if (!title) {
    return res.status(400).json({ ok: false, error: "Campo 'title' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);

    const response = await client.post({
      path: "products",
      type: "application/json",
      data: {
        product: {
          title,
          status: "draft",
          variants: [
            {
              price: Number(price || 0),
              inventory_management: "shopify",
              inventory_quantity: Number(inventory || 0),
            },
          ],
        },
      },
    });

    return res.status(201).json({ ok: true, product: response.body.product });
  } catch (err) {
    console.error("[dashboard/create-product] Error:", err.message);
    const response = toErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

router.post("/quick-actions/orders/:id/close", async (req, res) => {
  const { shop } = req.query;
  const { id } = req.params;

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Param 'shop' requerido" });
  }

  try {
    const { accessToken } = getSession(shop);
    const client = getClient(shop, accessToken);
    const response = await client.post({ path: `orders/${id}/close`, data: {} });

    return res.json({ ok: true, order: response.body.order });
  } catch (err) {
    console.error("[dashboard/order-close] Error:", err.message);
    const response = toErrorResponse(err);
    return res.status(response.status).json(response.body);
  }
});

module.exports = router;
