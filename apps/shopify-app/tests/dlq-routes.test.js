const request = require('supertest');
const app = require('../server');
const dlq = require('../app/services/dlq');

jest.mock('../app/services/dlq');

describe('DLQ Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /dlq/stats', () => {
    it('debería retornar estadísticas del DLQ', async () => {
      const mockStats = {
        total: 10,
        pending: 3,
        succeeded: 5,
        failed: 2,
        items: [
          {
            queueId: 'dlq-1',
            orderId: '100',
            status: 'pending',
            retries: 1,
            enqueuedAt: '2026-05-29T10:00:00Z',
            nextRetryAt: '2026-05-29T10:05:00Z'
          },
          {
            queueId: 'dlq-2',
            orderId: '101',
            status: 'succeeded',
            retries: 2,
            enqueuedAt: '2026-05-29T09:00:00Z',
            succeededAt: '2026-05-29T09:10:00Z'
          }
        ]
      };

      dlq.getStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/dlq/stats')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.stats).toEqual(mockStats);
      expect(response.body.timestamp).toBeDefined();
      expect(dlq.getStats).toHaveBeenCalled();
    });

    it('debería incluir timestamp en la respuesta', async () => {
      dlq.getStats.mockReturnValue({
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      });

      const response = await request(app)
        .get('/dlq/stats')
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('debería retornar queue vacía cuando no hay items', async () => {
      dlq.getStats.mockReturnValue({
        total: 0,
        pending: 0,
        succeeded: 0,
        failed: 0,
        items: []
      });

      const response = await request(app)
        .get('/dlq/stats')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.stats.total).toBe(0);
      expect(response.body.stats.pending).toBe(0);
      expect(response.body.stats.items).toEqual([]);
    });

    it('debería manejar error en getStats', async () => {
      const error = new Error('DLQ service error');
      dlq.getStats.mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/dlq/stats')
        .expect(500);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('DLQ service error');
      expect(response.body.timestamp).toBeDefined();
    });

    it('debería contar correctamente pending items', async () => {
      const mockStats = {
        total: 5,
        pending: 3,
        succeeded: 1,
        failed: 1,
        items: [
          { queueId: 'dlq-1', status: 'pending' },
          { queueId: 'dlq-2', status: 'pending' },
          { queueId: 'dlq-3', status: 'pending' },
          { queueId: 'dlq-4', status: 'succeeded' },
          { queueId: 'dlq-5', status: 'failed' }
        ]
      };

      dlq.getStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/dlq/stats')
        .expect(200);

      expect(response.body.stats.pending).toBe(3);
      expect(response.body.stats.succeeded).toBe(1);
      expect(response.body.stats.failed).toBe(1);
    });

    it('debería incluir items con detalles', async () => {
      const mockStats = {
        total: 1,
        pending: 1,
        succeeded: 0,
        failed: 0,
        items: [
          {
            queueId: 'dlq-test',
            orderId: 'order-123',
            status: 'pending',
            retries: 0,
            enqueuedAt: '2026-05-29T10:00:00Z',
            nextRetryAt: '2026-05-29T10:05:00Z'
          }
        ]
      };

      dlq.getStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/dlq/stats')
        .expect(200);

      const item = response.body.stats.items[0];
      expect(item.queueId).toBe('dlq-test');
      expect(item.orderId).toBe('order-123');
      expect(item.status).toBe('pending');
      expect(item.nextRetryAt).toBeDefined();
    });
  });

  describe('GET /dlq/failed', () => {
    it('debería retornar items permanentemente fallidos', async () => {
      const mockFailed = [
        {
          queueId: 'dlq-failed-1',
          orderId: '200',
          retries: 3,
          maxRetries: 3,
          enqueuedAt: '2026-05-29T09:00:00Z',
          failedAt: '2026-05-29T09:15:00Z',
          attempts: [
            { timestamp: '2026-05-29T09:00:00Z', error: 'Timeout' },
            { timestamp: '2026-05-29T09:05:00Z', error: 'Timeout' },
            { timestamp: '2026-05-29T09:10:00Z', error: 'Service unavailable' }
          ]
        },
        {
          queueId: 'dlq-failed-2',
          orderId: '201',
          retries: 3,
          maxRetries: 3,
          enqueuedAt: '2026-05-29T08:00:00Z',
          failedAt: '2026-05-29T08:15:00Z',
          attempts: [
            { timestamp: '2026-05-29T08:00:00Z', error: 'Invalid order' }
          ]
        }
      ];

      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dlq/failed')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.items[0].queueId).toBe('dlq-failed-1');
      expect(dlq.getFailedItems).toHaveBeenCalled();
    });

    it('debería soportar paginación', async () => {
      const mockFailed = Array.from({ length: 150 }, (_, i) => ({
        queueId: `dlq-failed-${i}`,
        orderId: `order-${300 + i}`,
        retries: 3
      }));

      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dlq/failed?limit=50&offset=100')
        .expect(200);

      expect(response.body.data.total).toBe(150);
      expect(response.body.data.limit).toBe(50);
      expect(response.body.data.offset).toBe(100);
      expect(response.body.data.items).toHaveLength(50);
    });

    it('debería limitar máximo a 500 items por página', async () => {
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dlq/failed?limit=1000')
        .expect(200);

      expect(response.body.data.limit).toBe(500);
    });

    it('debería retornar cola vacía cuando no hay failed items', async () => {
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dlq/failed')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data.items).toEqual([]);
    });

    it('debería manejar error en getFailedItems', async () => {
      const error = new Error('Read error');
      dlq.getFailedItems.mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/dlq/failed')
        .expect(500);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Read error');
    });

    it('debería incluir detalles completos de intentos fallidos', async () => {
      const mockFailed = [
        {
          queueId: 'dlq-failed-detail',
          orderId: 'order-500',
          retries: 3,
          maxRetries: 3,
          enqueuedAt: '2026-05-29T10:00:00Z',
          failedAt: '2026-05-29T10:15:00Z',
          attempts: [
            { timestamp: '2026-05-29T10:00:00Z', error: 'Network timeout' },
            { timestamp: '2026-05-29T10:05:00Z', error: 'Connection refused' },
            { timestamp: '2026-05-29T10:10:00Z', error: 'Service overloaded' }
          ]
        }
      ];

      dlq.getFailedItems.mockReturnValue(mockFailed);

      const response = await request(app)
        .get('/dlq/failed')
        .expect(200);

      const item = response.body.data.items[0];
      expect(item.attempts).toHaveLength(3);
      expect(item.attempts[0].error).toBe('Network timeout');
      expect(item.retries).toBe(3);
    });

    it('debería usar defaults de paginación', async () => {
      dlq.getFailedItems.mockReturnValue([]);

      const response = await request(app)
        .get('/dlq/failed')
        .expect(200);

      expect(response.body.data.limit).toBe(100);
      expect(response.body.data.offset).toBe(0);
    });
  });
});
