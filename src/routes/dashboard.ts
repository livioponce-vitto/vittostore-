import { Router, Response } from 'express';
import { prisma } from '../db';
import { Logger } from '../services/Logger';
import { requireAccounting, WebhookRequest } from '../middleware/governance';

const router = Router();

/**
 * GET /dashboard/stats
 * Dashboard statistics for accounting teams
 * Shows order volume, revenue, payment success rate, factura status
 */
router.get('/dashboard/stats', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const auditContext = req.auditContext as any;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Total orders
    const totalOrders = await prisma.order.count({
      where: {
        merchantId: auditContext.merchantId,
        createdAt: { gte: start, lte: end },
      },
    });

    // Revenue
    const revenue = await prisma.order.aggregate({
      where: {
        merchantId: auditContext.merchantId,
        status: 'PAID',
        createdAt: { gte: start, lte: end },
      },
      _sum: { totalAmount: true },
    });

    // Payment success rate
    const successfulPayments = await prisma.payment.count({
      where: {
        status: 'APPROVED',
        createdAt: { gte: start, lte: end },
      },
    });

    const totalPayments = await prisma.payment.count({
      where: {
        createdAt: { gte: start, lte: end },
      },
    });

    // Factura status breakdown
    const facturaStats = await prisma.factura.groupBy({
      by: ['status'],
      where: {
        merchantId: auditContext.merchantId,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });

    // DLQ pending
    const dlqPending = await prisma.dLQEvent.count({
      where: {
        status: 'PENDING',
        createdAt: { gte: start, lte: end },
      },
    });

    return res.status(200).json({
      period: { start, end },
      orders: {
        total: totalOrders,
        revenue: (revenue._sum.totalAmount?.toNumber() || 0),
        averageOrderValue: totalOrders > 0 ? ((revenue._sum.totalAmount?.toNumber() || 0) / totalOrders) : 0,
      },
      payments: {
        total: totalPayments,
        successful: successfulPayments,
        successRate: totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0,
      },
      facturas: Object.fromEntries(facturaStats.map(s => [s.status, s._count])),
      dlq: {
        pending: dlqPending,
      },
    });
  } catch (error) {
    Logger.error('Failed to retrieve dashboard stats', error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /dlq/events
 * List Dead Letter Queue events (failed order processing)
 * Requires accounting role
 */
router.get('/dlq/events', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { status = 'PENDING', limit = '50' } = req.query;

    const events = await prisma.dLQEvent.findMany({
      where: {
        ...(status && { status: status as string }),
      },
      take: Math.min(parseInt(limit as string), 100),
      select: {
        id: true,
        orderId: true,
        eventType: true,
        errorCode: true,
        errorMessage: true,
        retryCount: true,
        maxRetries: true,
        status: true,
        nextRetryAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      events,
      total: events.length,
    });
  } catch (error) {
    Logger.error('Failed to retrieve DLQ events', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /dlq/retry/:eventId
 * Manually retry a failed DLQ event
 * Requires accounting role
 */
router.post('/dlq/retry/:eventId', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const auditContext = req.auditContext as any;

    const dlqEvent = await prisma.dLQEvent.findUnique({
      where: { id: eventId },
      include: { order: true },
    });

    if (!dlqEvent) {
      return res.status(404).json({ error: 'DLQ event not found' });
    }

    if (dlqEvent.retryCount >= dlqEvent.maxRetries) {
      return res.status(409).json({
        error: `Max retries (${dlqEvent.maxRetries}) exceeded. Move to failed storage.`,
      });
    }

    // Update retry count and reset status to PENDING
    const updated = await prisma.dLQEvent.update({
      where: { id: eventId },
      data: {
        status: 'PENDING',
        retryCount: dlqEvent.retryCount + 1,
        nextRetryAt: new Date(),
      },
    });

    Logger.info(`DLQ event ${eventId} marked for retry by ${auditContext.userId}`, {
      orderId: dlqEvent.orderId,
      retryCount: updated.retryCount,
    });

    return res.status(200).json({
      success: true,
      event: updated,
    });
  } catch (error) {
    Logger.error(`Failed to retry DLQ event ${req.params.eventId}`, error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /dlq/batch-retry
 * Retry multiple failed events in batch
 * Supports queueIds array or retryAll flag
 */
router.post('/dlq/batch-retry', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { queueIds, retryAll } = req.body;
    const auditContext = req.auditContext as any;

    if (!queueIds && !retryAll) {
      return res.status(400).json({ error: 'Provide queueIds array or retryAll flag' });
    }

    let updateCount = 0;
    if (retryAll) {
      const result = await prisma.dLQEvent.updateMany({
        where: { status: 'PENDING', retryCount: { lt: 5 } },
        data: {
          retryCount: { increment: 1 },
          nextRetryAt: new Date(),
        },
      });
      updateCount = result.count;
    } else if (Array.isArray(queueIds)) {
      for (const queueId of queueIds) {
        await prisma.dLQEvent.update({
          where: { id: queueId },
          data: {
            status: 'PENDING',
            retryCount: { increment: 1 },
            nextRetryAt: new Date(),
          },
        });
        updateCount++;
      }
    }

    Logger.info(`Batch retry initiated: ${updateCount} events by ${auditContext.userId}`);

    return res.status(200).json({
      success: true,
      retryCount: updateCount,
      message: `${updateCount} events queued for retry`,
    });
  } catch (error) {
    Logger.error('Batch retry failed', error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /dlq/failed
 * List permanently failed events (moved to failed storage)
 * Shows events that exceeded max retries
 */
router.get('/dlq/failed', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const failed = await prisma.dLQEvent.findMany({
      where: { status: 'FAILED' },
      skip: parseInt(offset as string),
      take: Math.min(parseInt(limit as string), 100),
      select: {
        id: true,
        orderId: true,
        eventType: true,
        errorMessage: true,
        retryCount: true,
        maxRetries: true,
        failedAt: true,
        createdAt: true,
      },
      orderBy: { failedAt: 'desc' },
    });

    const total = await prisma.dLQEvent.count({
      where: { status: 'FAILED' },
    });

    res.status(200).json({
      events: failed,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + failed.length < total,
      },
    });
  } catch (error) {
    Logger.error('Failed to retrieve failed events', error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
