const request = require('supertest');
const express = require('express');

jest.mock('../app/services/sessionStorage', () => ({
  loadSession: jest.fn()
}));

jest.mock('../app/routes/auth', () => ({
  decryptToken: jest.fn((token) => {
    if (token.includes(':')) {
      return 'decrypted_token_' + token.split(':')[2];
    }
    return token;
  })
}));

let mockRestClient;

jest.mock('../app/services/shopify', () => ({
  clients: {
    Rest: jest.fn(function(opts) {
      this.session = opts.session;
      this.get = jest.fn();
      this.put = jest.fn();
      this.post = jest.fn();
      mockRestClient = this;
      return this;
    })
  }
}));

jest.mock('../app/middleware/validateBody', () => ({
  validate: () => (req, res, next) => next()
}));

const ordersRouter = require('../app/routes/orders');
const { loadSession } = require('../app/services/sessionStorage');
const { decryptToken } = require('../app/routes/auth');
const shopify = require('../app/services/shopify');

describe('Orders API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';
  const testAccessToken = 'shpat_test123456789';
  const testOrderId = '12345678901';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/orders', ordersRouter);
    jest.resetAllMocks();

    loadSession.mockImplementation((id) => {
      if (id === `offline_${testShop}`) {
        return {
          shop: testShop,
          accessToken: testAccessToken,
          isEncrypted: false
        };
      }
      return null;
    });

    decryptToken.mockImplementation((token) => token);

    shopify.clients.Rest.mockImplementation(function(opts) {
      this.session = opts.session;
      this.get = jest.fn(async () => ({
        body: {
          orders: [
            {
              id: testOrderId,
              email: 'customer@example.com',
              financial_status: 'paid',
              fulfillment_status: 'fulfilled'
            }
          ],
          order: {
            id: testOrderId,
            email: 'customer@example.com',
            financial_status: 'paid',
            fulfillment_status: 'fulfilled'
          }
        },
        pageInfo: null
      }));
      this.put = jest.fn(async () => ({
        body: {
          order: {
            id: testOrderId,
            note: 'Updated note',
            tags: 'important'
          }
        }
      }));
      this.post = jest.fn(async () => ({
        body: {
          order: {
            id: testOrderId,
            status: 'closed'
          }
        }
      }));
      mockRestClient = this;
      return this;
    });
  });

  describe('GET /orders', () => {
    it('debería listar órdenes con shop válido', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThan(0);
      expect(loadSession).toHaveBeenCalledWith(`offline_${testShop}`);
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/orders');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app).get('/orders?shop=invalid-shop.myshopify.com');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('sesion');
    });

    it('debería aceptar parámetro limit', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}&limit=50`);

      expect(res.status).toBe(200);
      expect(mockRestClient.get).toHaveBeenCalled();
    });

    it('debería aceptar parámetro status', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}&status=closed`);

      expect(res.status).toBe(200);
    });

    it('debería aceptar parámetro page_info para paginación', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}&page_info=cursor_token_123`);

      expect(res.status).toBe(200);
    });

    it('debería retornar 500 si falla cliente REST', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => {
          throw new Error('API Error');
        });
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    it('debería retornar pagination si está disponible', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => ({
          body: {
            orders: [{ id: '123' }]
          },
          pageInfo: { hasNextPage: true, endCursor: 'cursor_123' }
        }));
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.hasNextPage).toBe(true);
    });
  });

  describe('GET /orders/:id', () => {
    it('debería obtener orden por ID con shop válido', async () => {
      const res = await request(app).get(`/orders/${testOrderId}?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.id).toBe(testOrderId);
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get(`/orders/${testOrderId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app).get(`/orders/${testOrderId}?shop=invalid.myshopify.com`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('sesion');
    });

    it('debería retornar 500 si falla cliente REST', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => {
          throw new Error('Order not found');
        });
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/orders/${testOrderId}?shop=${testShop}`);

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /orders/:id', () => {
    it('debería actualizar orden con datos válidos', async () => {
      const res = await request(app)
        .put(`/orders/${testOrderId}?shop=${testShop}`)
        .send({ note: 'Updated note', tags: 'important' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.id).toBe(testOrderId);
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app)
        .put(`/orders/${testOrderId}`)
        .send({ note: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app)
        .put(`/orders/${testOrderId}?shop=invalid.myshopify.com`)
        .send({ note: 'test' });

      expect(res.status).toBe(401);
    });

    it('debería enviar body correcto al cliente REST', async () => {
      const res = await request(app)
        .put(`/orders/${testOrderId}?shop=${testShop}`)
        .send({ note: 'Custom note', tags: 'vip' });

      expect(res.status).toBe(200);
      expect(mockRestClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `orders/${testOrderId}`,
          data: expect.objectContaining({ order: expect.any(Object) })
        })
      );
    });

    it('debería retornar 500 si el REST client falla en PUT', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.put = jest.fn(async () => { throw new Error('Update failed'); });
        mockRestClient = this;
        return this;
      });

      const res = await request(app)
        .put(`/orders/${testOrderId}?shop=${testShop}`)
        .send({ note: 'test' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /orders/:id/close', () => {
    it('debería cerrar orden con shop válido', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/close?shop=${testShop}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.order).toBeDefined();
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/close`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/close?shop=invalid.myshopify.com`)
        .send({});

      expect(res.status).toBe(401);
    });

    it('debería retornar 500 si el REST client falla en close', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.post = jest.fn(async () => { throw new Error('Close failed'); });
        mockRestClient = this;
        return this;
      });

      const res = await request(app)
        .post(`/orders/${testOrderId}/close?shop=${testShop}`);

      expect(res.status).toBe(500);
    });

    it('debería llamar endpoint close correcto', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/close?shop=${testShop}`)
        .send({});

      expect(res.status).toBe(200);
      expect(mockRestClient.post).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `orders/${testOrderId}/close`
        })
      );
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('debería cancelar orden con shop válido', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=${testShop}`)
        .send({ reason: 'customer' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.order).toBeDefined();
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel`)
        .send({ reason: 'customer' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=invalid.myshopify.com`)
        .send({ reason: 'customer' });

      expect(res.status).toBe(401);
    });

    it('debería aceptar parámetro reason', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=${testShop}`)
        .send({ reason: 'fraud', email: true });

      expect(res.status).toBe(200);
    });

    it('debería retornar 500 si el REST client falla en cancel', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.post = jest.fn(async () => { throw new Error('Cancel failed'); });
        mockRestClient = this;
        return this;
      });

      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=${testShop}`);

      expect(res.status).toBe(500);
    });

    it('debería llamar endpoint cancel correcto', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=${testShop}`)
        .send({ reason: 'inventory' });

      expect(res.status).toBe(200);
      expect(mockRestClient.post).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `orders/${testOrderId}/cancel`
        })
      );
    });

    it('debería aceptar email flag', async () => {
      const res = await request(app)
        .post(`/orders/${testOrderId}/cancel?shop=${testShop}`)
        .send({ reason: 'customer', email: false });

      expect(res.status).toBe(200);
    });
  });

  describe('Session Encryption Handling', () => {
    it('debería desencriptar token si session.isEncrypted es true', async () => {
      loadSession.mockReturnValueOnce({
        shop: testShop,
        accessToken: 'iv:authTag:encryptedToken123',
        isEncrypted: true
      });
      decryptToken.mockReturnValueOnce(testAccessToken);

      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(decryptToken).toHaveBeenCalledWith('iv:authTag:encryptedToken123');
    });

    it('debería usar token directo si session.isEncrypted es false', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(loadSession).toHaveBeenCalled();
    });
  });

  describe('Shopify REST Client', () => {
    it('debería crear cliente con session correcta', async () => {
      const res = await request(app).get(`/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(shopify.clients.Rest).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            shop: testShop,
            accessToken: expect.any(String)
          })
        })
      );
    });
  });

  describe('Error Response Format', () => {
    it('debería incluir next message en respuesta 401', async () => {
      const res = await request(app).get(`/orders?shop=nonexistent.myshopify.com`);

      expect(res.status).toBe(401);
      expect(res.body.next).toContain('/auth');
    });

    it('debería incluir ok: false en error responses', async () => {
      const res = await request(app).get('/orders');

      expect(res.body.ok).toBe(false);
    });
  });
});
