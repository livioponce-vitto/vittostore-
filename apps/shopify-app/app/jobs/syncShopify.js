// app/jobs/syncShopify.js
// Sincronización programada y manual de productos y órdenes desde Shopify
const cron = require('node-cron');
const shopifyService = require('../services/shopify');

// Sincronización programada cada hora
function syncAll() {
  // Implementa aquí la lógica real de sincronización
  shopifyService.syncProducts();
  shopifyService.syncOrders();
  console.log('Sincronización Shopify ejecutada');
}

// Programada (cada hora), solo si no es entorno de test
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 * * * *', syncAll);
}

// Exporta función para uso manual
module.exports = { syncAll };
