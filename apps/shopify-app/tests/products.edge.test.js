const request = require('supertest');
const express = require('express');
const productsRouter = require('../app/routes/products');

describe('Products API edge cases', () => {
  const app = express();
  app.use(express.json());
  app.use('/products', productsRouter);

  it('GET /products sin parámetro shop retorna 400', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /products con shop inválido retorna 401', async () => {
    const res = await request(app)
      .post('/products?shop=tienda-invalida')
      .send({ title: 'Test', price: 1000 });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
