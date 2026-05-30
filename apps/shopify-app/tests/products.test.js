const request = require('supertest');
const express = require('express');

jest.mock('../app/services/sessionStorage', () => ({
  loadSession: jest.fn()
}));

jest.mock('../app/routes/auth', () => ({
  decryptToken: jest.fn(token => token)
}));

jest.mock('../app/services/shopify', () => ({
  clients: {
    Rest: jest.fn()
  }
}));

jest.mock('../app/middleware/authSession', () => (req, res, next) => {
  req.shop = req.query.shop || 'test.myshopify.com';
  next();
});

const { loadSession } = require('../app/services/sessionStorage');
const { decryptToken } = require('../app/routes/auth');
const shopify = require('../app/services/shopify');
const productsRouter = require('../app/routes/products');

describe('Products API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';
  const accessToken = 'test-access-token';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/products', productsRouter);
    jest.clearAllMocks();
    jest.resetAllMocks();

    loadSession.mockImplementation(key => {
      if (key === `offline_${testShop}`) {
        return {
          shop: testShop,
          accessToken,
          isEncrypted: false
        };
      }
      return null;
    });

    decryptToken.mockImplementation(token => token);
  });

  describe('GET /products/:id', () => {
    it('debería obtener producto por ID', async () => {
      const productId = '123456789';
      const mockProduct = {
        id: productId,
        title: 'Test Product',
        handle: 'test-product'
      };

      const mockClient = {
        get: jest.fn().mockResolvedValue({
          body: { product: mockProduct }
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app).get(`/products/${productId}?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.product.id).toBe(productId);
      expect(mockClient.get).toHaveBeenCalled();
    });

    it('debería retornar 400 sin parámetro shop para GET /:id', async () => {
      const res = await request(app).get('/products/123456789');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('debería retornar 500 para error al obtener producto', async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error('API Error'))
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app).get(`/products/nonexistent?shop=${testShop}`);

      expect(res.status).toBe(500);
    });
  });

  describe('GET /products', () => {
    it('debería listar productos con sesión válida', async () => {
      const mockProducts = [
        { id: 'gid://shopify/Product/1', title: 'Producto 1' },
        { id: 'gid://shopify/Product/2', title: 'Producto 2' }
      ];

      const mockClient = {
        get: jest.fn().mockResolvedValue({
          body: { products: mockProducts },
          pageInfo: null
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app).get(`/products?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(mockClient.get).toHaveBeenCalled();
    });

    it('debería soportar paginación con page_info', async () => {
      const mockProducts = [
        { id: 'gid://shopify/Product/3', title: 'Producto 3' }
      ];

      const mockClient = {
        get: jest.fn().mockResolvedValue({
          body: { products: mockProducts },
          pageInfo: { hasNextPage: false, endCursor: 'cursor-123' }
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app).get(`/products?shop=${testShop}&page_info=cursor-123`);

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            page_info: 'cursor-123'
          })
        })
      );
    });

    it('debería retornar 401 sin sesión válida', async () => {
      loadSession.mockReturnValue(null);

      const res = await request(app).get(`/products?shop=${testShop}`);

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/products');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /products', () => {
    it('debería crear producto con datos válidos', async () => {
      const newProduct = {
        title: 'Producto Nuevo',
        productType: 'Tipo',
        vendor: 'Vendedor'
      };

      const mockCreatedProduct = {
        id: 'gid://shopify/Product/123',
        title: newProduct.title
      };

      const mockClient = {
        post: jest.fn().mockResolvedValue({
          body: { product: mockCreatedProduct }
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app)
        .post(`/products?shop=${testShop}`)
        .send(newProduct);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(mockClient.post).toHaveBeenCalled();
    });

    it('debería crear producto sin validación en cliente (validación en Shopify)', async () => {
      const mockClient = {
        post: jest.fn().mockResolvedValue({
          body: { product: { id: 'gid://shopify/Product/123', title: 'Untitled' } }
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app)
        .post(`/products?shop=${testShop}`)
        .send({ productType: 'Tipo' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('PUT /products/:id', () => {
    it('debería actualizar producto existente', async () => {
      const productId = '123456789';
      const updates = { title: 'Título Actualizado' };

      const mockUpdatedProduct = {
        id: productId,
        title: updates.title
      };

      const mockClient = {
        put: jest.fn().mockResolvedValue({
          body: { product: mockUpdatedProduct }
        })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app)
        .put(`/products/${productId}?shop=${testShop}`)
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockClient.put).toHaveBeenCalled();
    });

    it('debería retornar 500 para error en Shopify API', async () => {
      const mockClient = {
        put: jest.fn().mockRejectedValue(new Error('API Error'))
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app)
        .put(`/products/invalid-id?shop=${testShop}`)
        .send({ title: 'Test' });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /products/:id', () => {
    it('debería eliminar producto existente', async () => {
      const productId = '123456789';

      const mockClient = {
        delete: jest.fn().mockResolvedValue({ body: {} })
      };

      shopify.clients.Rest.mockImplementation(() => mockClient);

      const res = await request(app)
        .delete(`/products/${productId}?shop=${testShop}`);

      expect([200, 204]).toContain(res.status);
      expect(mockClient.delete).toHaveBeenCalled();
    });
  });
});
