
require('dotenv').config();

const request = require('supertest');
const app = require('../server');

const defaultToken = 'Bearer TOKEN_VALIDO';
const testShop = 'test.myshopify.com';

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('Dashboard API', () => {
  it('GET /dashboard/overview con shop válido retorna datos', async () => {
    const res = await request(app)
      .get(`/dashboard/overview?shop=${testShop}`)
      .set('Authorization', defaultToken);
    expect([200, 401]).toContain(res.statusCode); // 401 si no hay sesión real
    if (res.statusCode === 200) expect(res.body.ok).toBe(true);
  });

  it('GET /dashboard/overview sin shop retorna 400', async () => {
    const res = await request(app)
      .get('/dashboard/overview')
      .set('Authorization', defaultToken);
    expect(res.statusCode).toBe(400);
  });
});

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('Campaigns API', () => {
  let campaignId;

  it('POST /campaigns crea campaña válida', async () => {
    const res = await request(app)
      .post(`/campaigns?shop=${testShop}`)
      .send({ name: 'Campaña Test', channel: 'meta' });
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    campaignId = res.body.campaign && res.body.campaign.id;
  });

  it('GET /campaigns lista campañas', async () => {
    const res = await request(app)
      .get(`/campaigns?shop=${testShop}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('POST /campaigns sin shop retorna 400', async () => {
    const res = await request(app)
      .post('/campaigns')
      .send({ name: 'Campaña Test' });
    expect(res.statusCode).toBe(400);
  });
});

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('Channels API', () => {
  it('POST /channels/connect crea canal válido', async () => {
    const res = await request(app)
      .post('/channels/connect')
      .send({ shop: testShop, channel: 'meta', accessToken: 'tok', accountId: 'acc' });
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('GET /channels lista canales', async () => {
    const res = await request(app)
      .get(`/channels?shop=${testShop}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('POST /channels/connect sin shop retorna 400', async () => {
    const res = await request(app)
      .post('/channels/connect')
      .send({ channel: 'meta', accessToken: 'tok', accountId: 'acc' });
    expect(res.statusCode).toBe(400);
  });
});

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('CartRecovery API', () => {
  it('POST /cart-recovery/webhook crea carrito válido', async () => {
    const payload = {
      id: 'test-cart-1',
      shop: testShop,
      email: 'cliente@shop.com',
      abandoned_checkout_url: 'https://shop.com/checkout',
      line_items: [],
      total_price: '1000',
      currency: 'CLP',
      updated_at: new Date().toISOString(),
    };
    const res = await request(app)
      .post('/cart-recovery/webhook')
      .send(payload);
    expect([200, 201]).toContain(res.statusCode);
  });

  it('GET /cart-recovery?shop retorna carritos', async () => {
    const res = await request(app)
      .get(`/cart-recovery?shop=${testShop}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('POST /cart-recovery/webhook sin datos requeridos retorna 400', async () => {
    const res = await request(app)
      .post('/cart-recovery/webhook')
      .send({});
    expect(res.statusCode).toBe(400);
  });
});
