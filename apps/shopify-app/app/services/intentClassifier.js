/**
 * intentClassifier.js
 * Clasificador de intenciones para conversaciones de WhatsApp.
 * Sin dependencias externas — regex ponderado con normalización.
 * Latencia < 1ms. Funciona offline. 9 intenciones.
 */

"use strict";

// ─── Normalización ────────────────────────────────────────────────────────────

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[¿¡!?.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Definición de intenciones ────────────────────────────────────────────────
// Cada intent tiene:
//   patterns : reglas ordenadas por especificidad descendente
//   score    : peso base (se suman según matches)
//   action   : qué debe hacer el orquestador

const INTENTS = [
  {
    name: "COMPRAR",
    action: "mark_recovered_send_link",
    patterns: [
      /\b(quiero|quier[oa]s?|quiero comprar|voy a comprar|lo compro|la compro)\b/,
      /\b(si quiero|claro que si|dale|va|ok|okay|listo|confirmo|acepto)\b/,
      /\b(proceder|pagar|finaliz|completa|termina)\b/,
      /\b(si[,.]?\s*(por favor|porfavor|gracias)?$)/,
    ],
  },
  {
    name: "RECHAZAR",
    action: "mark_expired_stop_sequence",
    patterns: [
      /\b(no (me interesa|gracias|quiero|necesito|lo quiero))\b/,
      /\b(cancelar|cancela|baja|stop|no molestar|no me escribas)\b/,
      /\b(ya no|dejalo|dejame|no estoy interesad[oa])\b/,
      /^no[.,!]?\s*$/,
    ],
  },
  {
    name: "OBJECION_PRECIO",
    action: "offer_payment_plan",
    patterns: [
      /\b(es (muy|demasiado)? caro|cuesta mucho|muy caro|sale caro|precio alto)\b/,
      /\b(no tengo (tanto|ese) (dinero|plata|presupuesto))\b/,
      /\b(hay algo mas barato|mas economico|descuento|oferta|promo)\b/,
      /\b(reducir? (el )?precio|baja (el )?precio)\b/,
    ],
  },
  {
    name: "PREGUNTA_ENVIO",
    action: "send_shipping_info",
    patterns: [
      /\b(cuanto (cuesta|vale|sale|cobra) (el |la )?(envio|despacho|shipping|flete|entrega))\b/,
      /\b(tienen envio|hay envio|envio gratis|despacho gratis|costo de envio)\b/,
      /\b(cuando llega|cuanto tarda|dias de entrega|plazo de entrega|tiempo de envio)\b/,
      /\b(envio|despacho|shipping|flete)\b.*\b(precio|costo|valor|gratis|rapido|demora)\b/,
      /\b(llega a|despachan a|envian a)\b/,
    ],
  },
  {
    name: "ESTADO_ORDEN",
    action: "query_order_status",
    patterns: [
      /\b(donde (esta|queda) mi (pedido|orden|compra|paquete))\b/,
      /\b(estado (de mi|del) (pedido|orden|envio|compra))\b/,
      /\b(cuando llega mi (pedido|paquete|compra))\b/,
      /\b(tracking|numero de seguimiento|rastrear|rastreo)\b/,
      /\b(mi pedido|mi orden|mi compra|mi paquete)\b.*\b(llego|llegar|estado|donde)\b/,
      /\b(ya salio|ya despachar|cuanto falta)\b/,
    ],
  },
  {
    name: "YA_COMPRE",
    action: "mark_recovered_close_cart",
    patterns: [
      /\b(ya compre|ya lo compre|ya la compre|ya realice la compra)\b/,
      /\b(ya pague|ya hice el pago|ya lo pague)\b/,
      /\b(lo tengo|ya lo tengo|ya me llego|ya llego mi pedido)\b/,
      /\b(ya compre en otro (lado|lugar|sitio))\b/,
    ],
  },
  {
    name: "PEDIR_HUMANO",
    action: "escalate_to_human",
    patterns: [
      /\b(hablar con (una |un )?(persona|humano|asesor|agente|vendedor|ejecutivo))\b/,
      /\b(quiero (hablar|comunicarme) con alguien)\b/,
      /\b(quiero (hablar|comunicarme) con (una |un )?(persona|humano|asesor|agente|vendedor))\b/,
      /\b(atiendeme|atencion humana|no quiero bot|eres un bot)\b/,
      /\b(manager|supervisor|jefe|encargado)\b/,
    ],
  },
  {
    name: "PREGUNTA_GARANTIA",
    action: "send_warranty_info",
    patterns: [
      /\b(tiene(n)? garantia|hay garantia|incluye garantia)\b/,
      /\b(que pasa si (llega malo|esta roto|no funciona|falla))\b/,
      /\b(devolucion|devolver|cambio|cambiar|reembolso)\b/,
      /\b(garantia|garantías)\b/,
    ],
  },
  {
    name: "SALUDO",
    action: "send_welcome",
    patterns: [
      /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|hi|hello)[.,!]?\s*$/,
      /^(buen[oa]s)[.,!]?\s*$/,
      /^(saludos|que tal|como estan)[.,!]?\s*$/,
    ],
  },
];

// ─── Motor de clasificación ───────────────────────────────────────────────────

/**
 * Clasifica la intención de un texto.
 * @param {string} text — Mensaje del cliente
 * @param {object} [context] — Contexto de sesión (opcional, mejora precisión)
 * @returns {{ intent: string, action: string, confidence: number, matches: number }}
 */
function classify(text, context = {}) {
  const norm = normalize(text);

  let best = { intent: "DESCONOCIDO", action: "request_clarification", confidence: 0, matches: 0 };

  for (const def of INTENTS) {
    let matches = 0;
    for (const pattern of def.patterns) {
      if (pattern.test(norm)) matches++;
    }
    if (matches === 0) continue;

    // Confianza: matches / total_patterns, acotada a [0.6, 0.99]
    const raw = matches / def.patterns.length;
    const confidence = Math.min(0.99, 0.6 + raw * 0.39);

    if (confidence > best.confidence) {
      best = { intent: def.name, action: def.action, confidence: +confidence.toFixed(2), matches };
    }
  }

  // Boost contextual: si el contexto indica que se ofreció plan de cuotas y el cliente dice "sí", es COMPRAR
  if (context.lastAction === "offer_payment_plan" && /^(si|dale|ok|listo|bueno|va)/.test(norm)) {
    best = { intent: "COMPRAR", action: "mark_recovered_send_link", confidence: 0.95, matches: 1 };
  }

  return best;
}

/**
 * ¿Requiere escalamiento inmediato?
 * @param {{ intent: string, confidence: number }} result
 * @param {{ messageCount?: number, negativeSentiment?: number }} session
 */
function requiresEscalation(result, session = {}) {
  if (result.intent === "PEDIR_HUMANO") return true;
  if (result.intent === "DESCONOCIDO" && (session.messageCount || 0) >= 3) return true;
  if (result.confidence < 0.6 && (session.messageCount || 0) >= 2) return true;
  return false;
}

module.exports = { classify, requiresEscalation, normalize };
