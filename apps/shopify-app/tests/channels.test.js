const request = require('supertest');
const express = require('express');

jest.mock('../app/middleware/authSession', () => (req, res, next) => {
  req.shop = req.query.shop || req.body?.shop || 'test.myshopify.com';
  next();
});

jest.mock('../app/services/channelStore', () => ({
  saveChannel: jest.fn((shop, channel, creds) => ({
    channel,
    accountId: creds.accountId,
    accessToken: '***redacted***'
  })),
  listChannels: jest.fn((shop) => [
    { channel: 'meta', accountId: 'meta_123' },
    { channel: 'google', accountId: 'google_456' }
  ]),
  getChannelCreds: jest.fn((shop, channel) => {
    if (!channel) return null;
    return {
      accessToken: 'token_' + channel,
      accountId: channel + '_account'
    };
  }),
  removeChannel: jest.fn()
}));

jest.mock('../app/services/campaignStore', () => ({
  getCampaign: jest.fn((campaignId) => ({
    id: campaignId,
    name: 'Test Campaign',
    channel: 'meta',
    metrics: {}
  })),
  updateCampaign: jest.fn()
}));

jest.mock('../app/services/metaApi', () => ({
  createCampaign: jest.fn(async () => ({
    externalId: 'meta_ext_123',
    platform: 'meta'
  })),
  getCampaignMetrics: jest.fn(async () => ({
    spend: 150,
    clicks: 320,
    conversions: 12
  }))
}));

jest.mock('../app/services/googleApi', () => ({
  createCampaign: jest.fn(async () => ({
    externalId: 'google_ext_456',
    platform: 'google'
  })),
  getCampaignMetrics: jest.fn(async () => ({
    spend: 200,
    impressions: 5000,
    clicks: 250
  }))
}));

jest.mock('../app/services/tiktokApi', () => ({
  createCampaign: jest.fn(async () => ({
    externalId: 'tiktok_ext_789',
    platform: 'tiktok'
  })),
  getCampaignMetrics: jest.fn(async () => ({
    spend: 100,
    views: 8000,
    clicks: 180
  }))
}));

const channelsRouter = require('../app/routes/channels');
const channelStore = require('../app/services/channelStore');
const campaignStore = require('../app/services/campaignStore');
const metaApi = require('../app/services/metaApi');
const googleApi = require('../app/services/googleApi');
const tiktokApi = require('../app/services/tiktokApi');

