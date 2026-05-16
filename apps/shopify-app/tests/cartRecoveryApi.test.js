const request = require('supertest');
const express = require('express');
const cartRecoveryRouter = require('../app/routes/cartRecovery');

describe('CartRecovery API', () => {
  const app = express();
  app.use(express.json());
  app.use('/cart-recovery', cartRecoveryRouter);

  it('POST /cart-recovery/webhook rechaza payload inválido', async () => {
    const res = await request(app).post('/cart-recovery/webhook').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
