const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

jest.mock('../app/services/shopify', () => ({
  auth: {
    begin: jest.fn(),
    callback: jest.fn()
  }
}));

jest.mock('../app/services/sessionStorage', () => ({
  saveSession: jest.fn()
}));

const shopify = require('../app/services/shopify');
const { saveSession } = require('../app/services/sessionStorage');
const { router, decryptToken } = require('../app/routes/auth');

describe('Auth - Encryption/Decryption', () => {
  it('debería encriptar y desencriptar correctamente', () => {
    const ENCRYPTION_KEY = crypto.randomBytes(32);
    const token = 'test-token';
    // Simula encryptToken
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    // Simula decryptToken
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final()
    ]).toString('utf8');
    expect(decrypted).toBe(token);
  });
});

describe('Auth Routes - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';
  const testAccessToken = 'shpat_test123456789';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/auth', router);
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('GET /auth', () => {
    it('debería iniciar OAuth con shop válido', async () => {
      shopify.auth.begin.mockImplementation(async (config) => {
        config.rawResponse.status(302).redirect('https://admin.shopify.com/oauth');
      });

      const res = await request(app).get(`/auth?shop=${testShop}`);

      expect(shopify.auth.begin).toHaveBeenCalledWith(
        expect.objectContaining({
          shop: testShop,
          callbackPath: '/auth/callback',
          isOnline: false
        })
      );
      expect(res.status).toBe(302);
    });

    it('debería manejar error en shopify.auth.begin', async () => {
      shopify.auth.begin.mockRejectedValue(new Error('OAuth error'));

      const res = await request(app).get(`/auth?shop=${testShop}`);

      expect(res.status).toBe(500);
      expect(res.text).toContain('Error');
    });

    it('debería manejar shop indefinido', async () => {
      shopify.auth.begin.mockRejectedValue(new Error('shop required'));

      const res = await request(app).get('/auth');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /auth/callback', () => {
    it('debería completar callback y guardar sesión', async () => {
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: testShop,
          accessToken: testAccessToken,
          scope: 'write_products,read_orders'
        }
      });

      const res = await request(app)
        .get('/auth/callback')
        .query({
          code: 'auth_code_123',
          shop: testShop,
          hmac: 'hmac_signature'
        });

      expect(shopify.auth.callback).toHaveBeenCalled();
      expect(saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `offline_${testShop}`,
          shop: testShop,
          isEncrypted: true
        })
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toContain(`/app?shop=${testShop}`);
    });

    it('debería guardar token encriptado', async () => {
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: testShop,
          accessToken: testAccessToken,
          scope: 'write_products'
        }
      });

      const res = await request(app).get('/auth/callback');

      expect(saveSession).toHaveBeenCalled();
      const call = saveSession.mock.calls[0][0];
      expect(call.isEncrypted).toBe(true);
      expect(call.accessToken).not.toBe(testAccessToken);
      expect(typeof call.accessToken).toBe('string');
      expect(call.accessToken).toContain(':');
    });

    it('debería guardar expiresAt con valor de 60 días', async () => {
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: testShop,
          accessToken: testAccessToken,
          scope: 'write_products'
        }
      });

      const beforeCall = Date.now();
      const res = await request(app).get('/auth/callback');
      const afterCall = Date.now();

      expect(saveSession).toHaveBeenCalled();
      const call = saveSession.mock.calls[0][0];
      const expiresDate = new Date(call.expiresAt).getTime();
      const expectedMin = beforeCall + 60 * 24 * 60 * 60 * 1000;
      const expectedMax = afterCall + 60 * 24 * 60 * 60 * 1000;

      expect(expiresDate).toBeGreaterThanOrEqual(expectedMin - 1000);
      expect(expiresDate).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it('debería guardar installedAt timestamp', async () => {
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: testShop,
          accessToken: testAccessToken,
          scope: 'write_products'
        }
      });

      const beforeCall = Date.now();
      const res = await request(app).get('/auth/callback');
      const afterCall = Date.now();

      expect(saveSession).toHaveBeenCalled();
      const call = saveSession.mock.calls[0][0];
      const installedDate = new Date(call.installedAt).getTime();

      expect(installedDate).toBeGreaterThanOrEqual(beforeCall - 1000);
      expect(installedDate).toBeLessThanOrEqual(afterCall + 1000);
    });

    it('debería manejar error en callback', async () => {
      shopify.auth.callback.mockRejectedValue(new Error('Invalid code'));

      const res = await request(app).get('/auth/callback');

      expect(res.status).toBe(500);
      expect(res.text).toContain('Error');
      expect(saveSession).not.toHaveBeenCalled();
    });

    it('debería redirigir a /app con parámetro shop', async () => {
      const customShop = 'custom-store.myshopify.com';
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: customShop,
          accessToken: testAccessToken,
          scope: 'write_products'
        }
      });

      const res = await request(app).get('/auth/callback');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe(`/app?shop=${customShop}`);
    });

    it('debería guardar scope correctamente', async () => {
      const customScope = 'write_products,read_orders,write_customers';
      shopify.auth.callback.mockResolvedValue({
        session: {
          shop: testShop,
          accessToken: testAccessToken,
          scope: customScope
        }
      });

      const res = await request(app).get('/auth/callback');

      expect(saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: customScope
        })
      );
    });
  });
});
