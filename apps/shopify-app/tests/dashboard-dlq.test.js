const request = require('supertest');
const app = require('../server');
const dlq = require('../app/services/dlq');

jest.mock('../app/services/dlq');

describe('Dashboard DLQ Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /dashboard/dlq-metrics', () => {
    it('debería retornar métricas de DLQ cuando hay items', async () => {
      const mockStats = {
        total: 10,
        pending: 2,
        succeeded: 7,
        failed: 1,
        items: [
          { retries: 0 },
          { retries: 1 },
          { retries: 1 },
          { retries: 2 },
          { retries: 0 },
          { retries: 1 },
          { retries: 1 },
          { retries: 0 },
          { retries: 3 },
          { retries: 2 }
        ]
      };

      const mockFailed = [
        {
          orderId: '500',
          queueId: 'dlq-failed-1',
          failedAt: '2026-05-29T10:15:00Z',
          attempts: [
            { timestamp: '2026-05-29T10:00:00Z', error: 'Timeout' },
            { timestamp: '2026-05-29T10:05:00Z', error: 'Timeout' },
            { timestamp: '2026-05-29T10:10:00Z', error: 'Service unavailable' }
          ]
        }
      ];

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.queue.total).toBe(10);
      expect(response.body.queue.pending).toBe(2);
      expect(response.body.queue.succeeded).toBe(7);
      expect(response.body.queue.failed).toBe(1);
      expect(response.body.timestamp).toBeDefined();
    });

    it('debería calcular tasa de fallo correctamente', async () => {
      const mockStats = {
        total: 20,
        pending: 0,
        succeeded: 15,
        failed: 5,
        items: Array(20).fill({ retries: 1 })
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.failureRate).toBe(25); // 5/20 = 25%
    });

    it('debería calcular promedio de reintentos', async () => {
      const mockStats = {
        total: 4,
        pending: 0,
        succeeded: 3,
        failed: 1,
        items: [
          { retries: 0 },
          { retries: 1 },
          { retries: 2 },
          { retries: 3 }
        ]
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.avgRetries).toBe(1.5); // (0+1+2+3)/4
    });

    it('debería asignar estado healthy cuando failureRate < 20%', async () => {
      const mockStats = {
        total: 10,
        pending: 1,
        succeeded: 9,
        failed: 0,
        items: Array(10).fill({ retries: 0 })
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.status).toBe('healthy');
    });

    it('debería asignar estado warning cuando failureRate >= 20% y < 50%', async () => {
      const mockStats = {
        total: 100,
        pending: 0,
        succeeded: 77,
        failed: 23,
        items: Array(100).fill({ retries: 1 })
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.status).toBe('warning');
      expect(response.body.health.failureRate).toBe(23);
    });

    it('debería asignar estado critical cuando failureRate >= 50%', async () => {
      const mockStats = {
        total: 10,
        pending: 0,
        succeeded: 4,
        failed: 6,
        items: Array(10).fill({ retries: 3 })
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.status).toBe('critical');
    });

    it('debería incluir hasta 5 items recientemente fallidos', async () => {
      const mockStats = {
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      };

      const mockFailed = Array.from({ length: 8 }, (_, i) => ({
        orderId: `order-${i}`,
        queueId: `dlq-failed-${i}`,
        failedAt: `2026-05-29T10:${i < 10 ? '0' + i : i}:00Z`,
        attempts: [
          { timestamp: `2026-05-29T10:${i < 10 ? '0' + i : i}:00Z`, error: `Error ${i}` }
        ]
      }));

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.recentFailed).toHaveLength(5);
      expect(response.body.recentFailed[0].orderId).toBe('order-0');
    });

    it('debería mapear error del último intento en items fallidos', async () => {
      const mockStats = {
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      };

      const mockFailed = [
        {
          orderId: 'order-1',
          queueId: 'dlq-failed-1',
          failedAt: '2026-05-29T10:00:00Z',
          attempts: [
            { timestamp: '2026-05-29T10:00:00Z', error: 'Timeout' },
            { timestamp: '2026-05-29T10:05:00Z', error: 'Connection refused' },
            { timestamp: '2026-05-29T10:10:00Z', error: 'Service overloaded' }
          ]
        }
      ];

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      const item = response.body.recentFailed[0];
      expect(item.lastError).toBe('Service overloaded');
      expect(item.attempts).toBe(3);
    });

    it('debería retornar failureRate 0 cuando queue está vacío', async () => {
      const mockStats = {
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.health.failureRate).toBe(0);
      expect(response.body.health.avgRetries).toBe(0);
      expect(response.body.health.status).toBe('healthy');
    });

    it('debería manejar error en getStats', async () => {
      const error = new Error('DLQ service error');
      dlq.getStats.mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(500);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('DLQ service error');
      expect(response.body.timestamp).toBeDefined();
    });

    it('debería incluir timestamp ISO en respuesta', async () => {
      const mockStats = {
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      };

      dlq.getStats.mockReturnValue(mockStats);
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dashboard/dlq-metrics')
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