describe('Channels API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/channels', channelsRouter);
    jest.resetAllMocks();
    // Restore channelStore mocks
    channelStore.saveChannel.mockImplementation((shop, channel, creds) => ({
      channel,
      accountId: creds.accountId,
      accessToken: '***redacted***'
    }));
    channelStore.listChannels.mockImplementation((shop) => [
      { channel: 'meta', accountId: 'meta_123' },
      { channel: 'google', accountId: 'google_456' }
    ]);
    channelStore.removeChannel.mockImplementation(() => undefined);
    channelStore.getChannelCreds.mockImplementation((shop, channel) => {
      if (!channel) return null;
      return {
        accessToken: 'token_' + channel,
        accountId: channel + '_account'
      };
    });
    // Restore campaignStore mocks
    campaignStore.getCampaign.mockImplementation((campaignId) => ({
      id: campaignId,
      name: 'Test Campaign',
      channel: 'meta',
      metrics: {}
    }));
    campaignStore.updateCampaign.mockImplementation(() => undefined);
    // Restore API mocks
    metaApi.createCampaign.mockImplementation(async () => ({
      externalId: 'meta_ext_123',
      platform: 'meta'
    }));
    metaApi.getCampaignMetrics.mockImplementation(async () => ({
      spend: 150,
      clicks: 320,
      conversions: 12
    }));
    googleApi.createCampaign.mockImplementation(async () => ({
      externalId: 'google_ext_456',
      platform: 'google'
    }));
    googleApi.getCampaignMetrics.mockImplementation(async () => ({
      spend: 200,
      impressions: 5000,
      clicks: 250
    }));
    tiktokApi.createCampaign.mockImplementation(async () => ({
      externalId: 'tiktok_ext_789',
      platform: 'tiktok'
    }));
    tiktokApi.getCampaignMetrics.mockImplementation(async () => ({
      spend: 100,
      views: 8000,
      clicks: 180
    }));
  });

  describe('POST /channels/connect', () => {
    it('debería conectar canal con credenciales válidas', async () => {
      const res = await request(app)
        .post('/channels/connect')
        .send({
          shop: testShop,
          channel: 'meta',
          accessToken: 'token_123',
          accountId: 'acc_meta_001'
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.channel).toBeDefined();
      expect(res.body.channel.channel).toBe('meta');
      expect(channelStore.saveChannel).toHaveBeenCalledWith(
        testShop,
        'meta',
        expect.objectContaining({ accessToken: 'token_123', accountId: 'acc_meta_001' })
      );
    });

    it('debería retornar 400 sin shop', async () => {
      const res = await request(app)
        .post('/channels/connect')
        .send({ channel: 'meta', accessToken: 'token', accountId: 'acc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 400 con canal no soportado', async () => {
      const res = await request(app)
        .post('/channels/connect')
        .send({
          shop: testShop,
          channel: 'unsupported',
          accessToken: 'token',
          accountId: 'acc'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('canal no soportado');
    });

    it('debería retornar 400 sin accessToken', async () => {
      const res = await request(app)
        .post('/channels/connect')
        .send({ shop: testShop, channel: 'google', accountId: 'acc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('accessToken');
    });

    it('debería retornar 400 sin accountId', async () => {
      const res = await request(app)
        .post('/channels/connect')
        .send({ shop: testShop, channel: 'tiktok', accessToken: 'token' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('accountId');
    });
  });

  describe('GET /channels', () => {
    it('debería listar canales conectados', async () => {
      const res = await request(app).get(`/channels?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0].channel).toBeDefined();
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/channels');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar lista vacía si no hay canales', async () => {
      channelStore.listChannels.mockReturnValue([]);

      const res = await request(app).get(`/channels?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(0);
    });
  });

  describe('DELETE /channels/:channel', () => {
    it('debería desconectar canal válido', async () => {
      const res = await request(app).delete(`/channels/meta?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(channelStore.removeChannel).toHaveBeenCalledWith(testShop, 'meta');
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).delete('/channels/google');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 400 con canal no soportado', async () => {
      const res = await request(app).delete(`/channels/unsupported?shop=${testShop}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('canal no soportado');
    });
  });

  describe('POST /channels/sync-campaign', () => {
    it('debería sincronizar campaña en canal meta', async () => {
      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ shop: testShop, campaignId: 'cmp_123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.externalId).toBe('meta_ext_123');
      expect(res.body.platform).toBe('meta');
      expect(metaApi.createCampaign).toHaveBeenCalled();
      expect(campaignStore.updateCampaign).toHaveBeenCalledWith(
        'cmp_123',
        expect.objectContaining({ externalId: 'meta_ext_123' })
      );
    });

    it('debería retornar 400 sin shop', async () => {
      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ campaignId: 'cmp_123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 400 sin campaignId', async () => {
      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ shop: testShop });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('campaignId');
    });

    it('debería retornar 404 si campaña no existe', async () => {
      campaignStore.getCampaign.mockReturnValue(null);

      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ shop: testShop, campaignId: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Campana no encontrada');
    });

    it('debería retornar 400 si canal no está conectado', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123'
      }));
      channelStore.getChannelCreds.mockImplementationOnce(() => null);

      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ shop: testShop, campaignId: 'cmp_123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no conectado');
    });

    it('debería retornar 502 si falla API del canal', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123'
      }));
      metaApi.createCampaign.mockRejectedValueOnce(new Error('API Error'));

      const res = await request(app)
        .post('/channels/sync-campaign')
        .send({ shop: testShop, campaignId: 'cmp_123' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Error al sincronizar');
    });
  });

  describe('GET /channels/metrics', () => {
    it('debería obtener métricas de campaña sincronizada en meta', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123',
        metrics: {}
      }));

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_123`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.campaignId).toBe('cmp_123');
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.spend).toBe(150);
      expect(metaApi.getCampaignMetrics).toHaveBeenCalled();
      expect(campaignStore.updateCampaign).toHaveBeenCalledWith(
        'cmp_123',
        expect.objectContaining({ metricsUpdatedAt: expect.any(String) })
      );
    });

    it('debería retornar 400 sin shop', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123'
      }));

      const res = await request(app).get('/channels/metrics?campaignId=cmp_123');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 400 sin campaignId', async () => {
      const res = await request(app).get(`/channels/metrics?shop=${testShop}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('campaignId');
    });

    it('debería retornar 404 si campaña no existe', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => null);

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=nonexistent`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Campana no encontrada');
    });

    it('debería retornar 400 si campaña no está sincronizada', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta'
      }));

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_123`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('aun no sincronizada');
    });

    it('debería retornar 400 si canal no está conectado', async () => {
      campaignStore.getCampaign.mockReturnValueOnce({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123'
      });
      channelStore.getChannelCreds.mockImplementationOnce(() => null);

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_123`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no conectado');
    });

    it('debería retornar 502 si falla API del canal', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_123',
        channel: 'meta',
        externalId: 'meta_ext_123'
      }));
      metaApi.getCampaignMetrics.mockRejectedValueOnce(new Error('API Error'));

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_123`);

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Error al obtener metricas');
    });

    it('debería obtener métricas de google correctamente', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_456',
        channel: 'google',
        externalId: 'google_ext_456',
        metrics: {}
      }));

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_456`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.impressions).toBe(5000);
      expect(googleApi.getCampaignMetrics).toHaveBeenCalled();
    });

    it('debería obtener métricas de tiktok correctamente', async () => {
      campaignStore.getCampaign.mockImplementationOnce(() => ({
        id: 'cmp_789',
        channel: 'tiktok',
        externalId: 'tiktok_ext_789',
        metrics: {}
      }));

      const res = await request(app).get(`/channels/metrics?shop=${testShop}&campaignId=cmp_789`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.views).toBe(8000);
      expect(tiktokApi.getCampaignMetrics).toHaveBeenCalled();
    });
  });
});
