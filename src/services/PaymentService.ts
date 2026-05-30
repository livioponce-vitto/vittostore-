import { prisma } from '../db';
import { AuditService } from './AuditService';
import { Logger } from './Logger';
import { CircuitBreakerService } from './CircuitBreakerService';

/**
 * Payment Service: processes payments via Banco Chile tokenization API
 * Enforces: engineering-security/SKILL.md (no plaintext card numbers)
 */
export class PaymentService {
  private static getApiUrl(): string | undefined {
    return process.env.BANCO_CHILE_API_URL;
  }

  private static getApiKey(): string | undefined {
    return process.env.BANCO_CHILE_API_KEY;
  }

  /**
   * Process payment with Banco Chile tokenization
   * Never accept plaintext card numbers
   */
  static async processPayment(payload: {
    orderId: string;
    merchantId: string;
    userId: string;
    amount: number;
    cardToken: string; // Banco Chile token only (token_*)
    cardLast4: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ transactionId: string; status: string }> {
    // CRITICAL: Validate token format (prevents plaintext cards)
    if (!payload.cardToken.startsWith('token_')) {
      throw new Error('Invalid card token. Plaintext cards are not accepted. Use Banco Chile tokenization.');
    }

    // Fetch order for context
    const order = await prisma.order.findUnique({
      where: { id: payload.orderId },
    });

    if (!order) {
      throw new Error(`Order not found: ${payload.orderId}`);
    }

    try {
      // Call Banco Chile API with circuit breaker protection
      const response = await CircuitBreakerService.execute(
        'BancoChileAPI',
        () => this.callBancoChile(),
        {
          failureThreshold: 3,
          successThreshold: 2,
          failureWindow: 30000,
          cooldownTime: 60000,
          halfOpenRequests: 3,
          timeout: 5000,
        }
      );

      // Create payment record with token (never plaintext)
      const payment = await prisma.payment.create({
        data: {
          orderId: payload.orderId,
          merchantId: payload.merchantId,
          amount: payload.amount,
          currency: 'CLP',
          cardToken: payload.cardToken, // Safe: token_*
          cardLast4: payload.cardLast4,
          transactionId: response.transactionId,
          status: 'APPROVED',
          processedAt: new Date(),
        },
      });

      // Log payment approval
      await AuditService.logPaymentProcessed(
        payment.id,
        payload.orderId,
        payload.merchantId,
        'APPROVED',
        {
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
        }
      );

      Logger.info(`Payment approved for order ${payload.orderId}`, {
        transactionId: response.transactionId,
        amount: payload.amount,
      });

      return {
        transactionId: response.transactionId,
        status: 'APPROVED',
      };
    } catch (error) {
      const cbState = CircuitBreakerService.getState('BancoChileAPI');

      Logger.error(`Payment processing failed for order ${payload.orderId}`, error as Error, {
        circuitBreakerState: cbState.state,
        failureCount: cbState.failureCount,
      });

      // Create failed payment record
      await prisma.payment.create({
        data: {
          orderId: payload.orderId,
          merchantId: payload.merchantId,
          amount: payload.amount,
          currency: 'CLP',
          cardToken: payload.cardToken,
          cardLast4: payload.cardLast4,
          transactionId: `failed_${Date.now()}`,
          status: 'FAILED',
          errorCode: (error as any).code || 'UNKNOWN_ERROR',
          errorMessage: (error as Error).message,
        },
      });

      // Calculate exponential backoff for retry scheduling
      const existingDLQ = await prisma.dLQEvent.findFirst({
        where: {
          orderId: payload.orderId,
          eventType: 'PAYMENT_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });

      const retryCount = (existingDLQ?.retryCount || 0) + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 16000);

      // Create DLQEvent with circuit breaker state and next retry time
      await prisma.dLQEvent.create({
        data: {
          orderId: payload.orderId,
          merchantId: payload.merchantId,
          eventType: 'PAYMENT_FAILED',
          errorCode: (error as any).code || 'UNKNOWN_ERROR',
          errorMessage: (error as Error).message,
          circuitBreakerState: cbState.state,
          retryCount,
          status: 'PENDING',
          nextRetryAt: new Date(Date.now() + backoffMs),
        },
      });

      throw error;
    }
  }

  /**
   * Call Banco Chile tokenization API
   * Production: replace with actual API integration
   */
  private static async callBancoChile(): Promise<{ transactionId: string }> {
    const startTime = Date.now();

    if (!this.getApiUrl() || !this.getApiKey()) {
      CircuitBreakerService.recordMetric('BancoChileAPI', false, 0, 'CONFIG_ERROR');
      throw new Error('Banco Chile API not configured');
    }

    try {
      // TODO: Implement actual Banco Chile API call
      // This is a placeholder that simulates successful tokenization
      const result = {
        transactionId: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      };

      const responseTime = Date.now() - startTime;
      CircuitBreakerService.recordMetric('BancoChileAPI', true, responseTime);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      CircuitBreakerService.recordMetric(
        'BancoChileAPI',
        false,
        responseTime,
        (error as any).code || 'API_ERROR'
      );
      throw error;
    }
  }

  /**
   * Retrieve payment history for order
   */
  static async getPaymentHistory(orderId: string): Promise<any[]> {
    return prisma.payment.findMany({
      where: { orderId },
      select: {
        id: true,
        amount: true,
        cardLast4: true,
        transactionId: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
