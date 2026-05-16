require("@shopify/shopify-api/adapters/node");
const { shopifyApi, LATEST_API_VERSION } = require("@shopify/shopify-api");

const requiredEnvVars = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_SCOPES",
  "ENCRYPTION_KEY",
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
if (!process.env.SHOPIFY_APP_URL && !process.env.HOST) {
  missingEnvVars.push("SHOPIFY_APP_URL or HOST");
}
if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

const hostName = (process.env.SHOPIFY_APP_URL || process.env.HOST)
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SHOPIFY_SCOPES.split(",").map((s) => s.trim()),
  hostName,
  apiVersion: process.env.SHOPIFY_API_VERSION || LATEST_API_VERSION,
  isEmbeddedApp: true,
});

// Funciones mock para sincronización
function syncProducts() {
  // Aquí irá la lógica real de sincronización de productos
  console.log('[shopifyService] syncProducts ejecutado (mock)');
  return Promise.resolve();
}

function syncOrders() {
  // Aquí irá la lógica real de sincronización de órdenes
  console.log('[shopifyService] syncOrders ejecutado (mock)');
  return Promise.resolve();
}

module.exports = Object.assign(shopify, {
  syncProducts,
  syncOrders
});
