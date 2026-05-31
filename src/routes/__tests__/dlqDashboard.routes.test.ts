import request from 'supertest';
import express, { Express } from 'express';
import dlqRouter from '../dlqDashboard.routes';
import { DLQQueryService } from '../../services/DLQQueryService';
import { Logger } from '../../services/Logger';

jest.mock('../../services/DLQQueryService');
jest.mock('../../services/Logger');
jest.mock('../../middleware/governance', () => ({
  requireAccounting: (req: any, res: any, next: any) => next(),
}));

describe('DLQ Dashboard Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/dashboard', dlqRouter);
    jest.clearAllMocks();
  });

  describe('GET /dashboard/dlq/stats', () => {
    it('should return DLQ statistics', async () => {
      const mockStats = {
        total: 100,
        pending: 40,
        processing: 10,
        failed: 20,
        completed: 30,
        successRate: 30,
        byType: [
          { eventType: 'PAYMENT_FAILED', count: 60 },
          { eventType: 'FACTURA_CREATION_FAILED', count: 40 },
        ],
      };

      (DLQQueryService.getStats as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app).get('/dashboard/dlq/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
      expect(DLQQueryService.getStats).toHaveBeenCalled();
    });

    it('should return 500 on error', async () => {
      (DLQQueryService.getStats as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/dashboard/dlq/stats');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('GET /dashboard/dlq/events', () => {
    it('should list events with pagination', async () => {
      const mockResult = {
        events: [
          {
            id: '1',
            orderId: 'ORD-001',
            merchantId: 'MERCH-001',
            eventType: 'PAYMENT_FAILED',
            status: 'PENDING',
            retryCount: 0,
            createdAt: '2026-05-30T17:25:46.198Z',
            nextRetryAt: '2026-05-30T17:25:46.198Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      (DLQQueryService.listEvents as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/dashboard/dlq/events')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(DLQQueryService.listEvents).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        eventType: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should filter events by status', async () => {
      (DLQQueryService.listEvents as jest.Mock).mockResolvedValue({
        events: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await request(app)
        .get('/dashboard/dlq/events')
        .query({ page: 1, limit: 20, status: 'PENDING' });

      expect(DLQQueryService.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
        })
      );
    });

    it('should filter events by eventType', async () => {
      (DLQQueryService.listEvents as jest.Mock).mockResolvedValue({
        events: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await request(app)
        .get('/dashboard/dlq/events')
        .query({ page: 1, limit: 20, eventType: 'PAYMENT_FAILED' });

      expect(DLQQueryService.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PAYMENT_FAILED',
        })
      );
    });

    it('should filter events by date range', async () => {
      (DLQQueryService.listEvents as jest.Mock).mockResolvedValue({
        events: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const startDate = '2026-05-01T00:00:00Z';
      const endDate = '2026-05-31T23:59:59Z';

      await request(app)
        .get('/dashboard/dlq/events')
        .query({ page: 1, limit: 20, startDate, endDate });

      expect(DLQQueryService.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });

    it('should return 500 on error', async () => {
      (DLQQueryService.listEvents as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/dashboard/dlq/events');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('POST /dashboard/dlq/retry/:eventId', () => {
    it('should manually retry a single event', async () => {
      (DLQQueryService.manualRetry as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/dashboard/dlq/retry/event-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Event scheduled for retry' });
      expect(DLQQueryService.manualRetry).toHaveBeenCalledWith('event-123');
    });

    it('should return error if event not found', async () => {
      (DLQQueryService.manualRetry as jest.Mock).mockRejectedValue(
        new Error('Event not found')
      );

      const response = await request(app)
        .post('/dashboard/dlq/retry/non-existent');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Event not found');
    });

    it('should prevent retrying completed events', async () => {
      (DLQQueryService.manualRetry as jest.Mock).mockRejectedValue(
        new Error('Cannot retry completed events')
      );

      const response = await request(app)
        .post('/dashboard/dlq/retry/event-123');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /dashboard/dlq/batch-retry', () => {
    it('should bulk retry with retryAll flag', async () => {
      (DLQQueryService.retryAll as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ retryAll: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ count: 5 });
      expect(DLQQueryService.retryAll).toHaveBeenCalledWith({});
    });

    it('should bulk retry with status filter', async () => {
      (DLQQueryService.retryAll as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ status: 'FAILED_MAX_RETRIES' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ count: 3 });
      expect(DLQQueryService.retryAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED_MAX_RETRIES',
        })
      );
    });

    it('should bulk retry with maxRetries limit', async () => {
      (DLQQueryService.retryAll as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ status: 'PENDING', maxRetries: 3 });

      expect(response.status).toBe(200);
      expect(DLQQueryService.retryAll).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 3,
        })
      );
    });

    it('should return 500 on error', async () => {
      (DLQQueryService.retryAll as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/dashboard/dlq/batch-retry')
        .send({ retryAll: true });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /dashboard/dlq/failed', () => {
    it('should list permanently failed events', async () => {
      const mockResult = {
        events: [
          {
            id: '1',
            orderId: 'ORD-001',
            merchantId: 'MERCH-001',
            eventType: 'PAYMENT_FAILED',
            status: 'FAILED_MAX_RETRIES',
            retryCount: 5,
            createdAt: '2026-05-30T17:25:46.198Z',
            nextRetryAt: '2026-05-30T17:25:46.198Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      (DLQQueryService.listEvents as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/dashboard/dlq/failed')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(DLQQueryService.listEvents).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: 'FAILED_MAX_RETRIES',
      });
    });

    it('should return 500 on error', async () => {
      (DLQQueryService.listEvents as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/dashboard/dlq/failed');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /dashboard/dlq/event/:eventId', () => {
    it('should delete event successfully', async () => {
      (DLQQueryService.deleteEvent as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/dashboard/dlq/event/event-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Event deleted successfully' });
      expect(DLQQueryService.deleteEvent).toHaveBeenCalledWith('event-123');
    });

    it('should return error if event not found', async () => {
      (DLQQueryService.deleteEvent as jest.Mock).mockRejectedValue(
        new Error('Record not found')
      );

      const response = await request(app)
        .delete('/dashboard/dlq/event/non-existent');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
