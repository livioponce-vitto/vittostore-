const request = require('supertest');
const app = require('../server');

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('Sincronización Shopify', () => {
  it('Ejecuta sincronización manual', async () => {
    const res = await request(app)
      .post('/shopify/sync')
      .send();
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
