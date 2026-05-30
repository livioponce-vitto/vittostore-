import { Request, Response } from 'express';
import { prisma } from '../db';
import { CircuitBreakerService } from '../services/CircuitBreakerService';

export async function getAPIHealth(req: Request, res: Response) {
  const cbState = CircuitBreakerService.getState('BancoChileAPI');

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const metrics = await prisma.aPIHealthMetric.findMany({
    where: {
      apiEndpoint: 'BANCO_CHILE',
      timestamp: { gte: fiveMinutesAgo },
    },
    orderBy: { timestamp: 'desc' },
  });

  const successCount = metrics.filter((m: any) => m.success).length;
  const failureCount = metrics.filter((m: any) => !m.success).length;
  const avgResponseTime =
    metrics.length > 0
      ? metrics.reduce((sum: number, m: any) => sum + m.responseTimeMs, 0) / metrics.length
      : 0;

  const estimatedRecoveryAt =
    cbState.state === 'OPEN' && cbState.openedAt
      ? new Date(cbState.openedAt.getTime() + 60000)
      : null;

  res.json({
    BancoChileAPI: {
      state: cbState.state,
      consecutive_failures: cbState.failureCount,
      last_failure: cbState.lastFailureTime,
      success_rate_last_5m:
        metrics.length > 0
          ? ((successCount / metrics.length) * 100).toFixed(2) + '%'
          : 'N/A',
      total_calls_last_5m: metrics.length,
      avg_response_time_ms: Math.round(avgResponseTime),
      half_open_attempts_remaining:
        cbState.state === 'HALF_OPEN'
          ? 3 - cbState.halfOpenAttempts
          : null,
      estimated_recovery_at: estimatedRecoveryAt,
    },
  });
}
