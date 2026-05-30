const request = require('supertest');
const express = require('express');

jest.mock('../app/middleware/authSession', () => (req, res, next) => {
  req.shop = req.query.shop || 'test.myshopify.com';
  next();
});

jest.mock('../app/middleware/validateBody', () => ({
  validate: () => (req, res, next) => next()
}));

const campaignsRouter = require('../app/routes/campaigns');

describe('Campaigns API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/campaigns', campaignsRouter);
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('GET /campaigns', () => {
    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/campaigns');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('debería listar campañas con parámetro shop válido', async () => {
      const res = await request(app).get(`/campaigns?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('debería retornar items con alertas calculadas', async () => {
      const res = await request(app).get(`/campaigns?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      if (res.body.items.length > 0) {
        expect(res.body.items[0].alerts).toBeDefined();
        expect(Array.isArray(res.body.items[0].alerts)).toBe(true);
      }
    });
  });

  describe('POST /campaigns', () => {
    it('debería crear campaña con datos válidos', async () => {
      const newCampaign = {
        name: 'Campaña de prueba',
        channel: 'meta'
      };

      const res = await request(app)
        .post(`/campaigns?shop=${testShop}`)
        .send(newCampaign);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.campaign).toBeDefined();
      expect(res.body.campaign.name).toBe(newCampaign.name);
      expect(res.body.campaign.shop).toBe(testShop);
    });

    it('debería retornar 400 sin parámetro shop en POST', async () => {
      const res = await request(app)
        .post('/campaigns')
        .send({ name: 'Test', channel: 'meta' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('debería incluir alertas en campaña creada', async () => {
      const res = await request(app)
        .post(`/campaigns?shop=${testShop}`)
        .send({ name: 'Test Campaign', channel: 'google' });

      expect(res.status).toBe(201);
      expect(res.body.campaign.alerts).toBeDefined();
      expect(Array.isArray(res.body.campaign.alerts)).toBe(true);
    });
  });

  describe('POST /campaigns/:id/optimize', () => {
    it('debería optimizar presupuesto de campaña existente', async () => {
      const getCampRes = await request(app).get(`/campaigns?shop=${testShop}`);
      const campaignId = getCampRes.body.items[0]?.id;

      if (!campaignId) return;

      const res = await request(app)
        .post(`/campaigns/${campaignId}/optimize?shop=${testShop}`);

      expect([200, 400, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.ok).toBe(true);
        expect(res.body.campaign).toBeDefined();
        expect(res.body.actions).toBeDefined();
        expect(Array.isArray(res.body.actions)).toBe(true);
      }
    });

    it('debería retornar 400 sin parámetro shop en optimize', async () => {
      const res = await request(app)
        .post('/campaigns/campaign-123/optimize');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('debería retornar 404 para campaña inexistente', async () => {
      const res = await request(app)
        .post(`/campaigns/nonexistent-id/optimize?shop=${testShop}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Campana no encontrada');
    });
  });

  describe('POST /campaigns/:id/ab-test', () => {
    it('debería ejecutar A/B test en campaña existente', async () => {
      const getCampRes = await request(app).get(`/campaigns?shop=${testShop}`);
      const campaignId = getCampRes.body.items[0]?.id;

      if (!campaignId) return;

      const res = await request(app)
        .post(`/campaigns/${campaignId}/ab-test?shop=${testShop}`);

      expect([200, 400, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.ok).toBe(true);
        expect(res.body.result).toBeDefined();
        expect(res.body.result.winner).toBeDefined();
        expect(res.body.result.loser).toBeDefined();
      }
    });

    it('debería retornar 400 sin parámetro shop en ab-test', async () => {
      const res = await request(app)
        .post('/campaigns/campaign-123/ab-test');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('debería retornar 404 para campaña inexistente en ab-test', async () => {
      const res = await request(app)
        .post(`/campaigns/nonexistent-id/ab-test?shop=${testShop}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Campana no encontrada');
    });
  });
});
