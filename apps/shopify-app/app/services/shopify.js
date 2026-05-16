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

async function syncProducts() {
  const shop = process.env.SHOPIFY_SHOP_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const client = new shopify.clients.Rest({ session: { shop, accessToken } });

  const allProducts = [];
  let pageInfo = null;

  try {
    do {
      const params = { limit: 250 };
      if (pageInfo) params.page_info = pageInfo;

      const response = await client.get({ path: 'products', query: params });
      const products = response.body.products || [];
      allProducts.push(...products);

      const linkHeader = response.headers?.get('link') || '';
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
    } while (pageInfo);

    console.log(`[syncShopify] Synced ${allProducts.length} products`);
    return allProducts;
  } catch (err) {
    console.error('[syncShopify] Error syncing products:', err.message);
    throw err;
  }
}

async function syncOrders() {
  const shop = process.env.SHOPIFY_SHOP_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const client = new shopify.clients.Rest({ session: { shop, accessToken } });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const allOrders = [];
  let pageInfo = null;

  try {
    do {
      const params = { limit: 250, status: 'any', created_at_min: since };
      if (pageInfo) params.page_info = pageInfo;

      const response = await client.get({ path: 'orders', query: params });
      const orders = response.body.orders || [];
      allOrders.push(...orders);

      const linkHeader = response.headers?.get('link') || '';
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
    } while (pageInfo);

    console.log(`[syncShopify] Synced ${allOrders.length} orders`);
    return allOrders;
  } catch (err) {
    console.error('[syncShopify] Error syncing orders:', err.message);
    throw err;
  }
}

module.exports = Object.assign(shopify, {
  syncProducts,
  syncOrders
});
