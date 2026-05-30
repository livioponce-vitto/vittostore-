import { prisma } from '../db';
import { PaymentService } from './PaymentService';
import { Logger } from './Logger';

interface RetryConfig {
  pollIntervalMs: number;
  maxRetries: number;
  maxConcurrent: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  pollIntervalMs: 5 * 60 * 1000,
  maxRetries: 5,
  maxConcurrent: 10,
};

export class RetryWorkerService {
  private static isRunning = false;
  private static pollTimeout: NodeJS.Timeout | null = null;

  static async start(config: Partial<RetryConfig> = {}): Promise<void> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    if (this.isRunning) {
      Logger.warn('RetryWorker already running');
      return;
    }

    this.isRunning = true;
    Logger.info('RetryWorker started', { pollIntervalMs: finalConfig.pollIntervalMs });

    const poll = async () => {
      try {
        await this.processPendingEvents(finalConfig);
      } catch (error) {
        Logger.error('RetryWorker poll cycle failed', error as Error);
      } finally {
        if (this.isRunning) {
          this.pollTimeout = setTimeout(poll, finalConfig.pollIntervalMs);
        }
      }
    };

    await poll();
  }

  static stop(): void {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    Logger.info('RetryWorker stopped');
  }

  private static async processPendingEvents(config: RetryConfig): Promise<void> {
    const now = new Date();

    const pendingEvents = await prisma.dLQEvent.findMany({
      where: {
        status: 'PENDING',
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: config.maxConcurrent,
    });

    if (pendingEvents.length === 0) {
      return;
    }

    Logger.info(`RetryWorker processing ${pendingEvents.length} pending events`);

    const results = await Promise.allSettled(
      pendingEvents.map((event) => this.retryEvent(event, config))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    Logger.info(`RetryWorker cycle complete`, {
      processed: pendingEvents.length,
      succeeded,
      failed,
    });
  }

  private static async retryEvent(event: any, config: RetryConfig): Promise<void> {
    const retryCount = event.retryCount || 0;

    if (retryCount >= config.maxRetries) {
      await prisma.dLQEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED_MAX_RETRIES' },
      });

      Logger.warn(`Event ${event.id} exceeded max retries`, {
        eventType: event.eventType,
        retryCount,
      });
      return;
    }

    try {
      switch (event.eventType) {
        case 'PAYMENT_FAILED':
          await this.retryPayment(event);
          break;

        case 'FACTURA_CREATION_FAILED':
          await this.retryFacturaCreation(event);
          break;

        default:
          Logger.warn(`Unknown event type for retry: ${event.eventType}`);
          return;
      }

      await prisma.dLQEvent.update({
        where: { id: event.id },
        data: {
          status: 'SUCCEEDED',
          resolvedAt: new Date(),
        },
      });

      Logger.info(`Event ${event.id} succeeded after retry`, {
        eventType: event.eventType,
        retryCount,
      });
    } catch (error) {
      const nextRetryCount = retryCount + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, nextRetryCount), 16000);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await prisma.dLQEvent.update({
        where: { id: event.id },
        data: {
          retryCount: nextRetryCount,
          nextRetryAt,
          errorMessage: (error as Error).message,
        },
      });

      Logger.error(`Event ${event.id} retry failed, scheduled for next attempt`, error as Error, {
        eventType: event.eventType,
        retryCount: nextRetryCount,
        nextRetryAt,
      });

      throw error;
    }
  }

  private static async retryPayment(event: any): Promise<void> {
    const payload = event.payload || {};

    const result = await PaymentService.processPayment({
      orderId: event.orderId,
      merchantId: event.merchantId,
      userId: payload.userId || 'system-retry',
      amount: payload.amount,
      cardToken: payload.cardToken,
      cardLast4: payload.cardLast4 || 'XXXX',
      ipAddress: payload.ipAddress,
    });

    if (!result || !result.transactionId) {
      throw new Error('Payment processing returned empty result');
    }
  }

  private static async retryFacturaCreation(event: any): Promise<void> {
    const { FacturaService } = await import('./FacturaService');
    const payload = event.payload || {};

    const result = await FacturaService.createFactura({
      orderId: event.orderId,
      merchantId: event.merchantId,
      razonSocial: payload.razonSocial,
      rut: payload.rut,
      totalAmount: payload.totalAmount,
      userId: payload.userId,
      ipAddress: payload.ipAddress,
    });

    if (!result || !result.folio) {
      throw new Error('Factura creation returned empty result');
    }
  }
}
