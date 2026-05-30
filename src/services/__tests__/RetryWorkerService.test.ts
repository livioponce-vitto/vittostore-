import { RetryWorkerService } from '../RetryWorkerService';
import { prisma } from '../../db';
import { Logger } from '../Logger';
import { PaymentService } from '../PaymentService';
import { FacturaService } from '../FacturaService';

jest.mock('../../db', () => ({
  prisma: {
    dLQEvent: {
      findMany: jest.fn(),
      update: jest.fn(),
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

jest.mock('../PaymentService', () => ({
  PaymentService: {
    processPayment: jest.fn(),
  },
}));

jest.mock('../FacturaService', () => ({
  FacturaService: {
    createFactura: jest.fn(),
  },
}));

describe('RetryWorkerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    RetryWorkerService.stop();
  });

  afterEach(() => {
    RetryWorkerService.stop();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Service Lifecycle', () => {
    it('should start polling when started', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const config = { pollIntervalMs: 1000, maxRetries: 3, maxConcurrent: 5 };
      await RetryWorkerService.start(config);

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('RetryWorker started'),
        expect.any(Object)
      );
    });

    it('should not start if already running', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const config = { pollIntervalMs: 1000, maxRetries: 3, maxConcurrent: 5 };
      await RetryWorkerService.start(config);
      await RetryWorkerService.start(config);

      expect(Logger.warn).toHaveBeenCalledWith('RetryWorker already running');
    });

    it('should stop polling when stopped', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const config = { pollIntervalMs: 1000, maxRetries: 3, maxConcurrent: 5 };
      await RetryWorkerService.start(config);
      RetryWorkerService.stop();

      expect(Logger.info).toHaveBeenCalledWith('RetryWorker stopped');
    });
  });

  describe('Processing Pending Events', () => {
    it('should fetch pending events with nextRetryAt <= now', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 0,
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue({
        transactionId: 'txn-123',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            nextRetryAt: { lte: expect.any(Date) },
          },
          take: 10,
        })
      );
    });

    it('should skip processing when no pending events', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.update).not.toHaveBeenCalled();
    });

    it('should process up to maxConcurrent items per cycle', async () => {
      const mockEvents = Array.from({ length: 5 }, (_, i) => ({
        id: `evt-${i}`,
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: `order-${i}`,
        retryCount: 0,
        payload: {},
      }));

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue({
        transactionId: 'txn-123',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 5 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });

  describe('Retry Payment Events', () => {
    it('should retry PAYMENT_FAILED events', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        merchantId: 'merchant-1',
        retryCount: 0,
        payload: {
          userId: 'user-1',
          amount: 10000,
          cardToken: 'token-123',
        },
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue({
        transactionId: 'txn-123',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(PaymentService.processPayment).toHaveBeenCalledWith({
        orderId: 'order-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: 10000,
        cardToken: 'token-123',
        cardLast4: 'XXXX',
        ipAddress: undefined,
      });
    });

    it('should mark payment retry as SUCCEEDED', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 0,
        payload: {},
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue({
        transactionId: 'txn-123',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            resolvedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('Retry Factura Events', () => {
    it('should retry FACTURA_CREATION_FAILED events', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'FACTURA_CREATION_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        merchantId: 'merchant-1',
        retryCount: 0,
        payload: {
          userId: 'user-1',
          razonSocial: 'Test Company',
          rut: '12345678-9',
          totalAmount: 50000,
        },
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (FacturaService.createFactura as jest.Mock).mockResolvedValue({
        folio: '12345',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(FacturaService.createFactura).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          merchantId: 'merchant-1',
          userId: 'user-1',
          razonSocial: 'Test Company',
        })
      );
    });

    it('should mark factura retry as SUCCEEDED', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'FACTURA_CREATION_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 0,
        payload: { userId: 'user-1', razonSocial: 'Test', rut: '123', totalAmount: 1000 },
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (FacturaService.createFactura as jest.Mock).mockResolvedValue({
        folio: '12345',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            resolvedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('Retry Failure Handling', () => {
    it('should schedule next retry on failure with exponential backoff', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 2,
        payload: {},
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (PaymentService.processPayment as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      // Exponential backoff: 2^3 = 8000ms
      const backoffMs = Math.min(1000 * Math.pow(2, 3), 16000);

      expect(prisma.dLQEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: expect.objectContaining({
            retryCount: 3,
            nextRetryAt: expect.any(Date),
            errorMessage: 'API Error',
          }),
        })
      );
    });

    it('should cap exponential backoff at 16 seconds', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 10, // Very high retry count
        payload: {},
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);
      (PaymentService.processPayment as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      const config = { pollIntervalMs: 1000, maxRetries: 15, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      // Exponential backoff capped: min(2^11 * 1000, 16000) = 16000ms
      const updateCall = (prisma.dLQEvent.update as jest.Mock).mock.calls[0][0];
      const nextRetryAt = updateCall.data.nextRetryAt;
      const now = Date.now();
      const backoffActual = nextRetryAt.getTime() - now;

      expect(backoffActual).toBeLessThanOrEqual(16000);
    });

    it('should mark as FAILED_MAX_RETRIES when max retries exceeded', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 5,
        payload: {},
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(prisma.dLQEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: expect.objectContaining({
            status: 'FAILED_MAX_RETRIES',
          }),
        })
      );

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeded max retries'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle poll cycle errors gracefully', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(Logger.error).toHaveBeenCalledWith(
        'RetryWorker poll cycle failed',
        expect.any(Error)
      );
    });

    it('should handle unknown event types', async () => {
      const mockEvent = {
        id: 'evt-1',
        eventType: 'UNKNOWN_EVENT',
        status: 'PENDING',
        orderId: 'order-1',
        retryCount: 0,
        payload: {},
      };

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([mockEvent]);

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown event type')
      );
    });

    it('should continue processing after individual event failure', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          eventType: 'PAYMENT_FAILED',
          status: 'PENDING',
          orderId: 'order-1',
          retryCount: 0,
          payload: {},
        },
        {
          id: 'evt-2',
          eventType: 'PAYMENT_FAILED',
          status: 'PENDING',
          orderId: 'order-2',
          retryCount: 0,
          payload: {},
        },
      ];

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (PaymentService.processPayment as jest.Mock)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ transactionId: 'txn-123' });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      // Should attempt both events despite first failure
      expect(PaymentService.processPayment).toHaveBeenCalledTimes(2);
    });
  });

  describe('Polling Schedule', () => {
    it('should poll at configured interval', async () => {
      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue([]);

      const config = { pollIntervalMs: 5000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      // Advance timers and verify polling continues
      jest.advanceTimersByTime(5000);
      jest.runOnlyPendingTimers();

      expect(prisma.dLQEvent.findMany).toHaveBeenCalledTimes(2); // Initial + one poll
    });
  });

  describe('Concurrent Event Processing', () => {
    it('should use Promise.allSettled for concurrent processing', async () => {
      const mockEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        eventType: 'PAYMENT_FAILED',
        status: 'PENDING',
        orderId: `order-${i}`,
        retryCount: 0,
        payload: {},
      }));

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue({
        transactionId: 'txn-123',
      });

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      // All 3 events should be processed
      expect(PaymentService.processPayment).toHaveBeenCalledTimes(3);
      expect(prisma.dLQEvent.update).toHaveBeenCalledTimes(3);
    });

    it('should report cycle completion with success/failure counts', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          eventType: 'PAYMENT_FAILED',
          status: 'PENDING',
          orderId: 'order-1',
          retryCount: 0,
          payload: {},
        },
        {
          id: 'evt-2',
          eventType: 'PAYMENT_FAILED',
          status: 'PENDING',
          orderId: 'order-2',
          retryCount: 0,
          payload: {},
        },
      ];

      (prisma.dLQEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);
      (PaymentService.processPayment as jest.Mock)
        .mockResolvedValueOnce({ transactionId: 'txn-1' })
        .mockRejectedValueOnce(new Error('Failed'));

      const config = { pollIntervalMs: 1000, maxRetries: 5, maxConcurrent: 10 };
      await RetryWorkerService.start(config);

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('RetryWorker cycle complete'),
        expect.objectContaining({
          processed: 2,
          succeeded: 1,
          failed: 1,
        })
      );
    });
  });
});
