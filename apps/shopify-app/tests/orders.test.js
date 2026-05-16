const request = require('supertest');
const express = require('express');
const ordersRouter = require('../app/routes/orders');

describe('Orders API', () => {
  const app = express();
  app.use(express.json());
  app.use('/orders', ordersRouter);

  it('GET /orders sin sesión retorna 401', async () => {
    const res = await request(app).get('/orders?shop=tienda-invalida');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
