const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const dlq = require('../app/services/dlq');
const oraculo = require('../app/services/oraculo');
const DLQRetryJob = require('../app/jobs/DLQRetryJob');

jest.mock('../app/middleware/verifyWebhook', () => (req, res, next) => next());
jest.mock('../app/services/oraculo');

describe('DLQ End-to-End Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Clear DLQ state between tests
    const dlqDir = path.join(__dirname, '../config/dlq');
    if (fs.existsSync(dlqDir)) {
      fs.rmSync(dlqDir, { recursive: true });
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Complete workflow: webhook → DLQ → retry → storage', () => {
    it('debería procesar una orden fallida: webhook → enqueue → retry → suceso', async () => {
      const order = {
        id: '1001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z',
        customer: { id: '123', email: 'test@example.com' }
      };

      // 1. Webhook falla en Oraculo
      const syncError = new Error('API timeout');
      oraculo.syncOrder.mockRejectedValueOnce(syncError);

      // Simular webhook
      const webhookRes = await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order)
        .expect(200);

      expect(webhookRes.text).toBe('ok');

      // 2. Verificar que la orden está en DLQ
      jest.advanceTimersByTime(100);
      let pendingAfterWebhook = dlq.getPendingRetries();
      expect(pendingAfterWebhook).toHaveLength(0); // Not yet ready (retry at 5000ms)

      // Advance time past retry window
      jest.advanceTimersByTime(5000);
      pendingAfterWebhook = dlq.getPendingRetries();
      expect(pendingAfterWebhook).toHaveLength(1);
      expect(pendingAfterWebhook[0].orderId).toBe('1001');
      expect(pendingAfterWebhook[0].retries).toBe(0);

      // 3. Retry job intenta sincronizar nuevamente, pero falla
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Service unavailable'));
      await DLQRetryJob.run();

      // Verificar que se registró el reintento
      const stats = dlq.getStats();
      expect(stats.pending).toBe(1); // Aún pendiente

      // Advance timer for next retry (5000 * (retries + 1) = 10000)
      jest.advanceTimersByTime(10000);
      const pendingItems = dlq.getPendingRetries();
      expect(pendingItems).toHaveLength(1);
      expect(pendingItems[0].retries).toBe(1);

      // 4. Segundo reintento: éxito
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      await DLQRetryJob.run();

      // 5. Verificar que está marcado como succeeded
      const statsAfterSuccess = dlq.getStats();
      expect(statsAfterSuccess.succeeded).toBe(1);
      expect(statsAfterSuccess.pending).toBe(0);
      expect(oraculo.syncOrder).toHaveBeenCalledTimes(3); // 1 webhook + 2 retries
    });

    it('debería mover orden a failed después de MAX_RETRIES', async () => {
      const order = {
        id: '1002',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      const syncError = new Error('Persistent error');

      // 1. Webhook falla
      oraculo.syncOrder.mockRejectedValueOnce(syncError);
      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      // 2. Retry 1 falla
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Persistent error'));
      await DLQRetryJob.run();

      // 3. Retry 2 falla
      jest.advanceTimersByTime(10000);
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Persistent error'));
      await DLQRetryJob.run();

      // 4. Retry 3 falla → item marked as failed
      jest.advanceTimersByTime(15000);
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Persistent error'));
      await DLQRetryJob.run();

      // Verificar que está en failed
      const failedItems = dlq.getFailedItems();
      expect(failedItems).toHaveLength(1);
      expect(failedItems[0].orderId).toBe('1002');
      expect(failedItems[0].retries).toBe(3);
      expect(failedItems[0].attempts).toHaveLength(4); // initial + 3 retries

      const stats = dlq.getStats();
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it('debería exponer failed items via /dlq/failed endpoint', async () => {
      const order = {
        id: '1003',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Persistent error'));

      // 1. Trigger webhook
      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      // 2. Exhaust retries (3x)
      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      // 3. Fetch via /dlq/failed endpoint
      const response = await request(app)
        .get('/dlq/failed')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.items).toHaveLength(1);

      const failedItem = response.body.data.items[0];
      expect(failedItem.orderId).toBe('1003');
      expect(failedItem.maxRetries).toBe(3);
      expect(failedItem.retries).toBe(3);
      expect(failedItem.attempts.length).toBe(4);
    });

    it('debería mantenere el orden de intentos con timestamps', async () => {
      const order = {
        id: '1004',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('API error'));

      // 1. Webhook
      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      const baseTimestamp = Date.now();

      // 2. Retries
      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      // 3. Verificar que los timestamps están en orden
      const failedItems = dlq.getFailedItems();
      const attempts = failedItems[0].attempts;

      expect(attempts).toHaveLength(4);
      for (let i = 1; i < attempts.length; i++) {
        const prev = new Date(attempts[i - 1].timestamp).getTime();
        const curr = new Date(attempts[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('debería manejo de múltiples órdenes paralelas', async () => {
      const orders = [
        { id: '2001', financial_status: 'paid', updated_at: '2026-05-29T10:00:00Z' },
        { id: '2002', financial_status: 'paid', updated_at: '2026-05-29T10:01:00Z' },
        { id: '2003', financial_status: 'paid', updated_at: '2026-05-29T10:02:00Z' }
      ];

      // 1. Trigger 3 webhooks
      oraculo.syncOrder.mockRejectedValue(new Error('Service down'));
      for (const order of orders) {
        await request(app)
          .post('/shopify/webhooks/orders/paid')
          .set('x-shopify-shop-domain', 'test.myshopify.com')
          .send(order);
      }

      jest.advanceTimersByTime(5100);

      // 2. Verificar que todas las órdenes están en pending
      let stats = dlq.getStats();
      expect(stats.pending).toBe(3);

      // 3. Hacer un reintento: 2 suceden, 1 falla
      oraculo.syncOrder
        .mockResolvedValueOnce({ ok: true }) // 2001 succeeds
        .mockRejectedValueOnce(new Error('Timeout')) // 2002 fails
        .mockResolvedValueOnce({ ok: true }); // 2003 succeeds

      await DLQRetryJob.run();

      stats = dlq.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.succeeded).toBe(2);

      // 4. Segundo reintento: 2002 también succeeds
      jest.advanceTimersByTime(10000);
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      await DLQRetryJob.run();

      stats = dlq.getStats();
      expect(stats.succeeded).toBe(3);
      expect(stats.pending).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('debería exponer stats correctas via /dlq/stats en cada etapa', async () => {
      const order = {
        id: '3001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      // Initial state: empty
      let res = await request(app).get('/dlq/stats').expect(200);
      expect(res.body.stats.total).toBe(0);

      // After webhook failure
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Failed'));
      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      res = await request(app).get('/dlq/stats').expect(200);
      expect(res.body.stats.total).toBe(1);
      expect(res.body.stats.pending).toBe(1);

      // After successful retry
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      await DLQRetryJob.run();

      res = await request(app).get('/dlq/stats').expect(200);
      expect(res.body.stats.total).toBe(1);
      expect(res.body.stats.succeeded).toBe(1);
      expect(res.body.stats.pending).toBe(0);
    });
  });

  describe('Error scenarios in workflow', () => {
    it('debería continuar procesando si una orden falla', async () => {
      const orders = [
        { id: '4001', financial_status: 'paid', updated_at: '2026-05-29T10:00:00Z' },
        { id: '4002', financial_status: 'paid', updated_at: '2026-05-29T10:01:00Z' }
      ];

      oraculo.syncOrder
        .mockRejectedValueOnce(new Error('Error 1')) // 4001 fails
        .mockRejectedValueOnce(new Error('Error 2')); // 4002 fails

      // Trigger webhooks
      for (const order of orders) {
        await request(app)
          .post('/shopify/webhooks/orders/paid')
          .set('x-shopify-shop-domain', 'test.myshopify.com')
          .send(order);
      }

      jest.advanceTimersByTime(5100);

      // Retry with one success, one failure
      oraculo.syncOrder
        .mockResolvedValueOnce({ ok: true }) // 4001 succeeds
        .mockRejectedValueOnce(new Error('Still failing')); // 4002 fails again

      await DLQRetryJob.run();

      const stats = dlq.getStats();
      expect(stats.succeeded).toBe(1);
      expect(stats.pending).toBe(1); // 4002 still pending
    });

    it('debería manejar orden sin financial_status paid', async () => {
      const order = {
        id: '5001',
        financial_status: 'pending', // Not paid
        updated_at: '2026-05-29T10:00:00Z'
      };

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order)
        .expect(200);

      jest.advanceTimersByTime(100);

      // Should not call oraculo for non-paid orders
      expect(oraculo.syncOrder).not.toHaveBeenCalled();

      const stats = dlq.getStats();
      expect(stats.total).toBe(0);
    });
  });
});
