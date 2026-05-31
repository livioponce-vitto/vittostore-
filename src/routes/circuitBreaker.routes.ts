import { Router, Request, Response } from 'express';
import { CircuitBreakerService } from '../services/CircuitBreakerService';
import { requireAccounting, WebhookRequest } from '../middleware/governance';
import { prisma } from '../db';
import { Logger } from '../services/Logger';

const router = Router();

/**
 * GET /dashboard/api-health
 * Circuit breaker state and API health metrics for Banco Chile API
 * Requires accounting role
 */
router.get(
  '/dashboard/api-health',
  requireAccounting,
  async (req: WebhookRequest, res: Response) => {
    try {
      const cbState = CircuitBreakerService.getState('BancoChileAPI');

      // Fetch metrics from last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const metrics = await prisma.aPIHealthMetric.findMany({
        where: {
          apiEndpoint: 'BANCO_CHILE',
          timestamp: { gte: fiveMinutesAgo },
        },
      });

      // Calculate success rate
      const successCount = metrics.filter((m) => m.success).length;
      const successRate =
        metrics.length > 0 ? (successCount / metrics.length) * 100 : 0;

      // Calculate average response time
      const avgResponseTime =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / metrics.length
          : 0;

      // Calculate estimated recovery time
      let estimatedRecoveryTime: string | null = null;
      if (cbState.state === 'OPEN' && cbState.openedAt) {
        const cooldownMs = 60000; // 60 second cooldown
        const timeSinceOpen = Date.now() - cbState.openedAt.getTime();
        if (timeSinceOpen < cooldownMs) {
          estimatedRecoveryTime = new Date(
            cbState.openedAt.getTime() + cooldownMs
          ).toISOString();
        }
      }

      res.json({
        currentState: cbState.state,
        consecutiveFailures: cbState.failureCount,
        successRateLast5min: Math.round(successRate * 100) / 100,
        avgResponseTimeMs: Math.round(avgResponseTime),
        estimatedRecoveryTime,
        lastFailureAt: cbState.lastFailureTime?.toISOString() || null,
      });
    } catch (error) {
      Logger.error('Failed to retrieve circuit breaker health', error as Error);
      res.status(500).json({
        error: 'Failed to retrieve circuit breaker health',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
