import { prisma } from '../db';

/**
 * Audit Service: logs all mutations to financial entities
 * Enforces: engineering-compliance/SKILL.md (AuditLog on all mutations)
 */
export class AuditService {
  static async log(payload: {
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SUBMIT' | 'SIGN' | 'VOID';
    entity: 'USER' | 'ORDER' | 'PAYMENT' | 'FACTURA' | 'BOLETA' | 'SETTLEMENT';
    entityId: string;
    merchantId?: string;
    userId?: string;
    oldValues?: any;
    newValues?: any;
    changes?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId,
        merchantId: payload.merchantId,
        userId: payload.userId,
        oldValues: payload.oldValues || null,
        newValues: payload.newValues || null,
        changes: payload.changes,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      },
    });
  }

  /**
   * Log order creation with full audit trail
   */
  static async logOrderCreated(
    orderId: string,
    merchantId: string,
    userId: string,
    orderData: any,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.log({
      action: 'CREATE',
      entity: 'ORDER',
      entityId: orderId,
      merchantId,
      userId,
      newValues: orderData,
      changes: `Order created from Shopify: ${orderData.shopifyOrderId}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Log payment processing
   */
  static async logPaymentProcessed(
    paymentId: string,
    _orderId: string,
    merchantId: string,
    status: string,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.log({
      action: 'UPDATE',
      entity: 'PAYMENT',
      entityId: paymentId,
      merchantId,
      changes: `Payment status: ${status}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Log Factura submission to SII (immutable after this)
   */
  static async logFacturaSubmitted(
    facturaId: string,
    folio: number,
    merchantId: string,
    userId: string,
    siiResponse: any,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.log({
      action: 'SUBMIT',
      entity: 'FACTURA',
      entityId: facturaId,
      merchantId,
      userId,
      newValues: { status: 'SUBMITTED', siiTrackingId: siiResponse.trackingId },
      changes: `Factura ${folio} submitted to SII. Tracking: ${siiResponse.trackingId}. NOW IMMUTABLE.`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Log Factura void operation (only allowed if not SIGNED)
   */
  static async logFacturaVoided(
    facturaId: string,
    folio: number,
    merchantId: string,
    userId: string,
    reason: string,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.log({
      action: 'VOID',
      entity: 'FACTURA',
      entityId: facturaId,
      merchantId,
      userId,
      newValues: { status: 'VOIDED', voidReason: reason },
      changes: `Factura ${folio} voided. Reason: ${reason}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Retrieve audit trail for compliance/forensics
   * 30-year retention: 7 years hot (this table), 8-30 years cold (AuditLogArchive)
   */
  static async getAuditTrail(entityId: string, entity: string): Promise<any[]> {
    return prisma.auditLog.findMany({
      where: { entityId, entity },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        entity: true,
        oldValues: true,
        newValues: true,
        changes: true,
        user: { select: { email: true, name: true } },
        createdAt: true,
      },
    });
  }
}
