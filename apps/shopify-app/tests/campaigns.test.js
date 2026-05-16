const request = require('supertest');
const express = require('express');
const campaignsRouter = require('../app/routes/campaigns');

describe('Campaigns API', () => {
  const app = express();
  app.use(express.json());
  app.use('/campaigns', campaignsRouter);

  it('GET /campaigns sin sesión retorna 401', async () => {
    const res = await request(app).get('/campaigns?shop=tienda-invalida');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
