const request = require('supertest');
const app = require('../server');

// SKIP: requiere sesión Shopify real / API key válida. Ejecutar manualmente en staging.
describe.skip('Products API - Casos de éxito y error', () => {
  let token = 'Bearer TOKEN_VALIDO'; // Simula un token válido

  it('Crea un producto correctamente', async () => {
    const res = await request(app)
      .post('/products?shop=test.myshopify.com')
      .set('Authorization', token)
      .send({ title: 'Producto Test', price: 100 });
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('Falla al crear producto sin título', async () => {
    const res = await request(app)
      .post('/products?shop=test.myshopify.com')
      .set('Authorization', token)
      .send({ price: 100 });
    expect(res.statusCode).toBe(400);
  });

  it('Lista productos con sesión válida', async () => {
    const res = await request(app)
      .get('/products?shop=test.myshopify.com')
      .set('Authorization', token);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });
});
