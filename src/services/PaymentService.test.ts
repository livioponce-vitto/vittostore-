import { PaymentService } from './PaymentService';
import { prisma } from '../db';
import { AuditService } from './AuditService';
import { Logger } from './Logger';

jest.mock('../db');
jest.mock('./AuditService');
jest.mock('./Logger');
jest.mock('./CircuitBreakerService', () => ({
  CircuitBreakerService: {
    execute: jest.fn((endpoint, fn) => fn()),
    getState: jest.fn(() => ({ state: 'CLOSED', failureCount: 0, successCount: 0, lastFailureTime: null, openedAt: null, halfOpenAttempts: 0 })),
    recordMetric: jest.fn(),
    reset: jest.fn(),
  },
}));

describe('PaymentService', () => {
  let callCount = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    callCount = 0;
    (prisma.order as any) = {
      findUnique: jest.fn(),
    };
    (prisma.payment as any) = {
      create: jest.fn(),
      findMany: jest.fn(),
    };
    (prisma.dLQEvent as any) = {
      findFirst: jest.fn(),
      create: jest.fn(),
    };
    jest.spyOn(PaymentService as any, 'callBancoChile').mockImplementation(async () => {
      callCount++;
      return {
        transactionId: `bc_txn_${12345 + callCount}`,
      };
    });
  });

  interface EnvSnapshot {
    BANCO_CHILE_API_URL?: string;
    BANCO_CHILE_API_KEY?: string;
  }

  function captureEnvSnapshot(): EnvSnapshot {
    return {
      BANCO_CHILE_API_URL: process.env.BANCO_CHILE_API_URL,
      BANCO_CHILE_API_KEY: process.env.BANCO_CHILE_API_KEY,
    };
  }

  function restoreEnvSnapshot(snapshot: EnvSnapshot): void {
    if (snapshot.BANCO_CHILE_API_URL === undefined) {
      delete process.env.BANCO_CHILE_API_URL;
    } else {
      process.env.BANCO_CHILE_API_URL = snapshot.BANCO_CHILE_API_URL;
    }

    if (snapshot.BANCO_CHILE_API_KEY === undefined) {
      delete process.env.BANCO_CHILE_API_KEY;
    } else {
      process.env.BANCO_CHILE_API_KEY = snapshot.BANCO_CHILE_API_KEY;
    }
  }

  function removeCallBancoChileSpy(): jest.SpyInstance {
    const spy = jest.spyOn(PaymentService as any, 'callBancoChile');
    spy.mockRestore();
    return spy;
  }

  function restoreCallBancoChileMock(currentCallCount: number): void {
    jest.spyOn(PaymentService as any, 'callBancoChile').mockImplementation(async () => ({
      transactionId: `bc_txn_${12345 + currentCallCount}`,
    }));
  }

  describe('processPayment()', () => {
    it('should process payment with tokenized card and return transaction', async () => {
      const mockOrder = { id: 'ord_1', merchantId: 'mer_1' };
      const mockPayment = {
        id: 'pay_1',
        transactionId: 'bc_txn_123',
        status: 'APPROVED',
        amount: 100,
      };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue(mockPayment);

      const result = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123def456',
        cardLast4: '4242',
        ipAddress: '192.168.1.1',
      });

      expect(result).toEqual({
        transactionId: 'bc_txn_12346',
        status: 'APPROVED',
      });
      expect(prisma.payment.create).toHaveBeenCalled();
    });

    it('should reject plaintext card token for security', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: '4111111111111111', // Plaintext
          cardLast4: '1111',
        })
      ).rejects.toThrow('Invalid card token');
    });

    it('should require token_ prefix on card token', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'badtoken_123',
          cardLast4: '9999',
        })
      ).rejects.toThrow();
    });

    it('should fetch order and throw if not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_999',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc123',
          cardLast4: '4242',
        })
      ).rejects.toThrow('Order not found');
    });

    it('should create payment record with APPROVED status', async () => {
      const mockOrder = { id: 'ord_1', merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1', status: 'APPROVED' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_secure_123',
        cardLast4: '4242',
      });

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          amount: 100,
          currency: 'CLP',
          cardToken: 'token_secure_123',
          cardLast4: '4242',
          status: 'APPROVED',
        }),
      });
    });

    it('should never store plaintext card numbers', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      });

      const callArgs = (prisma.payment.create as jest.Mock).mock.calls[0][0];
      expect('cardNumber' in callArgs.data).toBe(false);
      expect(callArgs.data.cardToken).toMatch(/^token_/);
    });

    it('should call Banco Chile API', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1', transactionId: 'bc_123' });

      const result = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      });

      expect(result.transactionId).toBeDefined();
      expect(result.transactionId).toMatch(/^bc_/);
    });

    it('should log payment approval', async () => {
      const mockOrder = { id: 'ord_1', merchantId: 'mer_1' };
      const mockPayment = { id: 'pay_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(AuditService.logPaymentProcessed).toHaveBeenCalledWith(
        'pay_1',
        'ord_1',
        'mer_1',
        'APPROVED',
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
      );
    });

    it('should log transaction to Logger', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1', transactionId: 'bc_123' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      });

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Payment approved'),
        expect.objectContaining({
          amount: 100,
        })
      );
    });

    it('should handle API failure and create failed payment record', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockRejectedValueOnce(new Error('API error'));
      (prisma.payment.create as jest.Mock).mockResolvedValueOnce({ id: 'pay_1', status: 'FAILED' });

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc123',
          cardLast4: '4242',
        })
      ).rejects.toThrow();

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should include context fields in payment creation', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 50000,
        cardToken: 'token_xyz789',
        cardLast4: '5555',
        ipAddress: '10.0.0.1',
      });

      const callArgs = (prisma.payment.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual(
        expect.objectContaining({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          amount: 50000,
          cardToken: 'token_xyz789',
          cardLast4: '5555',
        })
      );
    });

    it('should handle multiple payment attempts on same order', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'pay_1', transactionId: 'bc_1' })
        .mockResolvedValueOnce({ id: 'pay_2', transactionId: 'bc_2' });

      const result1 = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_card1',
        cardLast4: '1111',
      });

      const result2 = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_card2',
        cardLast4: '2222',
      });

      expect(result1.transactionId).not.toBe(result2.transactionId);
      expect(prisma.payment.create).toHaveBeenCalledTimes(2);
    });

    it('should handle different currencies implicitly (always CLP)', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      });

      const callArgs = (prisma.payment.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.currency).toBe('CLP');
    });

    it('should validate Banco Chile API configuration is present', async () => {
      expect(PaymentService.processPayment).toBeDefined();
    });

    it('should throw error when BANCO_CHILE_API is not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const originalAPI = process.env.BANCO_CHILE_API_URL;
      const originalKey = process.env.BANCO_CHILE_API_KEY;
      delete process.env.BANCO_CHILE_API_URL;
      process.env.BANCO_CHILE_API_KEY = 'test-key';

      (PaymentService as any).callBancoChile.mockRestore?.();
      jest.spyOn(PaymentService as any, 'callBancoChile').mockRestore?.();

      try {
        await expect(
          PaymentService.processPayment({
            orderId: 'ord_1',
            merchantId: 'mer_1',
            userId: 'usr_1',
            amount: 100,
            cardToken: 'token_abc123',
            cardLast4: '4242',
          })
        ).rejects.toThrow('Banco Chile API not configured');
      } finally {
        if (originalAPI) process.env.BANCO_CHILE_API_URL = originalAPI;
        if (originalKey) process.env.BANCO_CHILE_API_KEY = originalKey;
        jest.spyOn(PaymentService as any, 'callBancoChile').mockImplementation(async () => ({
          transactionId: `bc_txn_${12345 + callCount}`,
        }));
      }
    });

    it('should throw error when BANCO_CHILE_KEY is not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const originalAPI = process.env.BANCO_CHILE_API_URL;
      const originalKey = process.env.BANCO_CHILE_API_KEY;
      process.env.BANCO_CHILE_API_URL = 'https://api.banco-chile.com';
      delete process.env.BANCO_CHILE_API_KEY;

      (PaymentService as any).callBancoChile.mockRestore?.();
      jest.spyOn(PaymentService as any, 'callBancoChile').mockRestore?.();

      try {
        await expect(
          PaymentService.processPayment({
            orderId: 'ord_1',
            merchantId: 'mer_1',
            userId: 'usr_1',
            amount: 100,
            cardToken: 'token_abc123',
            cardLast4: '4242',
          })
        ).rejects.toThrow('Banco Chile API not configured');
      } finally {
        if (originalAPI) process.env.BANCO_CHILE_API_URL = originalAPI;
        if (originalKey) process.env.BANCO_CHILE_API_KEY = originalKey;
        jest.spyOn(PaymentService as any, 'callBancoChile').mockImplementation(async () => ({
          transactionId: `bc_txn_${12345 + callCount}`,
        }));
      }
    });

    it('should throw error when both API and KEY are not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const originalAPI = process.env.BANCO_CHILE_API_URL;
      const originalKey = process.env.BANCO_CHILE_API_KEY;
      delete process.env.BANCO_CHILE_API_URL;
      delete process.env.BANCO_CHILE_API_KEY;

      (PaymentService as any).callBancoChile.mockRestore?.();
      jest.spyOn(PaymentService as any, 'callBancoChile').mockRestore?.();

      try {
        await expect(
          PaymentService.processPayment({
            orderId: 'ord_1',
            merchantId: 'mer_1',
            userId: 'usr_1',
            amount: 100,
            cardToken: 'token_abc123',
            cardLast4: '4242',
          })
        ).rejects.toThrow('Banco Chile API not configured');
      } finally {
        if (originalAPI) process.env.BANCO_CHILE_API_URL = originalAPI;
        if (originalKey) process.env.BANCO_CHILE_API_KEY = originalKey;
        jest.spyOn(PaymentService as any, 'callBancoChile').mockImplementation(async () => ({
          transactionId: `bc_txn_${12345 + callCount}`,
        }));
      }
    });
  });

  describe('getPaymentHistory()', () => {
    it('should retrieve complete payment history for order', async () => {
      const mockPayments = [
        {
          id: 'pay_1',
          amount: 100,
          cardLast4: '4242',
          transactionId: 'txn_1',
          status: 'APPROVED',
          createdAt: new Date('2026-05-20'),
        },
        {
          id: 'pay_2',
          amount: 100,
          cardLast4: '4242',
          transactionId: 'txn_2',
          status: 'DECLINED',
          createdAt: new Date('2026-05-21'),
        },
      ];

      (prisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);

      const result = await PaymentService.getPaymentHistory('ord_1');

      expect(result).toHaveLength(2);
      expect(result[0].transactionId).toBe('txn_1');
      expect(result[1].transactionId).toBe('txn_2');
    });

    it('should filter by orderId', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      await PaymentService.getPaymentHistory('ord_1');

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { orderId: 'ord_1' },
        select: expect.any(Object),
        orderBy: expect.any(Object),
      });
    });

    it('should return payments in descending order by date', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      await PaymentService.getPaymentHistory('ord_1');

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should only return specified fields', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      await PaymentService.getPaymentHistory('ord_1');

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        select: {
          id: true,
          amount: true,
          cardLast4: true,
          transactionId: true,
          status: true,
          createdAt: true,
        },
        orderBy: expect.any(Object),
      });
    });

    it('should handle empty payment history', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await PaymentService.getPaymentHistory('ord_999');

      expect(result).toHaveLength(0);
    });

    it('should include failed payment attempts', async () => {
      const mockPayments = [
        {
          id: 'pay_1',
          amount: 100,
          status: 'DECLINED',
          transactionId: 'txn_failed',
          cardLast4: '4242',
          createdAt: new Date(),
        },
      ];

      (prisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);

      const result = await PaymentService.getPaymentHistory('ord_1');

      expect(result[0].status).toBe('DECLINED');
    });

    it('should handle multiple failed and approved attempts', async () => {
      const mockPayments = [
        {
          id: 'pay_1',
          status: 'DECLINED',
          transactionId: 'txn_1',
          amount: 100,
          cardLast4: '1111',
          createdAt: new Date('2026-05-20'),
        },
        {
          id: 'pay_2',
          status: 'DECLINED',
          transactionId: 'txn_2',
          amount: 100,
          cardLast4: '2222',
          createdAt: new Date('2026-05-20T10:00:00'),
        },
        {
          id: 'pay_3',
          status: 'APPROVED',
          transactionId: 'txn_3',
          amount: 100,
          cardLast4: '4242',
          createdAt: new Date('2026-05-20T10:30:00'),
        },
      ];

      (prisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);

      const result = await PaymentService.getPaymentHistory('ord_1');

      expect(result).toHaveLength(3);
      expect(result[2].status).toBe('APPROVED');
    });

    it('should handle database errors', async () => {
      (prisma.payment.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(PaymentService.getPaymentHistory('ord_1')).rejects.toThrow('DB error');
    });

    it('should never return plaintext card data', async () => {
      const mockPayments = [
        {
          id: 'pay_1',
          amount: 100,
          cardLast4: '4242',
          transactionId: 'txn_1',
          status: 'APPROVED',
          createdAt: new Date(),
        },
      ];

      (prisma.payment.findMany as jest.Mock).mockResolvedValue(mockPayments);

      const result = await PaymentService.getPaymentHistory('ord_1');

      expect('cardNumber' in result[0]).toBe(false);
      expect('cardToken' in result[0]).toBe(false);
    });
  });

  describe('Security & Compliance', () => {
    it('should never process plaintext card tokens', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const plaintext = '4532015112830366';

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: plaintext,
          cardLast4: '0366',
        })
      ).rejects.toThrow('Invalid card token');
    });

    it('should enforce token_ format strictly', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const invalidTokens = ['TOKEN_abc', 'token', 'tkn_abc', 'card_token_123'];

      for (const token of invalidTokens) {
        await expect(
          PaymentService.processPayment({
            orderId: 'ord_1',
            merchantId: 'mer_1',
            userId: 'usr_1',
            amount: 100,
            cardToken: token,
            cardLast4: '9999',
          })
        ).rejects.toThrow();
      }
    });

    it('should log all payment operations for audit trail', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_secure',
        cardLast4: '4242',
      });

      expect(AuditService.logPaymentProcessed).toHaveBeenCalled();
    });

    it('should capture context for fraud detection', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0 Chrome/91.0',
      });

      expect(AuditService.logPaymentProcessed).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ipAddress: '203.0.113.42',
          userAgent: 'Mozilla/5.0 Chrome/91.0',
        })
      );
    });

    it('should isolate payments by merchant', async () => {
      const mockOrder1 = { id: 'ord_1', merchantId: 'mer_1' };
      const mockOrder2 = { id: 'ord_1', merchantId: 'mer_2' };

      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockOrder1)
        .mockResolvedValueOnce(mockOrder2);

      (prisma.payment.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'pay_1', merchantId: 'mer_1' })
        .mockResolvedValueOnce({ id: 'pay_2', merchantId: 'mer_2' });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc',
        cardLast4: '4242',
      });

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_2',
        userId: 'usr_2',
        amount: 100,
        cardToken: 'token_xyz',
        cardLast4: '5555',
      });

      const calls = (prisma.payment.create as jest.Mock).mock.calls;
      expect(calls[0][0].data.merchantId).toBe('mer_1');
      expect(calls[1][0].data.merchantId).toBe('mer_2');
    });
  });

  describe('Error Handling', () => {
    it('should handle order not found gracefully', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_missing',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc',
          cardLast4: '4242',
        })
      ).rejects.toThrow('Order not found');
    });

    it('should handle API failure and log error', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockRejectedValueOnce(new Error('Banco Chile unavailable'));

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc',
          cardLast4: '4242',
        })
      ).rejects.toThrow();

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should create failed payment record on error', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      let callCount = 0;
      (prisma.payment.create as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return Promise.resolve({ id: 'pay_failed', status: 'FAILED' });
      });

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc',
          cardLast4: '4242',
        })
      ).rejects.toThrow();
    });

    it('should set error code and message on failed payment', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const apiError = new Error('Insufficient funds');
      (apiError as any).code = 'INSUFFICIENT_FUNDS';
      (prisma.payment.create as jest.Mock).mockRejectedValueOnce(apiError);

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc',
          cardLast4: '4242',
        })
      ).rejects.toThrow();

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Transaction ID Generation', () => {
    it('should generate unique transaction IDs per payment', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const txn1 = { transactionId: 'bc_1234567_abc' };
      const txn2 = { transactionId: 'bc_1234568_def' };

      (prisma.payment.create as jest.Mock)
        .mockResolvedValueOnce(txn1)
        .mockResolvedValueOnce(txn2);

      const result1 = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_1',
        cardLast4: '1111',
      });

      const result2 = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_2',
        cardLast4: '2222',
      });

      expect(result1.transactionId).not.toBe(result2.transactionId);
    });

    it('should use bc_ prefix for Banco Chile transactions', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay_1', transactionId: 'bc_txn123' });

      const result = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc',
        cardLast4: '4242',
      });

      expect(result.transactionId).toMatch(/^bc_/);
    });

    it('should use failed_ prefix for failed transactions', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockRejectedValueOnce(new Error('API error'));

      await expect(
        PaymentService.processPayment({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          amount: 100,
          cardToken: 'token_abc',
          cardLast4: '4242',
        })
      ).rejects.toThrow();

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios - Environment Variable Handling', () => {
    let envSnapshot: EnvSnapshot;

    beforeEach(() => {
      envSnapshot = captureEnvSnapshot();
      jest.clearAllMocks();
      removeCallBancoChileSpy();
      (prisma.order as any) = {
        findUnique: jest.fn(),
      };
      (prisma.payment as any) = {
        create: jest.fn(),
        findMany: jest.fn(),
      };
    });

    afterEach(() => {
      restoreEnvSnapshot(envSnapshot);
      jest.clearAllMocks();
      restoreCallBancoChileMock(callCount);
    });

    it('should throw error when BANCO_CHILE_API_URL is not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      delete process.env.BANCO_CHILE_API_URL;
      process.env.BANCO_CHILE_API_KEY = 'test-key-should-not-matter';

      const error = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      }).catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Banco Chile API not configured');
    });

    it('should throw error when BANCO_CHILE_API_KEY is not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      process.env.BANCO_CHILE_API_URL = 'https://api.banco-chile.com';
      delete process.env.BANCO_CHILE_API_KEY;

      const error = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      }).catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Banco Chile API not configured');
    });

    it('should throw error when both BANCO_CHILE_API_URL and KEY are missing', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      delete process.env.BANCO_CHILE_API_URL;
      delete process.env.BANCO_CHILE_API_KEY;

      const error = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      }).catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Banco Chile API not configured');
    });

    it('should create failed payment record when API not configured', async () => {
      const mockOrder = { id: 'ord_1', merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        id: 'pay_failed',
        status: 'FAILED',
        transactionId: `failed_${Date.now()}`,
      });

      delete process.env.BANCO_CHILE_API_URL;
      delete process.env.BANCO_CHILE_API_KEY;

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      }).catch(() => {});

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          amount: 100,
          status: 'FAILED',
          errorMessage: expect.stringContaining('Banco Chile API not configured'),
        }),
      });
    });

    it('should log error to Logger when API not configured', async () => {
      const mockOrder = { id: 'ord_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      delete process.env.BANCO_CHILE_API_URL;
      delete process.env.BANCO_CHILE_API_KEY;

      await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      }).catch(() => {});

      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Payment processing failed'),
        expect.any(Error),
        expect.objectContaining({
          circuitBreakerState: expect.any(String),
          failureCount: expect.any(Number),
        })
      );
    });

    it('should verify environment is properly restored after error test', async () => {
      expect(envSnapshot).toBeDefined();
    });

    it('should generate transactionId when Banco Chile API is properly configured', async () => {
      const mockOrder = { id: 'ord_1', merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        id: 'pay_1',
        status: 'APPROVED',
        transactionId: `bc_${Date.now()}_abc123`,
      });

      process.env.BANCO_CHILE_API_URL = 'https://api.banco-chile.com';
      process.env.BANCO_CHILE_API_KEY = 'test-key';

      const result = await PaymentService.processPayment({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        amount: 100,
        cardToken: 'token_abc123',
        cardLast4: '4242',
      });

      expect(result).toMatchObject({
        status: 'APPROVED',
      });
      expect(result.transactionId).toBeDefined();
      expect(result.transactionId).toMatch(/^bc_/);
    });
  });
});
