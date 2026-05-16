// responseGenerator.js
// Implementa classifyAndRespond: pipeline adaptativo

const { classify } = require('./intentClassifier'); // Debe existir
const { contextualize } = require('./contextualizer'); // Debe existir

/**
 * Clasifica, adapta y genera respuesta sugerida
 * @param {string} message
 * @param {string} customerId
 * @param {string} [productId]
 * @returns {Promise<{intent: string, confidence: number, entities: object, adaptation: object, suggested_response: string}>}
 */
async function classifyAndRespond(message, customerId, productId) {
  // 1. Contextualizar
  const { customer, product, adaptation } = await contextualize(message, customerId, productId);
  // 2. Clasificar intención
  const { intent, confidence, entities } = classify(message, adaptation);
  // 3. Generar respuesta adaptada
  const suggested_response = generateResponse(intent, entities, customer, product, adaptation);
  return { intent, confidence, entities, adaptation, suggested_response };
}

// Dummy para demo, reemplazar por lógica real
function generateResponse(intent, entities, customer, product, adaptation) {
  // Aquí iría la lógica de generación adaptativa
  return `[${intent.toUpperCase()}] Respuesta adaptada para ${customer.customer_id}`;
}

module.exports = { classifyAndRespond };
