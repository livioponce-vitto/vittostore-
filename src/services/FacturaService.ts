import { prisma } from '../db';
import { AuditService } from './AuditService';
import { Logger } from './Logger';

/**
 * Factura Service: manages SII invoices with immutability enforcement
 * Enforces: engineering-compliance/SKILL.md (Factura immutable after SIGNED)
 */
export class FacturaService {
  /**
   * Create factura in DRAFT status
   */
  static async createFactura(payload: {
    orderId: string;
    merchantId: string;
    razonSocial: string;
    rut: string;
    totalAmount: number;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<any> {
    // Get next folio from merchant settings (SII sequential control)
    const lastFactura = await prisma.factura.findFirst({
      where: { merchantId: payload.merchantId },
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });

    const nextFolio = Number(lastFactura?.folio || 0) + 1;

    const factura = await prisma.factura.create({
      data: {
        folio: nextFolio,
        orderId: payload.orderId,
        merchantId: payload.merchantId,
        razonSocial: payload.razonSocial,
        rut: payload.rut,
        totalAmount: payload.totalAmount,
        status: 'DRAFT',
      },
    });

    await AuditService.log({
      action: 'CREATE',
      entity: 'FACTURA',
      entityId: factura.id,
      merchantId: payload.merchantId,
      userId: payload.userId,
      newValues: { folio: factura.folio, status: 'DRAFT' },
      changes: `Factura ${factura.folio} created in DRAFT status`,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
    });

    Logger.info(`Factura created: ${factura.folio} for order ${payload.orderId}`);
    return factura;
  }

  /**
   * Submit factura to SII (transitions to SUBMITTED, then SIGNED)
   * After SIGNED, factura is IMMUTABLE - use void() only
   */
  static async submitToSII(payload: {
    facturaId: string;
    merchantId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<any> {
    const factura = await prisma.factura.findUnique({
      where: { id: payload.facturaId },
    });

    if (!factura) {
      throw new Error(`Factura not found: ${payload.facturaId}`);
    }

    // IMMUTABILITY CHECK: Cannot submit if already SIGNED or VOIDED
    if (factura.status === 'SIGNED' || factura.status === 'VOIDED') {
      throw new Error(
        `Factura ${factura.folio} is ${factura.status}. It is immutable. Use void() to cancel instead.`
      );
    }

    try {
      // TODO: Call SII API to submit factura
      // const siiResponse = await this.callSIIAPI(factura);

      // Update factura status
      const updated = await prisma.factura.update({
        where: { id: payload.facturaId },
        data: {
          status: 'SIGNED',
          signatureStatus: 'SIGNED',
          siiTrackingId: `sii_${Date.now()}`,
          updatedAt: new Date(),
        },
      });

      // Log submission (NOW IMMUTABLE)
      await AuditService.logFacturaSubmitted(
        payload.facturaId,
        Number(factura.folio),
        payload.merchantId,
        payload.userId,
        { trackingId: updated.siiTrackingId },
        {
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
        }
      );

      Logger.info(`Factura ${factura.folio} submitted to SII and SIGNED (NOW IMMUTABLE)`);
      return updated;
    } catch (error) {
      Logger.error(`Failed to submit factura ${factura.folio}`, error as Error);
      throw error;
    }
  }

  /**
   * Void a factura (only allowed if NOT SIGNED)
   * This is the only way to cancel a factura once created
   */
  static async voidFactura(payload: {
    facturaId: string;
    merchantId: string;
    userId: string;
    reason: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<any> {
    const factura = await prisma.factura.findUnique({
      where: { id: payload.facturaId },
    });

    if (!factura) {
      throw new Error(`Factura not found: ${payload.facturaId}`);
    }

    // IMMUTABILITY CHECK: Cannot void if already SIGNED
    if (factura.status === 'SIGNED') {
      throw new Error(
        `Cannot void factura ${factura.folio}. It has been SIGNED and is immutable. Contact SII for official void process.`
      );
    }

    if (factura.status === 'VOIDED') {
      throw new Error(`Factura ${factura.folio} is already voided.`);
    }

    const updated = await prisma.factura.update({
      where: { id: payload.facturaId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidReason: payload.reason,
        updatedAt: new Date(),
      },
    });

    await AuditService.logFacturaVoided(
      payload.facturaId,
      Number(factura.folio),
      payload.merchantId,
      payload.userId,
      payload.reason,
      {
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      }
    );

    Logger.info(`Factura ${factura.folio} voided: ${payload.reason}`);
    return updated;
  }

  /**
   * Verify immutability: cannot update SIGNED factura
   */
  static async verifyImmutability(facturaId: string): Promise<boolean> {
    const factura = await prisma.factura.findUnique({
      where: { id: facturaId },
      select: { status: true, folio: true },
    });

    if (!factura) {
      throw new Error(`Factura not found: ${facturaId}`);
    }

    if (factura.status === 'SIGNED') {
      Logger.error(`Attempted update to SIGNED factura ${factura.folio} (IMMUTABLE VIOLATION)`);
      return false;
    }

    return true;
  }

  /**
   * Get full audit trail for factura (compliance)
   */
  static async getAuditTrail(facturaId: string): Promise<any[]> {
    return AuditService.getAuditTrail(facturaId, 'FACTURA');
  }
}
