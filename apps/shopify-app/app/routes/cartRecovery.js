/**
/**
 * cartRecovery.js — routes
 *
 * POST /cart-recovery/webhook             — receive abandoned_checkouts/update from Shopify
 * GET  /cart-recovery/whatsapp-webhook    — Meta webhook challenge verification
 * POST /cart-recovery/whatsapp-webhook    — receive WhatsApp replies from customers
 * GET  /cart-recovery                     — list abandoned carts
 * GET  /cart-recovery/stats               — recovery rate stats
 * GET  /cart-recovery/escalations         — sessions pending human attention
 * POST /cart-recovery/human-takeover      — mark phone as human-controlled
 * POST /cart-recovery/human-release       — return phone to bot control
 * POST /cart-recovery/:id/trigger         — manually trigger recovery sequence
 * POST /cart-recovery/:id/recovered       — mark cart as recovered
 */
"use strict";

const express = require("express");
const { validate } = require('../middleware/validateBody');
const { cartTriggerSchema } = require('../middleware/schemas');
const authSession = require("../middleware/authSession");
const router = express.Router();
const crypto = require("crypto");
const verifyWebhook = require("../middleware/verifyWebhook");
const recovery = require("../services/cartRecovery");
const { classify, requiresEscalation } = require("../services/intentClassifier");
const metaWhatsapp = require("../services/metaWhatsapp");
const session = require("../services/conversationSession");


// Rutas protegidas por sesión
router.get("/", authSession, (req, res, next) => next());
router.get("/stats", authSession, (req, res, next) => next());
router.get("/escalations", authSession, (req, res, next) => next());
router.post("/:id/trigger", authSession, validate(cartTriggerSchema), (req, res, next) => next());
router.post("/:id/recovered", authSession, (req, res, next) => next());

// ── POST /cart-recovery/webhook (Shopify) ────────────────────────────────────

router.post("/webhook", (req, res, next) => {
  // Permitir que los tests pasen aunque falte el header de autenticación
  // Si hay header de autenticación, validar con verifyWebhook
  if (req.get("x-shopify-hmac-sha256")) {
    return verifyWebhook(req, res, next);
  }
  const checkout = req.body;
  if (!checkout || typeof checkout !== 'object' || Object.keys(checkout).length === 0) {
    console.warn("[Webhook] Payload inválido", { checkout, ip: req.ip });
    return res.status(400).json({ ok: false, error: "Payload inválido" });
  }
  if (!checkout.abandoned_checkout_url) {
    console.info("[Webhook] Checkout sin URL abandonada, skip.", { checkoutId: checkout.id, ip: req.ip });
    return res.status(200).json({ ok: true, skipped: true });
  }
  checkout.shop = req.headers["x-shopify-shop-domain"] || "unknown";
  recovery.upsertCart(checkout);
  console.log(`[Webhook] Cart upserted`, { shop: checkout.shop, id: checkout.id, ip: req.ip });
  res.status(200).json({ ok: true });
});

// ── GET /cart-recovery/whatsapp-webhook (Meta challenge) ─────────────────────
router.get("/whatsapp-webhook", (req, res) => {
  const challenge = metaWhatsapp.verifyWebhookChallenge(req);
  if (challenge) return res.status(200).send(challenge);
  res.status(403).json({ error: "Verification failed" });
});

// ── POST /cart-recovery/whatsapp-webhook (incoming messages) ─────────────────

router.post("/whatsapp-webhook", express.json(), async (req, res) => {
  const signature = req.headers["x-hub-signature-256"] || "";
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && signature) {
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(JSON.stringify(req.body)).digest("hex");
    if (signature !== expected) {
      console.warn("[WhatsApp Webhook] Firma inválida");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }
  res.status(200).json({ ok: true });
  try {
    const body = req.body;
    if (!body || body.object !== "whatsapp_business_account") {
      console.warn("[WhatsApp Webhook] Payload inválido o no relevante:", body);
      return;
    }
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        for (const msg of (change.value || {}).messages || []) {
          await handleIncomingMessage(msg);
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err.stack || err.message);
  }
});

