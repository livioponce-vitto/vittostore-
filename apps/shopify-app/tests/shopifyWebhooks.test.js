const request = require('supertest');
const app = require('../server');
const crypto = require('crypto');

function createHmac(payload) {
  return crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('base64');
}

describe('Webhooks Shopify', () => {
  it('products/update procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 456, title: 'Nuevo título' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/products/update')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });

  it('orders/cancelled procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 789, cancelled_at: '2026-04-22T10:00:00Z' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/orders/cancelled')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });

  it('customers/create procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 321, email: 'cliente@ejemplo.com' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/customers/create')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });
});
