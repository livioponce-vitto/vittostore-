import { DLQQueryService } from '../DLQQueryService';
import { prisma } from '../../db';
import { Logger } from '../Logger';

jest.mock('../../db', () => ({
  prisma: {
    dLQEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../Logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DLQQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listEvents', () => {
    it('should return paginated events with correct structure', async () => {
      const mockEvents = [
        {
          id: '1',
          orderId: 'ORD-001',
          merchantId: 'MERCH-001',
          eventType: 'PAYMENT_FAILED',
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date(),
          nextRetryAt: new Date(),
        },
      ];

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(1);

      const result = await DLQQueryService.listEvents({ page: 1, limit: 10 });

      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('page');
      expect(result.pagination).toHaveProperty('limit');
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('totalPages');
    });

    it('should filter events by status', async () => {
      const mockEvents: any[] = [];
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      await DLQQueryService.listEvents({ page: 1, limit: 10, status: 'PENDING' });

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });

    it('should filter events by eventType', async () => {
      const mockEvents: any[] = [];
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      await DLQQueryService.listEvents({
        page: 1,
        limit: 10,
        eventType: 'PAYMENT_FAILED'
      });

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'PAYMENT_FAILED',
          }),
        })
      );
    });

    it('should filter events by date range', async () => {
      const mockEvents: any[] = [];
      const startDate = new Date('2026-05-01');
      const endDate = new Date('2026-05-31');

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(0);

      await DLQQueryService.listEvents({
        page: 1,
        limit: 10,
        startDate,
        endDate
      });

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: startDate,
              lte: endDate,
            }),
          }),
        })
      );
    });

    it('should enforce limit on returned events', async () => {
      const mockEvents = Array(5).fill({
        id: '1',
        orderId: 'ORD-001',
        merchantId: 'MERCH-001',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date(),
        nextRetryAt: new Date(),
      });

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (prisma.dLQEvent.count as jest.Mock).mockResolvedValue(100);

      const result = await DLQQueryService.listEvents({ page: 1, limit: 5 });

      expect(result.events.length).toBeLessThanOrEqual(5);
      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });

  describe('getStats', () => {
    it('should return aggregation output with all required fields', async () => {
      (prisma.dLQEvent.count as jest.Mock)
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(40)   // pending
        .mockResolvedValueOnce(10)   // processing
        .mockResolvedValueOnce(20)   // failed
        .mockResolvedValueOnce(30);  // completed

      (prisma.dLQEvent.groupBy as jest.Mock).mockResolvedValue([
        { eventType: 'PAYMENT_FAILED', _count: { id: 60 } },
        { eventType: 'FACTURA_CREATION_FAILED', _count: { id: 40 } },
      ]);

      const result = await DLQQueryService.getStats();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('processing');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('successRate');
      expect(result).toHaveProperty('byType');
    });

    it('should calculate success rate correctly', async () => {
      (prisma.dLQEvent.count as jest.Mock)
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(40)   // pending
        .mockResolvedValueOnce(10)   // processing
        .mockResolvedValueOnce(20)   // failed
        .mockResolvedValueOnce(30);  // completed

      (prisma.dLQEvent.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await DLQQueryService.getStats();

      // successRate = completed / total * 100 = 30 / 100 * 100 = 30%
      expect(result.successRate).toBe(30);
    });
  });

  describe('manualRetry', () => {
    it('should update event nextRetryAt to now and status to PENDING', async () => {
      const eventId = '1';
      const mockEvent = {
        id: eventId,
        status: 'FAILED',
        nextRetryAt: new Date(),
      };

      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent);
      (prisma.dLQEvent.update as jest.Mock).mockResolvedValue({
        ...mockEvent,
        status: 'PENDING',
        nextRetryAt: new Date(),
      });

      await DLQQueryService.manualRetry(eventId);

      expect(prisma.dLQEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: eventId },
          data: expect.objectContaining({
            status: 'PENDING',
            nextRetryAt: expect.any(Date),
          }),
        })
      );
    });

    it('should throw error if event does not exist', async () => {
      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(DLQQueryService.manualRetry('non-existent')).rejects.toThrow(
        /Event not found/
      );
    });

    it('should prevent retrying completed events', async () => {
      const eventId = '1';
      const mockEvent = {
        id: eventId,
        status: 'SUCCEEDED',
        nextRetryAt: new Date(),
      };

      (prisma.dLQEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent);

      await expect(DLQQueryService.manualRetry(eventId)).rejects.toThrow(
        /Cannot retry completed events/
      );
    });
  });

  describe('retryAll', () => {
    it('should bulk update events matching filter status', async () => {
      (prisma.dLQEvent.updateMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await DLQQueryService.retryAll({ status: 'FAILED' });

      expect(prisma.dLQEvent.updateMany).toHaveBeenCalledWith({
        where: { status: 'FAILED' },
        data: expect.objectContaining({
          status: 'PENDING',
        }),
      });
      expect(result).toHaveProperty('count');
    });

    it('should respect retry count limit', async () => {
      (prisma.dLQEvent.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      await DLQQueryService.retryAll({
        status: 'FAILED',
        maxRetries: 5
      });

      expect(prisma.dLQEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            retryCount: { lt: 5 },
          }),
        })
      );
    });
  });

  describe('deleteEvent', () => {
    it('should delete event from database', async () => {
      const eventId = '1';

      (prisma.dLQEvent.delete as jest.Mock).mockResolvedValue({
        id: eventId,
      });

      await DLQQueryService.deleteEvent(eventId);

      expect(prisma.dLQEvent.delete).toHaveBeenCalledWith({
        where: { id: eventId },
      });
    });

    it('should throw error if event does not exist', async () => {
      const eventId = 'non-existent';

      (prisma.dLQEvent.delete as jest.Mock).mockRejectedValue(
        new Error('Record not found')
      );

      await expect(DLQQueryService.deleteEvent(eventId)).rejects.toThrow();
    });
  });
});
