const request = require('supertest');
const app = require('../server');
const crypto = require('crypto');

jest.mock('../app/services/oraculo', () => ({
  syncOrder: jest.fn().mockResolvedValue({ success: true, succeeded: 1 })
}));

jest.mock('../app/services/dlq', () => ({
  enqueue: jest.fn().mockReturnValue('dlq-test-id')
}));

const oraculo = require('../app/services/oraculo');
const dlq = require('../app/services/dlq');

function createHmac(payload) {
  return crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('base64');
}

describe('Webhooks Shopify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('products/update procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 456, title: 'Nuevo título' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/products/update')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });

  it('orders/cancelled procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 789, cancelled_at: '2026-04-22T10:00:00Z' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/orders/cancelled')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });

  it('customers/create procesa correctamente', async () => {
    const payload = JSON.stringify({ id: 321, email: 'cliente@ejemplo.com' });
    const hmac = createHmac(payload);
    const res = await request(app)
      .post('/shopify/webhooks/customers/create')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('x-shopify-shop-domain', 'test.myshopify.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.statusCode).toBe(200);
  });

  describe('orders/paid webhook - Oraculo Integration', () => {
    it('debería sincronizar orden pagada a Oraculo', async () => {
      const order = {
        id: '12345',
        email: 'customer@example.com',
        financial_status: 'paid',
        fulfillment_status: 'unshipped',
        customer: {
          id: 'cust-123',
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe'
        },
        line_items: [
          { id: 'item-1', product_id: 'prod-1', title: 'Product', quantity: 1, price: '100' }
        ],
        subtotal_price: '100',
        tax_price: '0',
        total_price: '100',
        updated_at: '2026-05-28T10:00:00Z'
      };

      const payload = JSON.stringify(order);
      const hmac = createHmac(payload);

      const res = await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.text).toBe('ok');

      // Esperar brevemente para que la promesa async se resuelva
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(oraculo.syncOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '12345',
          financial_status: 'paid'
        }),
        expect.stringContaining('shopify-12345-')
      );
    });

    it('debería no sincronizar orden sin pagar a Oraculo', async () => {
      const order = {
        id: '12346',
        email: 'customer@example.com',
        financial_status: 'pending',
        fulfillment_status: 'unshipped',
        customer: {
          id: 'cust-124',
          email: 'customer@example.com',
          first_name: 'Jane',
          last_name: 'Smith'
        },
        line_items: [
          { id: 'item-1', product_id: 'prod-1', title: 'Product', quantity: 1, price: '50' }
        ],
        subtotal_price: '50',
        tax_price: '0',
        total_price: '50',
        updated_at: '2026-05-28T10:00:00Z'
      };

      const payload = JSON.stringify(order);
      const hmac = createHmac(payload);

      const res = await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.statusCode).toBe(200);

      // Esperar brevemente y verificar que syncOrder no fue llamado
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(oraculo.syncOrder).not.toHaveBeenCalled();
    });

    it('debería retornar 200 incluso si Oraculo falla', async () => {
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Oraculo API error'));

      const order = {
        id: '12347',
        email: 'customer@example.com',
        financial_status: 'paid',
        fulfillment_status: 'unshipped',
        customer: {
          id: 'cust-125',
          email: 'customer@example.com',
          first_name: 'Bob',
          last_name: 'Johnson'
        },
        line_items: [
          { id: 'item-1', product_id: 'prod-1', title: 'Product', quantity: 1, price: '75' }
        ],
        subtotal_price: '75',
        tax_price: '0',
        total_price: '75',
        updated_at: '2026-05-28T10:00:00Z'
      };

      const payload = JSON.stringify(order);
      const hmac = createHmac(payload);

      const res = await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.text).toBe('ok');

      // Esperar y verificar que syncOrder fue llamado pero falló sin afectar respuesta
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(oraculo.syncOrder).toHaveBeenCalled();

      // Verificar que el error fue encolado en DLQ
      expect(dlq.enqueue).toHaveBeenCalledWith(
        order,
        `shopify-${order.id}-${order.updated_at}`,
        expect.any(Error)
      );
    });

    it('debería generar idempotency key correcto con orderId y updatedAt', async () => {
      const order = {
        id: 'abc-789',
        email: 'customer@example.com',
        financial_status: 'paid',
        fulfillment_status: 'unshipped',
        customer: { id: 'cust-1', email: 'customer@example.com', first_name: 'Test', last_name: 'User' },
        line_items: [{ id: 'item-1', product_id: 'prod-1', title: 'Product', quantity: 1, price: '100' }],
        subtotal_price: '100',
        tax_price: '0',
        total_price: '100',
        updated_at: '2026-05-28T15:30:45Z'
      };

      const payload = JSON.stringify(order);
      const hmac = createHmac(payload);

      const res = await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.statusCode).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(oraculo.syncOrder).toHaveBeenCalledWith(
        order,
        'shopify-abc-789-2026-05-28T15:30:45Z'
      );
    });
  });
});
