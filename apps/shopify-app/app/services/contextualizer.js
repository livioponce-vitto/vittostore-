// contextualizer.js
// Simula la contextualización del mensaje, cliente y producto

/**
 * Contextualiza el mensaje: carga perfil, producto y genera adaptación
 * @returns {Promise<{customer: object, product: object, adaptation: object}>}
 */
async function contextualize(message, customerId, productId) {
  // Simulación: en producción, cargar de DB
  const customer = { customer_id: customerId, segment: 'NUEVO', total_orders: 0 };
  const product = { product_id: productId, product_name: 'Producto Demo', complexity: 'SIMPLE' };
  const adaptation = { tone_level: 'MUY_SIMPLE', max_words_per_message: 25 };
  return { customer, product, adaptation };
}

module.exports = { contextualize };
