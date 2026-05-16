const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VittoStore API',
      version: '1.0.0',
      description: 'VittoStore Shopify + WhatsApp automation API',
      contact: { name: 'VittoStore', url: 'https://vittostore.cl' }
    },
    servers: [
      { url: process.env.SHOPIFY_APP_URL || 'http://localhost:3000', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local' }
    ],
    components: {
      securitySchemes: {
        SyncToken: { type: 'apiKey', in: 'header', name: 'X-Sync-Token' },
        WebhookHmac: { type: 'apiKey', in: 'header', name: 'X-Shopify-Hmac-Sha256' }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
            app: { type: 'string', example: 'VittoStore Shopify App' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 123456789 },
            title: { type: 'string', example: 'Camiseta VittoStore' },
            status: { type: 'string', enum: ['active', 'draft', 'archived'] },
            variants: { type: 'array', items: { type: 'object' } },
            images: { type: 'array', items: { type: 'object' } }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 987654321 },
            email: { type: 'string', format: 'email' },
            financial_status: { type: 'string', example: 'paid' },
            fulfillment_status: { type: 'string', example: 'fulfilled' },
            current_total_price: { type: 'string', example: '29990.00' }
          }
        },
        Campaign: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmp_a1b2c3d4' },
            name: { type: 'string', example: 'Black Friday 2025' },
            shop: { type: 'string', example: 'mi-tienda.myshopify.com' },
            channel: { type: 'string', enum: ['meta', 'google', 'tiktok'] },
            status: { type: 'string', enum: ['active', 'paused', 'ended'] },
            budgetDaily: { type: 'number', example: 12000 },
            metrics: {
              type: 'object',
              properties: {
                impressions: { type: 'integer' },
                clicks: { type: 'integer' },
                spend: { type: 'number' },
                purchases: { type: 'integer' },
                revenue: { type: 'number' }
              }
            }
          }
        },
        AbandonedCart: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            shop: { type: 'string' },
            state: { type: 'string', enum: ['pending', 'notified', 'recovered', 'expired'] },
            abandoned_checkout_url: { type: 'string', format: 'uri' },
            abandonedAt: { type: 'string', format: 'date-time' },
            notificationsSent: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'System health and status' },
      { name: 'Products', description: 'Shopify product management' },
      { name: 'Orders', description: 'Shopify order management' },
      { name: 'Cart Recovery', description: 'Abandoned cart recovery via WhatsApp' },
      { name: 'Campaigns', description: 'Marketing campaign management and optimization' },
      { name: 'Channels', description: 'Ad channel credentials and sync (Meta, Google, TikTok)' },
      { name: 'Dashboard', description: 'KPI analytics and quick actions' },
      { name: 'Auth', description: 'Shopify OAuth 2.0 flow' },
      { name: 'Shopify', description: 'Shopify webhooks and metaobjects' }
    ]
  },
  apis: ['./server.js', './app/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
