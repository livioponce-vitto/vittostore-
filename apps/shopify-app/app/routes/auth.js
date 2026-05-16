const crypto = require("crypto");
const express = require("express");
const shopify = require("../services/shopify");
const { saveSession } = require("../services/sessionStorage");

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes = 64 hex chars

const router = express.Router();

// ── AES-256-GCM: encriptar ──────────────────────────────────────────────────
function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

// ── AES-256-GCM: desencriptar ───────────────────────────────────────────────
function decryptToken(encryptedData) {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * @swagger
 * /auth:
 *   get:
 *     summary: Begin Shopify OAuth 2.0 flow
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         example: mi-tienda.myshopify.com
 *         description: Shopify store domain
 *     responses:
 *       302:
 *         description: Redirect to Shopify authorization page
 *       500:
 *         description: Error beginning OAuth
 */
// ── GET /auth ────────────────────────────────────────────────────────────────
// HMAC validado automaticamente por @shopify/shopify-api
router.get("/", async (req, res) => {
  try {
    await shopify.auth.begin({
      shop: req.query.shop,
      callbackPath: "/auth/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (err) {
    console.error("[auth] Error en inicio de OAuth", { error: err.message, stack: err.stack, ip: req.ip });
    res.status(500).send("Error iniciando autenticación con Shopify");
  }
});

/**
 * @swagger
 * /auth/callback:
 *   get:
 *     summary: Shopify OAuth callback — completes installation and saves encrypted token
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Shopify
 *       - in: query
 *         name: shop
 *         required: true
 *         schema:
 *           type: string
 *         description: Shopify store domain
 *       - in: query
 *         name: hmac
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC signature to verify authenticity
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to /app after successful installation
 *       500:
 *         description: Error during OAuth callback
 */
// ── GET /auth/callback ───────────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { shop, accessToken, scope } = callback.session;

    // Encriptar token antes de persistir (nunca en texto plano)
    const encryptedToken = encryptToken(accessToken);


    // Token de Shopify típicamente expira en 24h para sesiones online, pero offline es indefinido. Puedes ajustar según tu flujo:
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 días por defecto

    saveSession({
      id: `offline_${shop}`,
      shop,
      scope,
      accessToken: encryptedToken,
      isEncrypted: true,
      installedAt: new Date().toISOString(),
      expiresAt,
    });

    console.log(`[auth/callback] Instalado`, { shop, scope, ip: req.ip });

    return res.redirect(`/app?shop=${shop}`);
  } catch (error) {
    console.error("[auth/callback] Error", { error: error.message, stack: error.stack, ip: req.ip });
    return res.status(500).send("Error en autenticacion");
  }
});

module.exports = { router, decryptToken };
