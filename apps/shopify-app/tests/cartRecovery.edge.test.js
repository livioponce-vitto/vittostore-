const request = require('supertest');
const express = require('express');
const cartRecoveryRouter = require('../app/routes/cartRecovery');

describe('CartRecovery API edge cases', () => {
  const app = express();
  app.use(express.json());
  app.use('/cart-recovery', cartRecoveryRouter);

  it('POST /cart-recovery/webhook sin payload retorna 400', async () => {
    const res = await request(app).post('/cart-recovery/webhook');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /cart-recovery/webhook sin abandoned_checkout_url retorna skipped', async () => {
    const res = await request(app)
      .post('/cart-recovery/webhook')
      .send({ id: 'edge-1', email: 'edge@shop.com' });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
  });
});
