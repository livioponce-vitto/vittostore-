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
      this.post = jest.fn();
      mockRestClient = this;
      return this;
    })
  }
}));

const dashboardRouter = require('../app/routes/dashboard');
const { loadSession } = require('../app/services/sessionStorage');
const { decryptToken } = require('../app/routes/auth');
const shopify = require('../app/services/shopify');

describe('Dashboard API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';
  const testAccessToken = 'shpat_test123456789';
  const testOrderId = '12345678901';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/dashboard', dashboardRouter);
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
          products: [
            {
              id: '1',
              title: 'Product 1',
              variants: [{ inventory_quantity: 10 }]
            }
          ],
          orders: [
            {
              id: testOrderId,
              financial_status: 'paid',
              fulfillment_status: 'fulfilled',
              current_total_price: '100.00'
            }
          ]
        }
      }));
      this.post = jest.fn(async () => ({
        body: {
          product: {
            id: 'prod_123',
            title: 'New Product',
            status: 'draft'
          },
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

  describe('GET /dashboard/overview', () => {
    it('debería retornar KPIs y alertas con shop válido', async () => {
      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBeDefined();
      expect(res.body.kpis).toBeDefined();
      expect(res.body.kpis.ordersToday).toBe(1);
      expect(res.body.kpis.productsActive).toBe(1);
      expect(res.body.alerts).toBeDefined();
      expect(Array.isArray(res.body.alerts)).toBe(true);
      expect(loadSession).toHaveBeenCalledWith(`offline_${testShop}`);
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/dashboard/overview');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app).get('/dashboard/overview?shop=invalid-shop.myshopify.com');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('sesion');
    });

    it('debería detectar productos con stock bajo', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => ({
          body: {
            products: [
              {
                id: '1',
                title: 'Low Stock Product',
                variants: [{ inventory_quantity: 3 }]
              }
            ],
            orders: []
          }
        }));
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.kpis.lowStock).toBe(1);
      expect(res.body.alerts.some(a => a.type === 'danger')).toBe(true);
    });

    it('debería detectar órdenes pendientes', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => ({
          body: {
            products: [],
            orders: [
              {
                id: '1',
                financial_status: 'pending',
                fulfillment_status: 'unfulfilled',
                current_total_price: '50.00'
              }
            ]
          }
        }));
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts.some(a => a.type === 'warning')).toBe(true);
    });

    it('debería retornar alerta success cuando todo está en orden', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => ({
          body: {
            products: [
              {
                id: '1',
                title: 'Product',
                variants: [{ inventory_quantity: 100 }]
              }
            ],
            orders: [
              {
                id: '1',
                financial_status: 'paid',
                fulfillment_status: 'fulfilled',
                current_total_price: '100.00'
              }
            ]
          }
        }));
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts.some(a => a.type === 'success')).toBe(true);
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

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    it('debería calcular revenue correctamente', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.get = jest.fn(async () => ({
          body: {
            products: [],
            orders: [
              { id: '1', financial_status: 'paid', fulfillment_status: 'fulfilled', current_total_price: '100.00' },
              { id: '2', financial_status: 'paid', fulfillment_status: 'fulfilled', current_total_price: '200.50' }
            ]
          }
        }));
        mockRestClient = this;
        return this;
      });

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.kpis.revenueToday).toBe(300.5);
    });
  });

  describe('GET /dashboard/products', () => {
    it('debería listar productos con shop válido', async () => {
      const res = await request(app).get(`/dashboard/products?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(mockRestClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'products',
          query: expect.objectContaining({ limit: 20 })
        })
      );
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/dashboard/products');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app).get('/dashboard/products?shop=invalid-shop.myshopify.com');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('sesion');
    });

    it('debería aceptar parámetro limit', async () => {
      const res = await request(app).get(`/dashboard/products?shop=${testShop}&limit=50`);

      expect(res.status).toBe(200);
      expect(mockRestClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ limit: 50 })
        })
      );
    });

    it('debería limitar limit a máximo 100', async () => {
      const res = await request(app).get(`/dashboard/products?shop=${testShop}&limit=500`);

      expect(res.status).toBe(200);
      expect(mockRestClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ limit: 100 })
        })
      );
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

      const res = await request(app).get(`/dashboard/products?shop=${testShop}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('GET /dashboard/orders', () => {
    it('debería listar órdenes con shop válido', async () => {
      const res = await request(app).get(`/dashboard/orders?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(mockRestClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'orders',
          query: expect.objectContaining({ limit: 20, status: 'any' })
        })
      );
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/dashboard/orders');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app).get('/dashboard/orders?shop=invalid-shop.myshopify.com');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('sesion');
    });

    it('debería aceptar parámetro limit', async () => {
      const res = await request(app).get(`/dashboard/orders?shop=${testShop}&limit=50`);

      expect(res.status).toBe(200);
      expect(mockRestClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ limit: 50 })
        })
      );
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

      const res = await request(app).get(`/dashboard/orders?shop=${testShop}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /dashboard/quick-actions/create-product', () => {
    it('debería crear producto draft con datos válidos', async () => {
      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .query({ shop: testShop })
        .send({ title: 'New Product', price: 29.99, inventory: 50 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.product).toBeDefined();
      expect(mockRestClient.post).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'products',
          data: expect.objectContaining({
            product: expect.objectContaining({
              title: 'New Product',
              status: 'draft'
            })
          })
        })
      );
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .send({ title: 'Product' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 400 sin title', async () => {
      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .query({ shop: testShop })
        .send({ price: 29.99 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('title');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .query({ shop: 'invalid-shop.myshopify.com' })
        .send({ title: 'Product' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('sesion');
    });

    it('debería usar defaults para price e inventory', async () => {
      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .query({ shop: testShop })
        .send({ title: 'Minimal Product' });

      expect(res.status).toBe(201);
      expect(mockRestClient.post).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            product: expect.objectContaining({
              variants: expect.arrayContaining([
                expect.objectContaining({
                  price: 0,
                  inventory_quantity: 0
                })
              ])
            })
          })
        })
      );
    });

    it('debería retornar 500 si falla cliente REST', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.post = jest.fn(async () => {
          throw new Error('API Error');
        });
        mockRestClient = this;
        return this;
      });

      const res = await request(app)
        .post('/dashboard/quick-actions/create-product')
        .query({ shop: testShop })
        .send({ title: 'Product' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /dashboard/quick-actions/orders/:id/close', () => {
    it('debería cerrar orden con shop válido', async () => {
      const res = await request(app)
        .post(`/dashboard/quick-actions/orders/${testOrderId}/close`)
        .query({ shop: testShop });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(mockRestClient.post).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `orders/${testOrderId}/close`
        })
      );
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app)
        .post(`/dashboard/quick-actions/orders/${testOrderId}/close`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('shop');
    });

    it('debería retornar 401 sin sesión para la tienda', async () => {
      const res = await request(app)
        .post(`/dashboard/quick-actions/orders/${testOrderId}/close`)
        .query({ shop: 'invalid-shop.myshopify.com' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('sesion');
    });

    it('debería retornar 500 si falla cliente REST', async () => {
      shopify.clients.Rest.mockImplementationOnce(function(opts) {
        this.session = opts.session;
        this.post = jest.fn(async () => {
          throw new Error('API Error');
        });
        mockRestClient = this;
        return this;
      });

      const res = await request(app)
        .post(`/dashboard/quick-actions/orders/${testOrderId}/close`)
        .query({ shop: testShop });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
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

      const res = await request(app).get(`/dashboard/overview?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(decryptToken).toHaveBeenCalledWith('iv:authTag:encryptedToken123');
    });
  });
});
