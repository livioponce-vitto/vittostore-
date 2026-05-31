import request from 'supertest';
import express, { Express } from 'express';
import circuitBreakerRouter from '../circuitBreaker.routes';
import { CircuitBreakerService } from '../../services/CircuitBreakerService';
import { prisma } from '../../db';
import { Logger } from '../../services/Logger';

jest.mock('../../services/CircuitBreakerService');
jest.mock('../../db', () => ({
  prisma: {
    aPIHealthMetric: {
      findMany: jest.fn(),
    },
  },
}));
jest.mock('../../services/Logger');
jest.mock('../../middleware/governance', () => ({
  requireAccounting: (req: any, res: any, next: any) => {
    req.auditContext = { merchantId: 'mer_1', userId: 'usr_1' };
    next();
  },
}));

describe('CircuitBreaker Health Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(circuitBreakerRouter);
    jest.clearAllMocks();
  });

  describe('GET /dashboard/api-health', () => {
    it('should return 200 with circuit breaker state CLOSED', async () => {
      const mockCBState = {
        state: 'CLOSED' as const,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAttempts: 0,
      };

      (CircuitBreakerService.getState as jest.Mock).mockReturnValue(mockCBState);
      (prisma.aPIHealthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          apiEndpoint: 'BANCO_CHILE',
          timestamp: new Date(),
          responseTimeMs: 145,
          httpStatus: 200,
          success: true,
          errorCode: null,
          errorMessage: null,
          retryAttempt: 0,
          orderId: 'ORD-001',
        },
        {
          id: '2',
          apiEndpoint: 'BANCO_CHILE',
          timestamp: new Date(),
          responseTimeMs: 152,
          httpStatus: 200,
          success: true,
          errorCode: null,
          errorMessage: null,
          retryAttempt: 0,
          orderId: 'ORD-002',
        },
      ]);

      const response = await request(app).get('/dashboard/api-health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        currentState: 'CLOSED',
        consecutiveFailures: 0,
        successRateLast5min: 100,
        avgResponseTimeMs: 149,
        estimatedRecoveryTime: null,
        lastFailureAt: null,
      });
      expect(CircuitBreakerService.getState).toHaveBeenCalledWith('BancoChileAPI');
    });

    it('should return circuit breaker state OPEN with recovery time estimate', async () => {
      const openedAt = new Date(Date.now() - 30000); // 30 seconds ago
      const mockCBState = {
        state: 'OPEN' as const,
        failureCount: 3,
        successCount: 0,
        lastFailureTime: new Date(),
        openedAt,
        halfOpenAttempts: 0,
      };

      (CircuitBreakerService.getState as jest.Mock).mockReturnValue(mockCBState);
      (prisma.aPIHealthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          apiEndpoint: 'BANCO_CHILE',
          timestamp: new Date(),
          responseTimeMs: 500,
          httpStatus: 503,
          success: false,
          errorCode: 'SERVICE_UNAVAILABLE',
          errorMessage: 'Banco Chile API temporarily unavailable',
          retryAttempt: 1,
          orderId: 'ORD-003',
        },
      ]);

      const response = await request(app).get('/dashboard/api-health');

      expect(response.status).toBe(200);
      expect(response.body.currentState).toBe('OPEN');
      expect(response.body.consecutiveFailures).toBe(3);
      expect(response.body.successRateLast5min).toBe(0);
      expect(response.body.avgResponseTimeMs).toBe(500);
      expect(response.body.estimatedRecoveryTime).toBeDefined();
      expect(response.body.lastFailureAt).toBeDefined();
    });

    it('should return circuit breaker state HALF_OPEN with test attempts remaining', async () => {
      const mockCBState = {
        state: 'HALF_OPEN' as const,
        failureCount: 0,
        successCount: 1,
        lastFailureTime: null,
        openedAt: new Date(Date.now() - 65000), // Recovered after 60s cooldown
        halfOpenAttempts: 1,
      };

      (CircuitBreakerService.getState as jest.Mock).mockReturnValue(mockCBState);
      (prisma.aPIHealthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          apiEndpoint: 'BANCO_CHILE',
          timestamp: new Date(),
          responseTimeMs: 180,
          httpStatus: 200,
          success: true,
          errorCode: null,
          errorMessage: null,
          retryAttempt: 0,
          orderId: 'ORD-004',
        },
      ]);

      const response = await request(app).get('/dashboard/api-health');

      expect(response.status).toBe(200);
      expect(response.body.currentState).toBe('HALF_OPEN');
      expect(response.body.successRateLast5min).toBe(100);
      expect(response.body.avgResponseTimeMs).toBe(180);
      expect(response.body.estimatedRecoveryTime).toBeNull();
    });

    it('should return 500 on error retrieving metrics', async () => {
      (CircuitBreakerService.getState as jest.Mock).mockReturnValue({
        state: 'CLOSED' as const,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAttempts: 0,
      });
      (prisma.aPIHealthMetric.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app).get('/dashboard/api-health');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should handle empty metrics gracefully', async () => {
      const mockCBState = {
        state: 'CLOSED' as const,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAttempts: 0,
      };

      (CircuitBreakerService.getState as jest.Mock).mockReturnValue(mockCBState);
      (prisma.aPIHealthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/dashboard/api-health');

      expect(response.status).toBe(200);
      expect(response.body.successRateLast5min).toBe(0);
      expect(response.body.avgResponseTimeMs).toBe(0);
      expect(response.body.currentState).toBe('CLOSED');
    });
  });
});