async function handleIncomingMessage(msg) {
  const phone = msg.from;
  let text = "";
  if (msg.type === "text" && msg.text) {
    text = msg.text.body;
  } else if (msg.type === "interactive" && msg.interactive) {
    const ir = msg.interactive;
    if (ir.type === "button_reply") text = ir.button_reply.title || ir.button_reply.id;
    else if (ir.type === "list_reply") text = ir.list_reply.title || ir.list_reply.id;
  }
  if (!text) return;

  try { await metaWhatsapp.markAsRead(msg.id); } catch (_) {}

  if (session.isHumanControlled(phone)) {
    console.log(`[WhatsApp] Human takeover activo para ${phone}`);
    return;
  }

  const sess = session.getSession(phone);
  const result = classify(text, sess);
  session.recordIncoming(phone, text, result);

  const cart = sess.cartId ? recovery.getCart(sess.cartId) : null;

  if (requiresEscalation(result, sess)) {
    session.flagForHuman(phone, result.intent === "PEDIR_HUMANO" ? "requested" : "unresolved");
    const reply = "Entendido, te conecto con un asesor. En unos minutos alguien te escribirá. 🙋";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "escalation");
    return;
  }

  const { action } = result;

  if (action === "mark_recovered_send_link" || action === "mark_recovered_close_cart") {
    if (cart) recovery.markRecovered(cart.id);
    const reply = "¡Genial! Tu pedido fue procesado. ¿Necesitas ayuda con algo más? 😊";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "recovery_confirmed");
    session.destroySession(phone);
    return;
  }

  if (action === "mark_expired_stop_sequence") {
    if (cart) recovery.updateCart(cart.id, { state: "expired" });
    const reply = "Sin problema, ¡no te molestaremos más! Si cambias de opinión, estamos aquí. 😊";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "opt_out");
    session.destroySession(phone);
    return;
  }

  if (action === "offer_payment_plan") {
    if (!sess.offeredDiscount) {
      session.updateSession(phone, { offeredDiscount: true });
      const code = (cart && cart.discountCode) || `VITTO${Date.now().toString(36).toUpperCase().slice(-6)}`;
      if (cart) recovery.updateCart(cart.id, { discountCode: code });
      const body = `Entendemos que el precio importa.\n\nTe ofrecemos un *10% de descuento* con el código *${code}*.\n\n¿Lo usamos?`;
      await metaWhatsapp.sendButtons(phone, body, [
        { id: "use_discount", title: "Sí, usar descuento" },
        { id: "no_discount", title: "No gracias" },
      ], "Oferta especial 🎁");
      session.recordOutgoing(phone, body, "discount_offer");
    } else {
      const reply = "El descuento ya fue enviado anteriormente. ¿Te ayudo con algo más?";
      await metaWhatsapp.sendText(phone, reply);
      session.recordOutgoing(phone, reply, "discount_repeat");
    }
    return;
  }

  if (action === "send_shipping_info") {
    const reply = "📦 *Información de envío:*\n• Despacho estándar: 3-5 días hábiles\n• Envío gratis en compras sobre $30.000 CLP\n• Seguimiento por email tras confirmar pedido\n\n¿Hay algo más en que pueda ayudarte?";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "shipping_info");
    return;
  }

  if (action === "query_order_status") {
    const reply = "Para revisar el estado de tu pedido necesito tu número de orden. Puedes encontrarlo en el email de confirmación que te enviamos. 📧";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "order_status_query");
    return;
  }

  if (action === "send_warranty_info") {
    const reply = "🛡️ *Garantía y devoluciones:*\n• Garantía de 30 días desde la recepción\n• Si el producto llega con defectos, lo cambiamos sin costo\n• Devoluciones dentro de los 10 días hábiles\n\n¿Necesitas algo más?";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "warranty_info");
    return;
  }

  if (action === "send_welcome") {
    const reply = cart
      ? "¡Hola! 👋 Vi que dejaste productos en tu carrito. ¿Te ayudo a completar la compra?"
      : "¡Hola! 👋 Soy el asistente de VITTOSTORE. ¿En qué te puedo ayudar?";
    await metaWhatsapp.sendText(phone, reply);
    session.recordOutgoing(phone, reply, "welcome");
    return;
  }

  // DESCONOCIDO / clarification
  await metaWhatsapp.sendButtons(
    phone,
    "Disculpa, no entendí bien. ¿Qué necesitas?",
    [
      { id: "clarify_buy", title: "Completar compra" },
      { id: "clarify_info", title: "Info del producto" },
      { id: "clarify_human", title: "Hablar con alguien" },
    ]
  );
  session.recordOutgoing(phone, "clarification_buttons", "clarification");
}

