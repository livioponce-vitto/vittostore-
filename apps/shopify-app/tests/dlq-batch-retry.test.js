const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const dlq = require('../app/services/dlq');
const oraculo = require('../app/services/oraculo');
const DLQRetryJob = require('../app/jobs/DLQRetryJob');

jest.mock('../app/middleware/verifyWebhook', () => (req, res, next) => next());
jest.mock('../app/services/oraculo');

describe('DLQ Batch Retry API', () => {
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

  describe('POST /dashboard/dlq/batch-retry', () => {
    it('debería reintentar múltiples items fallidos exitosamente', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      // Create 3 failed items
      for (let i = 1; i <= 3; i++) {
        const order = {
          id: `100${i}`,
          financial_status: 'paid',
          updated_at: '2026-05-29T10:00:00Z'
        };

        await request(app)
          .post('/shopify/webhooks/orders/paid')
          .set('x-shopify-shop-domain', 'test.myshopify.com')
          .send(order);

        jest.advanceTimersByTime(5100);

        for (let j = 0; j < 3; j++) {
          await DLQRetryJob.run();
          if (j < 2) jest.advanceTimersByTime(5000 * (j + 2));
        }
      }

      const failedItems = dlq.getFailedItems();
      expect(failedItems).toHaveLength(3);
      const queueIds = failedItems.map(item => item.queueId);

      // Batch retry
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.successful).toHaveLength(3);
      expect(response.body.failed).toHaveLength(0);
      expect(response.body.summary.total).toBe(3);
      expect(response.body.summary.succeeded).toBe(3);
      expect(response.body.summary.failed).toBe(0);
    });

    it('debería manejar batch con algunos items inválidos', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      // Create 1 failed item
      const order = {
        id: '2001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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
      const validQueueId = failedItems[0].queueId;

      // Mix valid and invalid queueIds
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [validQueueId, 'invalid-id-1', 'invalid-id-2'] })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.successful).toHaveLength(1);
      expect(response.body.failed).toHaveLength(2);
      expect(response.body.summary.total).toBe(3);
      expect(response.body.summary.succeeded).toBe(1);
      expect(response.body.summary.failed).toBe(2);
      expect(response.body.failed[0].queueId).toBe('invalid-id-1');
    });

    it('debería soportar retryAll para reintentar todos los items fallidos', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      // Create 2 failed items
      for (let i = 1; i <= 2; i++) {
        const order = {
          id: `300${i}`,
          financial_status: 'paid',
          updated_at: '2026-05-29T10:00:00Z'
        };

        await request(app)
          .post('/shopify/webhooks/orders/paid')
          .set('x-shopify-shop-domain', 'test.myshopify.com')
          .send(order);

        jest.advanceTimersByTime(5100);

        for (let j = 0; j < 3; j++) {
          await DLQRetryJob.run();
          if (j < 2) jest.advanceTimersByTime(5000 * (j + 2));
        }
      }

      // Retry all without specifying queueIds
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ retryAll: true })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.successful).toHaveLength(2);
      expect(response.body.failed).toHaveLength(0);
      expect(response.body.summary.succeeded).toBe(2);
    });

    it('debería retornar 400 cuando queueIds está vacío y retryAll no está presente', async () => {
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [] })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('queueIds array is required');
    });

    it('debería retornar 400 cuando body está vacío', async () => {
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({})
        .expect(400);

      expect(response.body.ok).toBe(false);
    });

    it('debería resetear retries a 0 para todos los items en batch', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      const order = {
        id: '4001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      const pending = dlq.getPendingRetries();
      expect(pending).toHaveLength(1);
      expect(pending[0].retries).toBe(0);
    });

    it('debería incluir nextRetryAt en items exitosos del batch', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      const order = {
        id: '5001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      expect(response.body.successful[0].nextRetryAt).toBeDefined();
      expect(response.body.successful[0].nextRetryAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('debería permitir reintentros múltiples del mismo batch', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      const order = {
        id: '6001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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

      // First batch retry
      oraculo.syncOrder.mockRejectedValueOnce(new Error('Still failing'));
      const firstResponse = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      expect(firstResponse.body.ok).toBe(true);
      await DLQRetryJob.run();

      // Second batch retry - should succeed
      oraculo.syncOrder.mockResolvedValueOnce({ ok: true });
      const secondResponse = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      expect(secondResponse.body.ok).toBe(true);
      await DLQRetryJob.run();

      const stats = dlq.getStats();
      expect(stats.succeeded).toBe(1);
    });

    it('debería incluir timestamp ISO en respuesta', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      const order = {
        id: '7001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('debería manejar batch vacío después de retryAll en queue vacía', async () => {
      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ retryAll: true })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.successful).toHaveLength(0);
      expect(response.body.summary.total).toBe(0);
      expect(response.body.summary.succeeded).toBe(0);
    });

    it('debería preservar orderId en items exitosos del batch', async () => {
      oraculo.syncOrder.mockRejectedValue(new Error('Error'));

      const order = {
        id: '8001',
        financial_status: 'paid',
        updated_at: '2026-05-29T10:00:00Z'
      };

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
        .post('/dashboard/dlq/batch-retry')
        .send({ queueIds: [queueId] })
        .expect(200);

      expect(response.body.successful[0].orderId).toBe('8001');
      expect(response.body.successful[0].queueId).toBe(queueId);
    });
  });
});
