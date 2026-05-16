// adaptiveBotOrchestrator.js
// Orquesta: clasifica, adapta, responde y envía por WhatsApp, registra y aprende

const { classifyAndRespond } = require('./responseGenerator'); // Debe implementar esta función
const { sendText } = require('./metaWhatsapp');
const { logConversation } = require('./conversationLogger');

/**
 * Orquesta todo el flujo adaptativo y envío real
 * @param {Object} params
 * @param {string} params.message — Mensaje recibido
 * @param {string} params.customerId — ID del cliente
 * @param {string} params.productId — ID del producto (opcional)
 * @param {string} params.whatsappNumber — Número WhatsApp destino (sin +)
 * @returns {Promise<{ok: boolean, deliveryResult: any, classifiedIntent: any, adaptation: any, response: string}>}
 */
async function handleAdaptiveBot({ message, customerId, productId, whatsappNumber }) {
  // 1. Clasificar y adaptar
  const result = await classifyAndRespond(message, customerId, productId);
  // 2. Enviar por WhatsApp
  let deliveryResult = null;
  try {
    deliveryResult = await sendText(whatsappNumber, result.suggested_response);
  } catch (err) {
    deliveryResult = { error: err.message };
  }
  // 3. Registrar conversación
  logConversation({
    customerId,
    productId,
    message,
    classifiedIntent: {
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities
    },
    adaptation: result.adaptation,
    response: result.suggested_response,
    deliveryResult
  });
  // 4. Retornar resultado
  return {
    ok: !deliveryResult.error,
    deliveryResult,
    classifiedIntent: result.intent,
    adaptation: result.adaptation,
    response: result.suggested_response
  };
}

module.exports = { handleAdaptiveBot };
