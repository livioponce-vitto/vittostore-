/**
 * oraculo.js
 * Client service for Oraculo Backend API (/transacciones/bulk endpoint)
 * Handles authentication, transaction payload construction, and bulk order syncing
 */

const https = require('https');
const http = require('http');

const ORACULO_API_URL = process.env.ORACULO_API_URL || 'http://localhost:3001/api';
const BULK_API_KEY = process.env.BULK_API_KEY || 'changeme-bulk-api-key-prod';

/**
 * Parse URL and determine if http or https
 */
function parseUrl(urlStr) {
  const url = new URL(urlStr);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    pathname: url.pathname
  };
}

/**
 * Low-level HTTP request wrapper
 */
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${ORACULO_API_URL}${path}`;
    const parsed = parseUrl(fullUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + path.substring(ORACULO_API_URL.length),
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': `Bearer ${BULK_API_KEY}`
      },
      timeout: 30000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || parsed.message || 'Unknown error'}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON from Oraculo API: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Transform Shopify order to Oraculo transaction format
 */
function transformShopifyOrderToTransaction(order) {
  if (!order || !order.id) {
    throw new Error('Invalid Shopify order: missing id');
  }

  const items = (order.line_items || []).map(item => ({
    externalProductId: item.product_id?.toString() || item.sku || `unknown-${item.id}`,
    productName: item.title || 'Unknown Product',
    quantity: item.quantity || 1,
    price: parseFloat(item.price || 0),
    sku: item.sku || undefined
  }));

  if (items.length === 0) {
    throw new Error('Order has no line items');
  }

  const subtotal = parseFloat(order.subtotal_price || 0);
  const tax = parseFloat(order.tax_price || 0);
  const shippingCost = (order.shipping_lines && order.shipping_lines[0])
    ? parseFloat(order.shipping_lines[0].price || 0)
    : 0;
  const total = parseFloat(order.total_price || 0);

  return {
    externalOrderId: order.id.toString(),
    customerId: order.customer?.id?.toString() || `cust-${order.id}`,
    customerEmail: order.customer?.email || order.email || `customer-${order.id}@shopify.local`,
    customerName: order.customer?.first_name && order.customer?.last_name
      ? `${order.customer.first_name} ${order.customer.last_name}`
      : order.billing_address?.name || 'Unknown',
    customerPhone: order.customer?.phone || order.billing_address?.phone || undefined,
    items,
    subtotal,
    tax,
    shipping: shippingCost,
    total,
    status: mapOrderStatus(order.fulfillment_status),
    paymentStatus: order.financial_status ? mapPaymentStatus(order.financial_status) : undefined,
    paymentMethod: order.payment_gateway_names?.[0] || undefined,
    paymentId: order.transactions?.[0]?.id?.toString() || undefined,
    shippingAddress: formatShippingAddress(order.shipping_address),
    notes: order.note || undefined,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

function mapOrderStatus(fulfillmentStatus) {
  const map = {
    'fulfilled': 'completed',
    'partial': 'processing',
    'unshipped': 'pending',
    'unconfirmed': 'pending',
    'voided': 'cancelled',
    'restocked': 'cancelled'
  };
  return map[fulfillmentStatus] || 'pending';
}

function mapPaymentStatus(financialStatus) {
  const map = {
    'authorized': 'processing',
    'pending': 'pending',
    'paid': 'succeeded',
    'partially_paid': 'processing',
    'refunded': 'refunded',
    'voided': 'failed',
    'partially_refunded': 'refunded'
  };
  return map[financialStatus] || 'pending';
}

function formatShippingAddress(address) {
  if (!address) return undefined;
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.postal_code,
    address.country
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Sync a single Shopify order to Oraculo
 */
async function syncOrder(shopifyOrder, idempotencyKey) {
  const transaction = transformShopifyOrderToTransaction(shopifyOrder);
  const payload = {
    transactions: [transaction],
    idempotencyKey: idempotencyKey || `shopify-${shopifyOrder.id}-${Date.now()}`,
    source: 'shopify'
  };

  const result = await makeRequest('POST', '/transacciones/bulk', payload);
  return {
    success: result.ok,
    externalOrderId: shopifyOrder.id.toString(),
    processed: result.processed || 0,
    succeeded: result.succeeded || 0,
    failed: result.failed || 0,
    errors: result.errors || []
  };
}

/**
 * Sync multiple Shopify orders to Oraculo
 */
async function syncOrders(shopifyOrders, idempotencyKey) {
  const transactions = shopifyOrders.map(order => transformShopifyOrderToTransaction(order));
  const payload = {
    transactions,
    idempotencyKey: idempotencyKey || `shopify-bulk-${Date.now()}`,
    source: 'shopify'
  };

  const result = await makeRequest('POST', '/transacciones/bulk', payload);
  return {
    success: result.ok,
    processed: result.processed || 0,
    succeeded: result.succeeded || 0,
    failed: result.failed || 0,
    errors: result.errors || [],
    idempotencyKey: result.idempotencyKey
  };
}

/**
 * Check API health
 */
async function checkHealth() {
  try {
    const result = await makeRequest('GET', '/transacciones/bulk/health');
    return {
      ok: result.ok,
      endpoint: result.endpoint,
      authRequired: result.authRequired,
      apiKeyConfigured: result.apiKeyConfigured
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

module.exports = {
  syncOrder,
  syncOrders,
  checkHealth,
  transformShopifyOrderToTransaction
};
