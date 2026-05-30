const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const dlq = require('../app/services/dlq');
const oraculo = require('../app/services/oraculo');
const DLQRetryJob = require('../app/jobs/DLQRetryJob');

jest.mock('../app/middleware/verifyWebhook', () => (req, res, next) => next());
jest.mock('../app/services/oraculo');

describe('DLQ Manual Retry API', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    const dlqDir = path.join(__dirname, '../config/dlq');
    if (fs.existsSync(dlqDir)) {
      fs.rmSync(dlqDir, { recursive: true });
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST /dlq/retry/:queueId', () => {
    it('debería resetear un item fallido para reintentarlo manualmente', async () => {
      const order = {
        id: '1001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValueOnce(new Error('Service down'));
      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      // Retry 1: fails
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Still down'));
      await DLQRetryJob.run();

      // Retry 2: fails
      jest.advanceTimersByTime(10000);
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Still down'));
      await DLQRetryJob.run();

      // Retry 3: fails → item is now in failed status
      jest.advanceTimersByTime(15000);
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Still down'));
      await DLQRetryJob.run();

      const failedItems = dlq.getFailedItems();
      expect(failedItems).toHaveLength(1);
      const queueId = failedItems[0].queueId;

      // Now manually retry
      const response = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.queueId).toBe(queueId);
      expect(response.body.orderId).toBe('1001');
      expect(response.body.nextRetryAt).toBeDefined();

      // Verify item is back to pending
      const pending = dlq.getPendingRetries();
      expect(pending).toHaveLength(1);
      expect(pending[0].retries).toBe(0);
    });

    it('debería retornar 404 cuando queueId no existe', async () => {
      const response = await request(app)
        .post('/dashboard/dlq/retry/invalid-queue-id')
        .expect(404);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('Queue item not found');
    });

    it('debería permitir reintentar un item fallido inmediatamente', async () => {
      const order = {
        id: '1002',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Persistent error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedItems = dlq.getFailedItems();
      const queueId = failedItems[0].queueId;

      // Reset and verify retries = 0
      const resetResponse = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(resetResponse.body.retries).toBeUndefined(); // Not in reset response

      // Verify item is ready now
      const pending = dlq.getPendingRetries();
      expect(pending).toHaveLength(1);
      expect(pending[0].orderId).toBe('1002');

      // Now successful retry
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      await DLQRetryJob.run();

      const stats = dlq.getStats();
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(0);
    });

    it('debería incluir timestamp ISO en respuesta', async () => {
      const order = {
        id: '1003',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedItems = dlq.getFailedItems();
      const queueId = failedItems[0].queueId;

      const response = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('debería permitir múltiples reintentos manuales del mismo item', async () => {
      const order = {
        id: '1004',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedItems = dlq.getFailedItems();
      const queueId = failedItems[0].queueId;

      // First manual retry: fails again
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Still failing'));
      const firstRetry = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(firstRetry.body.ok).toBe(true);

      await DLQRetryJob.run();

      // Second manual retry: succeeds
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      const secondRetry = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(secondRetry.body.ok).toBe(true);

      await DLQRetryJob.run();

      const stats = dlq.getStats();
      expect(stats.succeeded).toBe(1);
    });

    it('debería resetear retries a 0 en manual retry', async () => {
      const order = {
        id: '1005',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedBefore = dlq.getFailedItems();
      expect(failedBefore[0].retries).toBe(3);

      const queueId = failedBefore[0].queueId;

      await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      const pending = dlq.getPendingRetries();
      expect(pending[0].retries).toBe(0);
    });

    it('debería actualizar nextRetryAt a ahora para reintentos inmediatos', async () => {
      const order = {
        id: '1006',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedItems = dlq.getFailedItems();
      const queueId = failedItems[0].queueId;

      const beforeTime = new Date().getTime();
      const response = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);
      const afterTime = new Date().getTime();

      const nextRetryTime = new Date(response.body.nextRetryAt).getTime();
      expect(nextRetryTime).toBeGreaterThanOrEqual(beforeTime);
      expect(nextRetryTime).toBeLessThanOrEqual(afterTime);
    });

    it('debería preservar order y attempt history después de manual retry', async () => {
      const order = {
        id: '1007',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      const failedBefore = dlq.getFailedItems();
      const attemptsBefore = failedBefore[0].attempts.length;
      const queueId = failedBefore[0].queueId;

      await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      const pending = dlq.getPendingRetries();
      expect(pending[0].orderId).toBe('1007');
      expect(pending[0].attempts.length).toBe(attemptsBefore);
    });

    it('debería permitir reintentos manuales desde dashboard UI', async () => {
      const order = {
        id: '1008',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      await request(app)
        .post('/shopify/webhooks/orders/paid')
        .set('x-shopify-shop-domain', 'test.myshopify.com')
        .send(order);

      jest.advanceTimersByTime(5100);

      for (let i = 0; i < 3; i++) {
        await DLQRetryJob.run();
        if (i < 2) jest.advanceTimersByTime(5000 * (i + 2));
      }

      // Dashboard shows failed items
      const metricsRes = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(metricsRes.body.recentFailed).toHaveLength(1);
      const queueId = metricsRes.body.recentFailed[0].queueId;

      // Click retry button
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      const retryRes = await request(app)
        .post(`/dashboard/dlq/retry/${queueId}`)
        .expect(200);

      expect(retryRes.body.ok).toBe(true);

      // Verify next metrics call shows it's pending
      const statusBefore = metricsRes.body.health.status;
      expect(statusBefore).toBe('critical'); // 3/3 failed = 100%

      await DLQRetryJob.run();

      const metricsAfter = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(metricsAfter.body.health.failureRate).toBe(0);
      expect(metricsAfter.body.queue.succeeded).toBe(1);
    });
  });
});
