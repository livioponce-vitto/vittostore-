/**
 * oraculo-integration.test.js
 * Integration tests for shopify-app → oraculo-backend data flow
 * Tests the complete order synchronization pipeline
 */

const oraculo = require('../app/services/oraculo');

// Mock the http/https modules
jest.mock('http');
jest.mock('https');

const http = require('http');
const https = require('https');

describe('Oraculo Integration - Order Sync Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Order Sync', () => {
    it('should successfully sync a single Shopify order', async () => {
      // Mock successful API response
      const mockResponse = {
        ok: true,
        idempotencyKey: 'test-key-1',
        source: 'shopify',
        processed: 1,
        succeeded: 1,
        failed: 0,
        errors: []
      };

      mockHttpRequest(200, mockResponse);

      const shopifyOrder = {
        id: 'gid://shopify/Order/12345',
        email: 'customer@example.com',
        customer: {
          id: 'cust-1',
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+1234567890'
        },
        line_items: [
          {
            id: 'item-1',
            product_id: 'prod-1',
            title: 'Test Product',
            quantity: 1,
            price: '99.99',
            sku: 'SKU-001'
          }
        ],
        subtotal_price: '99.99',
        tax_price: '8.00',
        total_price: '107.99',
        shipping_lines: [{ price: '0.00' }],
        fulfillment_status: 'unshipped',
        financial_status: 'pending',
        payment_gateway_names: ['stripe']
      };

      const result = await oraculo.syncOrder(shopifyOrder, 'test-key-1');

      expect(result.success).toBe(true);
      expect(result.externalOrderId).toBe('gid://shopify/Order/12345');
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      mockHttpRequest(400, {
        ok: false,
        code: 'VALIDATION_ERROR',
        error: 'Invalid email format'
      });

      const invalidOrder = {
        id: 'invalid-order',
        email: 'not-an-email',
        customer: { email: 'not-an-email' },
        line_items: [{ product_id: 'prod-1', title: 'Product', quantity: 1, price: '100' }],
        subtotal_price: '100',
        tax_price: '0',
        total_price: '100'
      };

      try {
        await oraculo.syncOrder(invalidOrder);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('HTTP 400');
      }
    });
  });

  describe('Bulk Order Sync', () => {
    it('should sync multiple orders efficiently', async () => {
      const mockResponse = {
        ok: true,
        idempotencyKey: 'bulk-sync-1',
        source: 'shopify',
        processed: 3,
        succeeded: 3,
        failed: 0,
        errors: []
      };

      mockHttpRequest(200, mockResponse);

      const orders = [
        createMockOrder('order-1'),
        createMockOrder('order-2'),
        createMockOrder('order-3')
      ];

      const result = await oraculo.syncOrders(orders, 'bulk-sync-1');

      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);
      expect(result.succeeded).toBe(3);
    });

    it('should handle partial failures in bulk sync', async () => {
      const mockResponse = {
        ok: true,
        idempotencyKey: 'bulk-partial',
        source: 'shopify',
        processed: 2,
        succeeded: 1,
        failed: 1,
        errors: [
          {
            index: 1,
            externalOrderId: 'order-2',
            error: 'Missing required field: customerEmail',
            code: 'VALIDATION_ERROR'
          }
        ]
      };

      mockHttpRequest(200, mockResponse);

      const orders = [
        createMockOrder('order-1'),
        createMockOrder('order-2')
      ];

      const result = await oraculo.syncOrders(orders, 'bulk-partial');

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].externalOrderId).toBe('order-2');
    });
  });

  describe('Idempotency', () => {
    it('should use consistent idempotency keys for retries', async () => {
      const mockResponse = {
        ok: true,
        idempotencyKey: 'retry-key-1',
        source: 'shopify',
        processed: 1,
        succeeded: 1,
        failed: 0,
        errors: []
      };

      mockHttpRequest(200, mockResponse);

      const order = createMockOrder('idem-order-1');
      const key = 'retry-key-1';

      const result1 = await oraculo.syncOrder(order, key);
      expect(result1.success).toBe(true);

      // Simulate retry with same key - should be idempotent
      mockHttpRequest(200, mockResponse);
      const result2 = await oraculo.syncOrder(order, key);
      expect(result2.success).toBe(true);

      // Both should have same idempotency key
      expect(result1).toEqual(result2);
    });
  });

  describe('Data Transformation', () => {
    it('should handle orders with no customer object', () => {
      const order = {
        id: 'no-cust-order',
        email: 'guest@example.com',
        line_items: [
          {
            product_id: 'prod-1',
            title: 'Product',
            quantity: 1,
            price: '50'
          }
        ],
        subtotal_price: '50',
        tax_price: '0',
        total_price: '50'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(order);

      expect(transaction.customerEmail).toBe('guest@example.com');
      expect(transaction.customerId).toBeTruthy();
      expect(transaction.customerName).toBeTruthy();
    });

    it('should handle orders with partial product info', () => {
      const order = {
        id: 'partial-prod-order',
        email: 'test@example.com',
        customer: { id: 'cust-1', email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        line_items: [
          {
            id: 'item-1',
            title: 'Unknown Product',
            quantity: 2,
            price: '75.50'
            // Missing product_id and sku
          }
        ],
        subtotal_price: '151.00',
        tax_price: '12.08',
        total_price: '163.08'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(order);

      expect(transaction.items[0].externalProductId).toBeTruthy();
      expect(transaction.items[0].quantity).toBe(2);
      expect(transaction.items[0].price).toBe(75.50);
    });

    it('should preserve pricing precision', () => {
      const order = {
        id: 'precision-order',
        email: 'test@example.com',
        customer: { id: 'cust-1', email: 'test@example.com', first_name: 'T', last_name: 'U' },
        line_items: [
          {
            product_id: 'prod-1',
            title: 'Expensive Item',
            quantity: 1,
            price: '1299.99'
          }
        ],
        subtotal_price: '1299.99',
        tax_price: '103.99',
        total_price: '1403.98',
        shipping_lines: [{ price: '0.00' }]
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(order);

      expect(transaction.subtotal).toBe(1299.99);
      expect(transaction.tax).toBe(103.99);
      expect(transaction.total).toBe(1403.98);
      expect(transaction.items[0].price).toBe(1299.99);
    });
  });

  describe('Health Check', () => {
    it('should verify API availability', async () => {
      const mockResponse = {
        ok: true,
        endpoint: '/api/transacciones/bulk',
        authRequired: 'Bearer token in Authorization header',
        apiKeyConfigured: true
      };

      mockHttpRequest(200, mockResponse);

      const health = await oraculo.checkHealth();

      expect(health.ok).toBe(true);
      expect(health.apiKeyConfigured).toBe(true);
    });

    it('should handle health check failures', async () => {
      mockHttpRequest(503, { ok: false, error: 'Service unavailable' });

      const health = await oraculo.checkHealth();

      expect(health.ok).toBe(false);
    });
  });
});

// Helper functions

function createMockOrder(id) {
  return {
    id,
    email: `customer-${id}@example.com`,
    customer: {
      id: `cust-${id}`,
      email: `customer-${id}@example.com`,
      first_name: 'Test',
      last_name: 'Customer'
    },
    line_items: [
      {
        product_id: `prod-${id}`,
        title: `Product for ${id}`,
        quantity: 1,
        price: '99.99'
      }
    ],
    subtotal_price: '99.99',
    tax_price: '8.00',
    total_price: '107.99',
    fulfillment_status: 'unshipped',
    financial_status: 'pending'
  };
}

function mockHttpRequest(statusCode, responseBody) {
  const mockRequest = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'error') {
        // Store error handler
      }
    }),
    destroy: jest.fn()
  };

  const mockResponse = {
    statusCode,
    on: jest.fn((event, handler) => {
      if (event === 'data') {
        handler(JSON.stringify(responseBody));
      } else if (event === 'end') {
        handler();
      }
    })
  };

  const requestHandler = jest.fn((options, callback) => {
    callback(mockResponse);
    return mockRequest;
  });

  http.request.mockImplementation(requestHandler);
  https.request.mockImplementation(requestHandler);
}