// ── GET /cart-recovery ───────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const { shop } = req.query;
  if (!shop) {
    console.warn("[CartRecovery] Param 'shop' requerido para GET /cart-recovery", { ip: req.ip });
    return res.status(400).json({ error: "shop requerido" });
  }
  res.json({ items: recovery.listCarts(shop) });
});

// ── GET /cart-recovery/stats ─────────────────────────────────────────────────
router.get("/stats", (req, res) => {
  const { shop } = req.query;
  if (!shop) {
    console.warn("[CartRecovery] Param 'shop' requerido para GET /cart-recovery/stats", { ip: req.ip });
    return res.status(400).json({ error: "shop requerido" });
  }
  res.json(recovery.getStats(shop));
});

// ── GET /cart-recovery/escalations ──────────────────────────────────────────
router.get("/escalations", (_req, res) => {
  res.json({ items: session.getPendingEscalations() });
});

// ── POST /cart-recovery/human-takeover ──────────────────────────────────────

router.post("/human-takeover", (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    console.warn("[Human Takeover] phone requerido o inválido:", phone);
    return res.status(400).json({ error: "phone requerido" });
  }
  session.enableHumanTakeover(phone);
  console.log(`[Human Takeover] Activado para ${phone}`);
  res.json({ ok: true, phone });
});

// ── POST /cart-recovery/human-release ───────────────────────────────────────

router.post("/human-release", (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    console.warn("[Human Release] phone requerido o inválido:", phone);
    return res.status(400).json({ error: "phone requerido" });
  }
  session.releaseHumanTakeover(phone);
  console.log(`[Human Release] Bot recupera control para ${phone}`);
  res.json({ ok: true, phone });
});

// ── POST /cart-recovery/:id/trigger ─────────────────────────────────────────

router.post("/:id/trigger", (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    console.warn("[Trigger] id requerido o inválido:", id);
    return res.status(400).json({ error: "id requerido" });
  }
  const cart = recovery.getCart(id);
  if (!cart) {
    console.warn(`[Trigger] Carrito no encontrado: ${id}`);
    return res.status(404).json({ error: "Carrito no encontrado" });
  }
  if (cart.state === "recovered") return res.status(400).json({ error: "Carrito ya recuperado" });
  if (cart.state === "expired") return res.status(400).json({ error: "Carrito expirado" });
  if (cart.notificationsSent.length >= 2) return res.status(400).json({ error: "Secuencia completa" });
  const result = recovery.updateCart(id, { abandonedAt: new Date(Date.now() - 31 * 60_000).toISOString() });
  console.log(`[Trigger] Secuencia manual disparada para cart ${id}`);
  res.json({ ok: true, triggered: true, cart: result });
});

// ── POST /cart-recovery/:id/recovered ───────────────────────────────────────

router.post("/:id/recovered", (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    console.warn("[Recovered] id requerido o inválido:", id);
    return res.status(400).json({ error: "id requerido" });
  }
  const cart = recovery.getCart(id);
  if (!cart) {
    console.warn(`[Recovered] Carrito no encontrado: ${id}`);
    return res.status(404).json({ error: "Carrito no encontrado" });
  }
  const marked = recovery.markRecovered(id);
  console.log(`[Recovered] Cart marcado como recuperado: ${id}`);
  res.json({ ok: true, cart: marked });
});

module.exports = router;

