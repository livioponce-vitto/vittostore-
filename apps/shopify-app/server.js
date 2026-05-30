
require('dotenv').config();
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const { doubleCsrfProtection } = require("./app/middleware/csrfProtection");
const fs = require("fs");


// Verifica que .env exista, si no, muestra advertencia proactiva
if (!fs.existsSync(".env")) {
  console.warn("[SEGURIDAD] Archivo .env no encontrado. Usa .env.example como base y nunca subas tus credenciales a git.");
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de logging
const { logger, errorLogger } = require("./app/middleware/logger");
const { winstonLogger } = require("./app/middleware/winstonLogger");


// --- Seguridad HTTP ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.shopify.com", "'unsafe-inline'"],
      styleSrc:  ["'self'", "https://cdn.shopify.com", "'unsafe-inline'"],
      imgSrc:    ["'self'", "data:", "https:"],
      connectSrc:["'self'", "https://*.shopify.com", "https://api.anthropic.com"],
      frameSrc:  ["'none'"],
      frameAncestors: ["https://*.myshopify.com", "https://admin.shopify.com"],
    }
  }
}));
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  next();
});
app.use(cors({
  origin: function (origin, callback) {
    // Permitir Shopify, localhost y ngrok
    const allowed = [
      /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      /^https?:\/\/[a-z0-9-]+\.ngrok(-free)?\.dev$/
    ];
    if (!origin) return callback(null, true); // Permitir peticiones sin origen (curl, server-to-server)
    if (allowed.some(r => r.test(origin))) return callback(null, true);
    callback(new Error('No permitido por CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Shopify-Hmac-Sha256', 'X-Shopify-Shop-Domain'],
  exposedHeaders: ['X-Shopify-Hmac-Sha256', 'X-Shopify-Shop-Domain'],
  credentials: true
}));
app.use(xss());
app.use(mongoSanitize());
app.use(hpp());
// Rate limit general: 200 req / 15 min
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Máximo 200 peticiones por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiadas peticiones, intenta más tarde." }
}));

// Rate limit estricto: 10 req / 15 min para rutas sensibles
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Espera 15 minutos antes de reintentar.' }
});
app.use('/auth', strictLimiter);
app.use('/shopify/sync', strictLimiter);


// --- Logging ---
app.use(logger);
app.use(winstonLogger);

// --- Cookie parser (requerido para CSRF) ---
app.use(cookieParser());

// --- Protección CSRF con csrf-csrf (double-submit cookie pattern) ---
app.use(doubleCsrfProtection);

// --- MÉTRICAS PROMETHEUS ---
const promClient = require('./app/middleware/prometheusMetrics');
const client = require('prom-client');
// Contador de errores 5xx
const error5xxCounter = new client.Counter({
  name: 'vitto_errors_5xx_total',
  help: 'Total de respuestas 5xx generadas por la app',
});
app.use(promClient.metricsMiddleware);

// Middleware para contar errores 5xx
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (res.statusCode >= 500 && res.statusCode < 600) {
      error5xxCounter.inc();
    }
    return originalSend.apply(this, arguments);
  };
  next();
});

// --- Parsers ---
app.use((req, res, next) => {
  if (req.path.startsWith('/shopify/webhooks/')) return next();
  return express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Rutas y servicios
const shopifyRoutes = require("./app/routes/shopify");
const { router: authRoutes } = require("./app/routes/auth");
const productRoutes = require("./app/routes/products");
const orderRoutes = require("./app/routes/orders");
const dashboardRoutes = require("./app/routes/dashboard");
const campaignRoutes = require("./app/routes/campaigns");
const channelRoutes = require("./app/routes/channels");
const cartRecoveryRoutes = require("./app/routes/cartRecovery");
const adaptiveBotDemoRoutes = require("./app/routes/adaptiveBotDemo");
const dlqRoutes = require("./app/routes/dlq");
const cartRecovery = require("./app/services/cartRecovery");

// Swagger UI — disabled in test env
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./app/swagger');
if (process.env.NODE_ENV !== 'test') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

app.use("/auth", authRoutes);
app.use("/shopify", shopifyRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/campaigns", campaignRoutes);
app.use("/channels", channelRoutes);
app.use("/cart-recovery", cartRecoveryRoutes);
app.use("/api", adaptiveBotDemoRoutes);
app.use("/dlq", dlqRoutes);

/**
 * @swagger
 * /shopify/sync:
 *   post:
 *     summary: Trigger on-demand Shopify sync (requires X-Sync-Token)
 *     tags: [Shopify]
 *     security:
 *       - SyncToken: []
 *     responses:
 *       200:
 *         description: Sync initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Missing or invalid sync token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Sincronización Shopify bajo demanda
const { syncAll } = require('./app/jobs/syncShopify');

// DLQ Retry job - started automatically
require('./app/jobs/dlqRetryCron');

app.post('/shopify/sync', (req, res) => {
  const token = req.headers['x-sync-token'];
  if (!token || token !== process.env.SYNC_SECRET_TOKEN) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  syncAll();
  res.json({ ok: true, message: 'Sincronización iniciada' });
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Prometheus text format metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       500:
 *         description: Error collecting metrics
 */
// Endpoint /metrics robusto
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: App is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    app: "VittoStore Shopify App",
    timestamp: new Date().toISOString(),
  });
});


/**
 * @swagger
 * /status:
 *   get:
 *     summary: Check session validity, scopes and server health
 *     tags: [Health]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: false
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *     responses:
 *       200:
 *         description: Server and session status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 app:
 *                   type: string
 *                 env:
 *                   type: string
 *                 uptime:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 session:
 *                   type: object
 *                   nullable: true
 */
// ── GET /status ──────────────────────────────────────────────────────────────
// Verifica estado de sesión, permisos y salud del servidor
app.get("/status", (req, res) => {
  const { loadSession } = require("./app/services/sessionStorage");
  const shop = req.query.shop;
  const uptime = process.uptime();
  const base = {
    ok: true,
    app: "VittoStore Shopify App",
    env: process.env.NODE_ENV || "development",
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    timestamp: new Date().toISOString(),
  };

  if (!shop) {
    return res.json({ ...base, session: null, hint: "Agrega ?shop=tu-tienda.myshopify.com para ver estado de sesión" });
  }

  const session = loadSession(`offline_${shop}`);
  if (!session) {
    return res.json({ ...base, session: { valid: false, reason: "no_session" } });
  }

  const expired = session.expiresAt && new Date(session.expiresAt) < new Date();
  return res.json({
    ...base,
    session: {
      valid: !expired,
      shop: session.shop,
      scope: session.scope,
      installedAt: session.installedAt,
      expiresAt: session.expiresAt,
      expired,
    },
  });
});
// Manejo de rutas no encontradas
app.use((req, res, next) => {
  console.warn(`[404] Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    ok: false,
    error: 'Ruta no encontrada',
    next: 'Verifica la URL o consulta la documentación de la API.'
  });
});


// Middleware global de manejo de errores
app.use((err, req, res, next) => {
  errorLogger(err, req, res, () => {});
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Error interno del servidor',
    next: status === 401 ? 'Inicia sesión o renueva tu token.' : 'Contacta al soporte si el problema persiste.'
  });
});

if (require.main === module) {
  cartRecovery.startScheduler();
  app.listen(PORT, () => {
    console.log(`VittoStore app escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
// VittoStore Shopify App - server.js
