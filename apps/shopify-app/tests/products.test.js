const request = require('supertest');
const express = require('express');
const productsRouter = require('../app/routes/products');

describe('Products API', () => {
  const app = express();
  app.use(express.json());
  app.use('/products', productsRouter);

  it('GET /products sin sesión retorna 401', async () => {
    const res = await request(app).get('/products?shop=tienda-invalida');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
