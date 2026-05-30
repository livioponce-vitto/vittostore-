import dashboardRouter from './dashboard';
import { prisma } from '../db';
import { Logger } from '../services/Logger';
import request from 'supertest';
import express, { Express } from 'express';

jest.mock('../db');
jest.mock('../services/Logger');
jest.mock('../middleware/governance', () => ({
  requireAccounting: (req: any, res: any, next: any) => {
    req.auditContext = { merchantId: 'mer_1', userId: 'usr_1' };
    next();
  },
}));

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(dashboardRouter);
});

describe('Dashboard Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /dashboard/stats', () => {
    it('should return dashboard stats with default 30-day range', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(10);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 1000 } });
      (prisma.payment.count as jest.Mock)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(10);
      (prisma.factura.groupBy as jest.Mock).mockResolvedValue([
        { status: 'DRAFT', _count: 3 },
        { status: 'SIGNED', _count: 7 },
      ]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/dashboard/stats');

      expect(response.status).toBe(200);
      expect(response.body.orders.total).toBe(10);
      expect(response.body.orders.revenue).toBe(1000);
      expect(response.body.orders.averageOrderValue).toBe(100);
      expect(response.body.payments.total).toBe(10);
      expect(response.body.payments.successful).toBe(9);
      expect(response.body.payments.successRate).toBe(90);
      expect(response.body.facturas).toEqual({ DRAFT: 3, SIGNED: 7 });
      expect(response.body.dlq.pending).toBe(0);
    });

    it('should filter stats by custom date range', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(5);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 500 } });
      (prisma.payment.count as jest.Mock)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5);
      (prisma.factura.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const startDate = '2026-05-01';
      const endDate = '2026-05-29';
      const response = await request(app)
        .get('/dashboard/stats')
        .query({ startDate, endDate });

      expect(response.status).toBe(200);
      expect(response.body.orders.total).toBe(5);
      expect(response.body.period.start).toBeDefined();
    });

    it('should calculate payment success rate correctly', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(100);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 50000 } });
      (prisma.payment.count as jest.Mock)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(100);
      (prisma.factura.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/dashboard/stats');

      expect(response.status).toBe(200);
      expect(response.body.payments.successRate).toBe(80);
    });

    it('should handle zero orders case', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(0);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: null } });
      (prisma.payment.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      (prisma.factura.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/dashboard/stats');

      expect(response.status).toBe(200);
      expect(response.body.orders.total).toBe(0);
      expect(response.body.orders.averageOrderValue).toBe(0);
    });

    it('should handle zero payments case', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(10);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 1000 } });
      (prisma.payment.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      (prisma.factura.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/dashboard/stats');

      expect(response.status).toBe(200);
      expect(response.body.payments.successRate).toBe(0);
    });

    it('should handle stats retrieval error', async () => {
      (prisma.order.count as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/dashboard/stats');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('GET /dlq/events', () => {
    it('should list pending DLQ events by default', async () => {
      const mockEvents = [
        {
          id: 'dlq_1',
          orderId: 'ord_1',
          eventType: 'PAYMENT_FAILED',
          errorCode: 'INSUFFICIENT_FUNDS',
          errorMessage: 'Insufficient funds',
          retryCount: 2,
          maxRetries: 5,
          status: 'PENDING',
          nextRetryAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

      const response = await request(app).get('/dlq/events');

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.events[0].id).toBe('dlq_1');
    });

    it('should filter DLQ events by status', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/dlq/events')
        .query({ status: 'FAILED' });

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(0);
    });

    it('should respect max limit of 100', async () => {
      const events = Array.from({ length: 50 }, (_, i) => ({
        id: `dlq_${i}`,
        orderId: `ord_${i}`,
        eventType: 'TEST',
        errorCode: 'TEST',
        errorMessage: 'test',
        retryCount: 0,
        maxRetries: 5,
        status: 'PENDING',
        nextRetryAt: new Date(),
        createdAt: new Date(),
      }));

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(events);

      const response = await request(app)
        .get('/dlq/events')
        .query({ limit: '500' });

      expect(response.status).toBe(200);
      expect(response.body.events.length).toBeLessThanOrEqual(100);
    });

    it('should handle empty DLQ events', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/dlq/events');

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('should handle DLQ events retrieval error', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/dlq/events');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /dlq/retry/:eventId', () => {
    it('should retry failed DLQ event successfully', async () => {
      const mockEvent = {
        id: 'dlq_1',
        orderId: 'ord_1',
        retryCount: 2,
        maxRetries: 5,
        order: { id: 'ord_1' },
      };

      const updated = { ...mockEvent, retryCount: 3, status: 'PENDING' };

      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent);
      (prisma.dLQEvent.update as jest.Mock).mockResolvedValue(updated);

      const response = await request(app).post('/dlq/retry/dlq_1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.event.retryCount).toBe(3);
    });

    it('should return 404 if event not found', async () => {
      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app).post('/dlq/retry/dlq_999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('DLQ event not found');
    });

    it('should reject retry if max retries exceeded', async () => {
      const mockEvent = {
        id: 'dlq_1',
        orderId: 'ord_1',
        retryCount: 5,
        maxRetries: 5,
        order: { id: 'ord_1' },
      };

      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent);

      const response = await request(app).post('/dlq/retry/dlq_1');

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Max retries');
    });

    it('should log retry action', async () => {
      const mockEvent = {
        id: 'dlq_1',
        orderId: 'ord_1',
        retryCount: 1,
        maxRetries: 5,
        order: { id: 'ord_1' },
      };

      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent);
      (prisma.dLQEvent.update as jest.Mock).mockResolvedValue({ ...mockEvent, retryCount: 2 });

      await request(app).post('/dlq/retry/dlq_1');

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('DLQ event'), expect.any(Object));
    });
  });

  describe('POST /dlq/batch-retry', () => {
    it('should retry all pending events with retryAll flag', async () => {
      (prisma.dLQEvent.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

      const response = await request(app)
        .post('/dlq/batch-retry')
        .send({ retryAll: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.retryCount).toBe(5);
    });

    it('should retry specific events with queueIds array', async () => {
      (prisma.dLQEvent.update as jest.Mock)
        .mockResolvedValueOnce({ id: 'dlq_1' })
        .mockResolvedValueOnce({ id: 'dlq_2' });

      const response = await request(app)
        .post('/dlq/batch-retry')
        .send({ queueIds: ['dlq_1', 'dlq_2'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.retryCount).toBe(2);
    });

    it('should reject batch retry without queueIds or retryAll', async () => {
      const response = await request(app)
        .post('/dlq/batch-retry')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('queueIds');
    });

    it('should handle batch retry errors', async () => {
      (prisma.dLQEvent.updateMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .post('/dlq/batch-retry')
        .send({ retryAll: true });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('should log batch retry action', async () => {
      (prisma.dLQEvent.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      await request(app)
        .post('/dlq/batch-retry')
        .send({ retryAll: true });

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Batch retry initiated'), undefined);
    });
  });

  describe('GET /dlq/failed', () => {
    it('should list permanently failed events with pagination', async () => {
      const mockFailed = [
        {
          id: 'dlq_1',
          orderId: 'ord_1',
          eventType: 'PAYMENT_FAILED',
          errorMessage: 'Card declined',
          retryCount: 5,
          maxRetries: 5,
          failedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockFailed);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app).get('/dlq/failed');

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should respect pagination limits', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(200);

      const response = await request(app)
        .get('/dlq/failed')
        .query({ limit: '200', offset: '10' });

      expect(response.status).toBe(200);
      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('should calculate hasMore flag correctly', async () => {
      const mockEvents = Array.from({ length: 30 }, (_, i) => ({
        id: `dlq_${i}`,
        orderId: `ord_${i}`,
        eventType: 'TEST',
        errorMessage: 'test',
        retryCount: 5,
        maxRetries: 5,
        failedAt: new Date(),
        createdAt: new Date(),
      }));

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(100);

      const response = await request(app)
        .get('/dlq/failed')
        .query({ limit: '30', offset: '50' });

      expect(response.status).toBe(200);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should handle empty failed events', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/dlq/failed');

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle pagination beyond total count', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(10);

      const response = await request(app)
        .get('/dlq/failed')
        .query({ limit: '50', offset: '50' });

      expect(response.status).toBe(200);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should handle failed events retrieval error', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/dlq/failed');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});
