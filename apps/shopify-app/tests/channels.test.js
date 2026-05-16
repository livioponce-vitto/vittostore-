const request = require('supertest');
const express = require('express');
const channelsRouter = require('../app/routes/channels');

describe('Channels API', () => {
  const app = express();
  app.use(express.json());
  app.use('/channels', channelsRouter);

  it('GET /channels sin sesión retorna 401', async () => {
    const res = await request(app).get('/channels?shop=tienda-invalida');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
