const express = require("express");
const shopify = require("../services/shopify");
const { loadSession } = require("../services/sessionStorage");
const { decryptToken } = require("./auth");
const dlq = require("../services/dlq");

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

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Get dashboard KPIs, alerts and quick actions
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Dashboard overview with KPIs and alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 status:
 *                   type: object
 *                   properties:
 *                     server:
 *                       type: string
 *                     oauth:
 *                       type: string
 *                     shop:
 *                       type: string
 *                 kpis:
 *                   type: object
 *                   properties:
 *                     ordersToday:
 *                       type: integer
 *                     productsActive:
 *                       type: integer
 *                     revenueToday:
 *                       type: number
 *                     lowStock:
 *                       type: integer
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [warning, danger, success]
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
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

/**
 * @swagger
 * /dashboard/products:
 *   get:
 *     summary: List products for dashboard view
 *     tags: [Dashboard]
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
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Product list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
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
 */
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

/**
 * @swagger
 * /dashboard/orders:
 *   get:
 *     summary: List orders for dashboard view
 *     tags: [Dashboard]
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
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Order list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
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
 */
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

/**
 * @swagger
 * /dashboard/quick-actions/create-product:
 *   post:
 *     summary: Quick-create a draft product from dashboard
 *     tags: [Dashboard]
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
 *               price:
 *                 type: number
 *                 example: 29990
 *               inventory:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: Draft product created
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
 *         description: Missing shop or title
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
 */
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

/**
 * @swagger
 * /dashboard/quick-actions/orders/{id}/close:
 *   post:
 *     summary: Quick-close an order from dashboard
 *     tags: [Dashboard]
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
 */
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

/**
 * @swagger
 * /dashboard/dlq-metrics:
 *   get:
 *     summary: Get Dead Letter Queue metrics for dashboard
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: DLQ health metrics and recent failures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 queue:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     succeeded:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                 health:
 *                   type: object
 *                   properties:
 *                     failureRate:
 *                       type: number
 *                       description: Percentage of items that failed (0-100)
 *                     avgRetries:
 *                       type: number
 *                       description: Average retry attempts across all items
 *                     status:
 *                       type: string
 *                       enum: [healthy, warning, critical]
 *                 recentFailed:
 *                   type: array
 *                   maxItems: 5
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderId:
 *                         type: string
 *                       queueId:
 *                         type: string
 *                       failedAt:
 *                         type: string
 *                       attempts:
 *                         type: integer
 *                       lastError:
 *                         type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/dlq-metrics", (req, res) => {
  try {
    const stats = dlq.getStats();
    const failed = dlq.getFailedItems();

    const failureRate = stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(2) : 0;

    let avgRetries = 0;
    if (stats.total > 0) {
      const totalRetries = stats.items.reduce((sum, item) => sum + (item.retries || 0), 0);
      avgRetries = (totalRetries / stats.total).toFixed(2);
    }

    let queueStatus = "healthy";
    if (failureRate > 50) queueStatus = "critical";
    else if (failureRate > 20) queueStatus = "warning";

    const recentFailed = failed.slice(0, 5).map((item) => ({
      orderId: item.orderId,
      queueId: item.queueId,
      failedAt: item.failedAt,
      attempts: item.attempts.length,
      lastError: item.attempts[item.attempts.length - 1]?.error || "Unknown",
    }));

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      queue: {
        total: stats.total,
        pending: stats.pending,
        succeeded: stats.succeeded,
        failed: stats.failed,
      },
      health: {
        failureRate: Number(failureRate),
        avgRetries: Number(avgRetries),
        status: queueStatus,
      },
      recentFailed,
    });
  } catch (error) {
    console.error("[dashboard/dlq-metrics] Error:", error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /dlq/retry/{queueId}:
 *   post:
 *     summary: Manually retry a failed queue item
 *     tags: [DLQ]
 *     parameters:
 *       - in: path
 *         name: queueId
 *         required: true
 *         schema:
 *           type: string
 *         description: DLQ queue item ID
 *     responses:
 *       200:
 *         description: Item reset for retry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 queueId:
 *                   type: string
 *                 orderId:
 *                   type: string
 *                 nextRetryAt:
 *                   type: string
 *       404:
 *         description: Queue item not found
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
router.post("/dlq/retry/:queueId", (req, res) => {
  const { queueId } = req.params;

  try {
    const item = dlq.resetItemForRetry(queueId);
    res.json({
      ok: true,
      queueId: item.queueId,
      orderId: item.orderId,
      nextRetryAt: item.nextRetryAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[dlq/retry] Error:", error.message);
    if (error.code === "QUEUE_ITEM_NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /dlq/batch-retry:
 *   post:
 *     summary: Manually retry multiple failed queue items
 *     tags: [DLQ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               queueIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of queueIds to retry
 *               retryAll:
 *                 type: boolean
 *                 description: If true, retries all failed items (ignores queueIds)
 *     responses:
 *       200:
 *         description: Batch retry results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 successful:
 *                   type: array
 *                   items:
 *                     type: object
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     succeeded:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *       400:
 *         description: Invalid request
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
router.post("/dlq/batch-retry", (req, res) => {
  const { queueIds = [], retryAll } = req.body || {};

  try {
    let itemsToRetry = queueIds;

    if (retryAll) {
      const failedItems = dlq.getFailedItems();
      itemsToRetry = failedItems.map(item => item.queueId);
    }

    if (!retryAll && (!Array.isArray(queueIds) || queueIds.length === 0)) {
      return res.status(400).json({
        ok: false,
        error: "queueIds array is required and must not be empty, or set retryAll to true",
        timestamp: new Date().toISOString(),
      });
    }

    const results = dlq.batchResetItemsForRetry(itemsToRetry);

    res.json({
      ok: true,
      successful: results.successful,
      failed: results.failed,
      summary: results.summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[dlq/batch-retry] Error:", error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
