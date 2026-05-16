/**
 * metaWhatsapp.js
 * Envío real de mensajes vía Meta Cloud API (WhatsApp Business).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Variables de entorno requeridas:
 *   META_WHATSAPP_TOKEN      — Token de acceso permanente del sistema
 *   META_PHONE_NUMBER_ID     — ID del número de teléfono de WhatsApp Business
 */
"use strict";

const https = require("https");

const BASE_HOST = "graph.facebook.com";
const API_VERSION = "v20.0";

// ─── Helper HTTPS ─────────────────────────────────────────────────────────────

function metaPost(path, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: BASE_HOST,
      path: `/${API_VERSION}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message || "Meta API error"));
          else resolve(parsed);
        } catch {
          reject(new Error("Invalid JSON from Meta Cloud API"));
        }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function getConfig() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("META_WHATSAPP_TOKEN y META_PHONE_NUMBER_ID son requeridos en .env");
  }
  return { token, phoneNumberId };
}

// ─── Mensajes de texto simples ────────────────────────────────────────────────

/**
 * Envía un texto plano a un número de WhatsApp.
 * @param {string} to   — Número en formato internacional sin + (ej: 56912345678)
 * @param {string} text — Texto del mensaje
 */
async function sendText(to, text) {
  const { token, phoneNumberId } = getConfig();
  return metaPost(`/${phoneNumberId}/messages`, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

// ─── Mensajes con botones interactivos ───────────────────────────────────────
// Max 3 botones, texto max 20 chars por botón.

/**
 * @param {string} to
 * @param {string} bodyText
 * @param {{ id: string, title: string }[]} buttons  — max 3
 * @param {string} [headerText]
 * @param {string} [footerText]
 */
async function sendButtons(to, bodyText, buttons, headerText, footerText) {
  const { token, phoneNumberId } = getConfig();
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
  if (headerText) payload.interactive.header = { type: "text", text: headerText };
  if (footerText) payload.interactive.footer = { text: footerText };
  return metaPost(`/${phoneNumberId}/messages`, token, payload);
}

// ─── Mensajes de lista ────────────────────────────────────────────────────────
// Para menús con más de 3 opciones.

/**
 * @param {string} to
 * @param {string} bodyText
 * @param {string} buttonLabel  — Texto del botón que abre la lista (max 20 chars)
 * @param {{ title: string, rows: { id: string, title: string, description?: string }[] }[]} sections
 */
async function sendList(to, bodyText, buttonLabel, sections) {
  const { token, phoneNumberId } = getConfig();
  return metaPost(`/${phoneNumberId}/messages`, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections,
      },
    },
  });
}

// ─── Imagen con caption ───────────────────────────────────────────────────────

/**
 * @param {string} to
 * @param {string} imageUrl  — URL pública de la imagen
 * @param {string} [caption]
 */
async function sendImage(to, imageUrl, caption) {
  const { token, phoneNumberId } = getConfig();
  const image = { link: imageUrl };
  if (caption) image.caption = caption;
  return metaPost(`/${phoneNumberId}/messages`, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image,
  });
}

// ─── Marca el mensaje del cliente como leído ─────────────────────────────────

async function markAsRead(messageId) {
  const { token, phoneNumberId } = getConfig();
  return metaPost(`/${phoneNumberId}/messages`, token, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

// ─── Templates de recuperación de carrito ────────────────────────────────────
// Los mensajes se construyen aquí para mantenerlos centralizados.

/**
 * Primer mensaje de recuperación (30 min).
 */
async function sendCartRecovery1(to, productName, checkoutUrl, totalPrice) {
  return sendButtons(
    to,
    `¡Hola! Dejaste ${productName ? `"${productName}"` : "productos"} en tu carrito por ${totalPrice}.\n\n¿Te ayudamos a completar la compra?`,
    [
      { id: "cart_recover_yes", title: "Sí, comprar ahora" },
      { id: "cart_recover_later", title: "Más tarde" },
      { id: "cart_recover_no", title: "No me interesa" },
    ],
    "Tu carrito te espera 🛒",
    checkoutUrl ? `Enlace directo: ${checkoutUrl}` : undefined
  );
}

/**
 * Segundo mensaje de recuperación (24 h) con código de descuento.
 */
async function sendCartRecovery2(to, discountCode, checkoutUrl, totalPrice) {
  return sendButtons(
    to,
    `¡Última oportunidad! Tu carrito (${totalPrice}) sigue guardado.\n\nUsa el código *${discountCode}* para obtener 10% de descuento. Válido solo hoy.`,
    [
      { id: "cart_recover_discount", title: "Usar descuento" },
      { id: "cart_recover_human", title: "Hablar con alguien" },
      { id: "cart_recover_stop", title: "No gracias" },
    ],
    "Descuento exclusivo 🎁"
  );
}

// ─── Verificación de webhook (GET de validación de Meta) ─────────────────────

/**
 * Verifica el challenge de Meta para registrar el webhook.
 * Úsalo en tu ruta GET /cart-recovery/whatsapp-webhook.
 */
function verifyWebhookChallenge(req) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || "vittostore_verify";
  if (mode === "subscribe" && token === expected) return challenge;
  return null;
}

module.exports = {
  sendText,
  sendButtons,
  sendList,
  sendImage,
  markAsRead,
  sendCartRecovery1,
  sendCartRecovery2,
  verifyWebhookChallenge,
};
