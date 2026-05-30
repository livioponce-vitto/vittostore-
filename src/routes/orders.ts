import { Router, Response } from 'express';
import { prisma } from '../db';
import { PaymentService } from '../services/PaymentService';
import { FacturaService } from '../services/FacturaService';
import { AuditService } from '../services/AuditService';
import { VaultService } from '../services/VaultService';
import { Logger } from '../services/Logger';
import { validateWebhookSignature, requireAccounting, WebhookRequest } from '../middleware/governance';

const router = Router();

/**
 * POST /webhook/orders/paid
 * Receives Shopify paid order webhook with HMAC validation
 * Creates order, processes payment, initiates SII factura flow
 */
router.post('/webhook/orders/paid', validateWebhookSignature, async (req: WebhookRequest, res: Response) => {
  try {
    const { order_id, total_price, customer, billing_address: _billingAddress, line_items: _lineItems } = req.body;
    const merchantId = req.body.merchant_id; // From webhook

    Logger.info(`Webhook received: order ${order_id} paid`);

    // Lookup merchant and first user for this merchant
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const user = await prisma.user.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });

    if (!user) {
      return res.status(400).json({ error: 'No user found for merchant' });
    }

    // 1. Create Order in DB
    const order = await prisma.order.create({
      data: {
        shopifyOrderId: order_id,
        merchantId,
        userId: user.id,
        customerId: customer.id,
        customerName: customer.first_name,
        customerEmail: VaultService.encrypt(customer.email),
        totalAmount: parseFloat(total_price),
        status: 'PROCESSING',
      },
    });

    // 2. Log order creation
    await AuditService.logOrderCreated(order.id, merchantId, user.id, req.body, {
      ipAddress: req.ip,
    });

    // 3. Create Factura in DRAFT
    const factura = await FacturaService.createFactura({
      orderId: order.id,
      merchantId,
      razonSocial: req.body.shop?.name || merchant.razonSocial,
      rut: merchant.rut,
      totalAmount: parseFloat(total_price),
      userId: user.id,
      ipAddress: req.ip,
    });

    // 4. Process payment (with token validation)
    const cardToken = req.body.payment_token; // Banco Chile tokenized
    if (!cardToken || !cardToken.startsWith('token_')) {
      throw new Error('Invalid payment token format');
    }

    const payment = await PaymentService.processPayment({
      orderId: order.id,
      merchantId,
      userId: 'system-webhook',
      amount: parseFloat(total_price),
      cardToken,
      cardLast4: req.body.card_last4 || 'XXXX',
      ipAddress: req.ip,
    });

    // 5. Update order status
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', processedAt: new Date() },
    });

    Logger.info(`Order ${order_id} processed: factura ${factura.folio}, payment ${payment.transactionId}`);

    return res.status(200).json({
      success: true,
      orderId: order.id,
      facturaFolio: factura.folio,
      transactionId: payment.transactionId,
    });
  } catch (error) {
    Logger.error('Webhook processing failed', error as Error, req.body);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /orders/:orderId/submit-sii
 * Submit factura to SII (makes it immutable)
 * Requires accounting role
 */
router.post('/orders/:orderId/submit-sii', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const auditContext = req.auditContext as any;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { factura: true },
    });

    if (!order || !order.factura) {
      return res.status(404).json({ error: 'Order or factura not found' });
    }

    const factura = await FacturaService.submitToSII({
      facturaId: order.factura.id,
      merchantId: order.merchantId,
      userId: auditContext.userId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return res.status(200).json({
      success: true,
      factura: {
        folio: factura.folio,
        status: factura.status,
        siiTrackingId: factura.siiTrackingId,
      },
    });
  } catch (error) {
    Logger.error(`Failed to submit factura for order ${req.params.orderId}`, error as Error);
    return res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * POST /orders/:orderId/void-factura
 * Void a factura (only if NOT SIGNED)
 * Requires accounting role
 */
router.post('/orders/:orderId/void-factura', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const auditContext = req.auditContext as any;

    if (!reason) {
      return res.status(400).json({ error: 'Void reason required' });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { factura: true },
    });

    if (!order || !order.factura) {
      return res.status(404).json({ error: 'Order or factura not found' });
    }

    const factura = await FacturaService.voidFactura({
      facturaId: order.factura.id,
      merchantId: order.merchantId,
      userId: auditContext.userId,
      reason,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return res.status(200).json({
      success: true,
      factura: {
        folio: factura.folio,
        status: factura.status,
        voidedAt: factura.voidedAt,
      },
    });
  } catch (error) {
    Logger.error(`Failed to void factura for order ${req.params.orderId}`, error as Error);
    return res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * GET /orders/:orderId/audit-trail
 * Retrieve complete audit history for compliance
 * Requires accounting role
 */
router.get('/orders/:orderId/audit-trail', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const auditLogs = await AuditService.getAuditTrail(orderId, 'ORDER');

    return res.status(200).json({
      orderId,
      auditTrail: auditLogs,
      totalEvents: auditLogs.length,
    });
  } catch (error) {
    Logger.error(`Failed to retrieve audit trail for order ${req.params.orderId}`, error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /orders/:orderId/payment-history
 * Retrieve payment attempts for order
 * Requires accounting role
 */
router.get('/orders/:orderId/payment-history', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const payments = await PaymentService.getPaymentHistory(orderId);

    return res.status(200).json({
      orderId,
      payments,
      totalAttempts: payments.length,
    });
  } catch (error) {
    Logger.error(`Failed to retrieve payment history for order ${req.params.orderId}`, error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /orders
 * List orders with optional filtering
 * Requires accounting role
 */
router.get('/orders', requireAccounting, async (req: WebhookRequest, res: Response) => {
  try {
    const { status, merchantId, limit = '50' } = req.query;
    const auditContext = req.auditContext as any;

    const orders = await prisma.order.findMany({
      where: {
        ...(status && { status: status as string }),
        merchantId: merchantId as string || auditContext.merchantId,
      },
      take: Math.min(parseInt(limit as string), 100),
      select: {
        id: true,
        shopifyOrderId: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        factura: { select: { folio: true, status: true } },
        payments: { select: { status: true, transactionId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      orders,
      total: orders.length,
    });
  } catch (error) {
    Logger.error('Failed to list orders', error as Error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
