import { prisma } from '../db';
import { AuditService } from './AuditService';
import { Logger } from './Logger';

/**
 * Payment Service: processes payments via Banco Chile tokenization API
 * Enforces: engineering-security/SKILL.md (no plaintext card numbers)
 */
export class PaymentService {
  private static readonly BANCO_CHILE_API = process.env.BANCO_CHILE_API_URL;
  private static readonly BANCO_CHILE_KEY = process.env.BANCO_CHILE_API_KEY;

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
      // Call Banco Chile API with token
      const response = await this.callBancoChile();

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
      Logger.error(`Payment processing failed for order ${payload.orderId}`, error as Error);

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

      throw error;
    }
  }

  /**
   * Call Banco Chile tokenization API
   * Production: replace with actual API integration
   */
  private static async callBancoChile(): Promise<{ transactionId: string }> {
    if (!this.BANCO_CHILE_API || !this.BANCO_CHILE_KEY) {
      throw new Error('Banco Chile API not configured');
    }

    // TODO: Implement actual Banco Chile API call
    // This is a placeholder that simulates successful tokenization
    return {
      transactionId: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };
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
