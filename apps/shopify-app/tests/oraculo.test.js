/**
 * oraculo.test.js
 * Tests for Oraculo API client service
 */

const oraculo = require('../app/services/oraculo');

describe('Oraculo Client Service', () => {
  describe('transformShopifyOrderToTransaction', () => {
    it('should transform a valid Shopify order to transaction format', () => {
      const shopifyOrder = {
        id: '12345',
        email: 'customer@example.com',
        customer: {
          id: 'cust-001',
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+1234567890'
        },
        line_items: [
          {
            id: 'item-1',
            product_id: 'prod-001',
            title: 'Test Product',
            quantity: 2,
            price: '99.99',
            sku: 'SKU-001'
          }
        ],
        subtotal_price: '199.98',
        tax_price: '15.99',
        total_price: '240.97',
        shipping_lines: [
          {
            price: '25.00'
          }
        ],
        fulfillment_status: 'unshipped',
        financial_status: 'pending',
        payment_gateway_names: ['stripe'],
        billing_address: {
          name: 'John Doe',
          address1: '123 Main St',
          city: 'San Francisco',
          province: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        created_at: '2026-05-28T10:00:00Z',
        updated_at: '2026-05-28T10:00:00Z'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(shopifyOrder);

      expect(transaction.externalOrderId).toBe('12345');
      expect(transaction.customerId).toBe('cust-001');
      expect(transaction.customerEmail).toBe('customer@example.com');
      expect(transaction.customerName).toBe('John Doe');
      expect(transaction.items.length).toBe(1);
      expect(transaction.items[0].externalProductId).toBe('prod-001');
      expect(transaction.items[0].productName).toBe('Test Product');
      expect(transaction.items[0].quantity).toBe(2);
      expect(transaction.items[0].price).toBe(99.99);
      expect(transaction.subtotal).toBe(199.98);
      expect(transaction.tax).toBe(15.99);
      expect(transaction.shipping).toBe(25.00);
      expect(transaction.total).toBe(240.97);
      expect(transaction.status).toBe('pending');
      expect(transaction.paymentStatus).toBe('pending');
    });

    it('should handle orders with multiple line items', () => {
      const shopifyOrder = {
        id: 'multi-order-1',
        customer: {
          id: 'cust-002',
          email: 'multi@example.com',
          first_name: 'Jane',
          last_name: 'Smith'
        },
        email: 'multi@example.com',
        line_items: [
          {
            id: 'item-1',
            product_id: 'prod-001',
            title: 'Product 1',
            quantity: 1,
            price: '50.00'
          },
          {
            id: 'item-2',
            product_id: 'prod-002',
            title: 'Product 2',
            quantity: 3,
            price: '25.00'
          }
        ],
        subtotal_price: '125.00',
        tax_price: '10.00',
        total_price: '135.00',
        fulfillment_status: 'fulfilled',
        financial_status: 'paid'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(shopifyOrder);

      expect(transaction.items.length).toBe(2);
      expect(transaction.items[0].quantity).toBe(1);
      expect(transaction.items[1].quantity).toBe(3);
      expect(transaction.status).toBe('completed');
      expect(transaction.paymentStatus).toBe('succeeded');
    });

    it('should use fallback values for missing customer info', () => {
      const shopifyOrder = {
        id: 'fallback-order-1',
        email: 'fallback@example.com',
        line_items: [
          {
            id: 'item-1',
            title: 'Product',
            quantity: 1,
            price: '100.00'
          }
        ],
        subtotal_price: '100.00',
        tax_price: '0.00',
        total_price: '100.00'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(shopifyOrder);

      expect(transaction.externalOrderId).toBe('fallback-order-1');
      expect(transaction.customerId).toBe('cust-fallback-order-1');
      expect(transaction.customerEmail).toBe('fallback@example.com');
      expect(transaction.customerName).toBeTruthy();
    });

    it('should map fulfillment statuses correctly', () => {
      const baseOrder = {
        id: 'status-test',
        customer: { id: 'cust', email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        email: 'test@example.com',
        line_items: [{ id: '1', title: 'Product', quantity: 1, price: '100' }],
        subtotal_price: '100',
        tax_price: '0',
        total_price: '100'
      };

      const fulfilled = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        fulfillment_status: 'fulfilled'
      });
      expect(fulfilled.status).toBe('completed');

      const partial = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        fulfillment_status: 'partial'
      });
      expect(partial.status).toBe('processing');

      const unshipped = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        fulfillment_status: 'unshipped'
      });
      expect(unshipped.status).toBe('pending');
    });

    it('should map payment statuses correctly', () => {
      const baseOrder = {
        id: 'payment-status-test',
        customer: { id: 'cust', email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        email: 'test@example.com',
        line_items: [{ id: '1', title: 'Product', quantity: 1, price: '100' }],
        subtotal_price: '100',
        tax_price: '0',
        total_price: '100'
      };

      const paid = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        financial_status: 'paid'
      });
      expect(paid.paymentStatus).toBe('succeeded');

      const authorized = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        financial_status: 'authorized'
      });
      expect(authorized.paymentStatus).toBe('processing');

      const refunded = oraculo.transformShopifyOrderToTransaction({
        ...baseOrder,
        financial_status: 'refunded'
      });
      expect(refunded.paymentStatus).toBe('refunded');
    });

    it('should throw error for missing order id', () => {
      expect(() => {
        oraculo.transformShopifyOrderToTransaction({
          customer: { email: 'test@example.com' },
          line_items: []
        });
      }).toThrow('Invalid Shopify order');
    });

    it('should throw error for orders with no line items', () => {
      expect(() => {
        oraculo.transformShopifyOrderToTransaction({
          id: '123',
          customer: { email: 'test@example.com' },
          line_items: []
        });
      }).toThrow('no line items');
    });
  });

  describe('Transaction Format Validation', () => {
    it('should produce valid transaction matching API schema', () => {
      const order = {
        id: '999',
        email: 'valid@example.com',
        customer: {
          id: 'cust-valid',
          email: 'valid@example.com',
          first_name: 'Valid',
          last_name: 'User'
        },
        line_items: [
          {
            id: '1',
            product_id: 'prod-valid',
            title: 'Valid Product',
            quantity: 1,
            price: '100.00'
          }
        ],
        subtotal_price: '100.00',
        tax_price: '0.00',
        total_price: '100.00'
      };

      const transaction = oraculo.transformShopifyOrderToTransaction(order);

      // Verify required fields exist
      expect(transaction.externalOrderId).toBeDefined();
      expect(transaction.customerId).toBeDefined();
      expect(transaction.customerEmail).toBeDefined();
      expect(transaction.customerName).toBeDefined();
      expect(transaction.items).toBeDefined();
      expect(Array.isArray(transaction.items)).toBe(true);
      expect(transaction.items.length).toBeGreaterThan(0);
      expect(transaction.subtotal).toBeDefined();
      expect(transaction.total).toBeDefined();

      // Verify each item has required fields
      transaction.items.forEach(item => {
        expect(item.externalProductId).toBeDefined();
        expect(item.productName).toBeDefined();
        expect(item.quantity).toBeDefined();
        expect(item.price).toBeDefined();
        expect(typeof item.price).toBe('number');
        expect(item.price).toBeGreaterThan(0);
      });
    });
  });
});
