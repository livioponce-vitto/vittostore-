// app/jobs/syncShopify.js
// Sincronización programada y manual de productos y órdenes desde Shopify
const cron = require('node-cron');
const shopifyService = require('../services/shopify');

// Sincronización programada cada hora
async function syncAll() {
  const timestamp = new Date().toISOString();
  console.log(`[syncShopify] Starting full sync at ${timestamp}`);

  let hasError = false;

  try {
    await shopifyService.syncProducts();
  } catch (err) {
    hasError = true;
    console.error(`[syncShopify] syncProducts failed at ${timestamp}:`, err.message);
  }

  try {
    await shopifyService.syncOrders();
  } catch (err) {
    hasError = true;
    console.error(`[syncShopify] syncOrders failed at ${timestamp}:`, err.message);
  }

  if (hasError) {
    console.warn(`[syncShopify] Sync completed with errors at ${new Date().toISOString()}`);
  } else {
    console.log(`[syncShopify] Sync completed successfully at ${new Date().toISOString()}`);
  }
}

// Programada (cada hora), solo si no es entorno de test
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 * * * *', syncAll);
}

// Exporta función para uso manual
module.exports = { syncAll };
