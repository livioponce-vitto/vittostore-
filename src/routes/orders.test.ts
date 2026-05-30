import ordersRouter from './orders';
import { prisma } from '../db';
import { PaymentService } from '../services/PaymentService';
import { FacturaService } from '../services/FacturaService';
import { AuditService } from '../services/AuditService';
import { VaultService } from '../services/VaultService';
import { Logger } from '../services/Logger';
import request from 'supertest';
import express, { Express } from 'express';

jest.mock('../db');
jest.mock('../services/PaymentService');
jest.mock('../services/FacturaService');
jest.mock('../services/AuditService');
jest.mock('../services/VaultService');
jest.mock('../services/Logger');
jest.mock('../middleware/governance', () => ({
  requireAccounting: (req: any, res: any, next: any) => {
    req.auditContext = { merchantId: 'mer_1', userId: 'usr_1' };
    next();
  },
}));

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(ordersRouter);
});

describe('Orders Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /webhook/orders/paid', () => {
    it('should create order and process payment on valid webhook', async () => {
      const mockOrder = { id: 'ord_1', status: 'PAID', processedAt: new Date() };
      const mockFactura = { folio: '1', status: 'DRAFT' };
      const mockPayment = { transactionId: 'txn_1' };

      (prisma.order.create as jest.Mock).mockResolvedValue(mockOrder);
      (FacturaService.createFactura as jest.Mock).mockResolvedValue(mockFactura);
      (PaymentService.processPayment as jest.Mock).mockResolvedValue(mockPayment);
      (AuditService.logOrderCreated as jest.Mock).mockResolvedValue(undefined);
      (prisma.order.update as jest.Mock).mockResolvedValue(mockOrder);
      (VaultService.encrypt as jest.Mock).mockReturnValue('enc_email');

      const response = await request(app)
        .post('/webhook/orders/paid')
        .send({
          orderId: 'ord_1',
          email: 'customer@example.com',
          amount: 100,
          paymentToken: 'token_xyz123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.id).toBe('ord_1');
      expect(response.body.order.status).toBe('PAID');
      expect(AuditService.logOrderCreated).toHaveBeenCalled();
      expect(VaultService.encrypt).toHaveBeenCalled();
    });

    it('should reject invalid payment token format', async () => {
      const response = await request(app)
        .post('/webhook/orders/paid')
        .send({
          orderId: 'ord_1',
          email: 'customer@example.com',
          amount: 100,
          paymentToken: 'invalid_token',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('token');
    });

    it('should handle webhook processing errors', async () => {
      (prisma.order.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .post('/webhook/orders/paid')
        .send({
          orderId: 'ord_1',
          email: 'customer@example.com',
          amount: 100,
          paymentToken: 'token_xyz123',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should require valid email format', async () => {
      const response = await request(app)
        .post('/webhook/orders/paid')
        .send({
          orderId: 'ord_1',
          email: 'invalid-email',
          amount: 100,
          paymentToken: 'token_xyz123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });
  });

  describe('POST /orders/:orderId/submit-sii', () => {
    it('should submit factura to SII with accounting role', async () => {
      const mockOrder = { id: 'ord_1', factura: { id: 'fac_1' }, merchantId: 'mer_1' };
      const mockFactura = { folio: '1', status: 'SIGNED', siiTrackingId: 'sii_1' };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (FacturaService.submitToSII as jest.Mock).mockResolvedValue(mockFactura);

      const response = await request(app)
        .post('/orders/ord_1/submit-sii')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.factura.siiTrackingId).toBe('sii_1');
      expect(FacturaService.submitToSII).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should return 404 if order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/orders/ord_999/submit-sii')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Order not found');
    });

    it('should return 404 if factura not found', async () => {
      const mockOrder = { id: 'ord_1', factura: null, merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders/ord_1/submit-sii')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Factura not found');
    });

    it('should handle SII submission errors', async () => {
      const mockOrder = { id: 'ord_1', factura: { id: 'fac_1' }, merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (FacturaService.submitToSII as jest.Mock).mockRejectedValue(new Error('SII service error'));

      const response = await request(app)
        .post('/orders/ord_1/submit-sii')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /orders/:orderId/void-factura', () => {
    it('should void factura with valid reason', async () => {
      const mockOrder = { id: 'ord_1', factura: { id: 'fac_1' }, merchantId: 'mer_1' };
      const mockFactura = { folio: '1', status: 'VOIDED', voidedAt: new Date() };

      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (FacturaService.voidFactura as jest.Mock).mockResolvedValue(mockFactura);

      const response = await request(app)
        .post('/orders/ord_1/void-factura')
        .send({ reason: 'Customer request' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.factura.status).toBe('VOIDED');
      expect(FacturaService.voidFactura).toHaveBeenCalledWith(expect.any(Object), 'Customer request');
    });

    it('should reject void without reason', async () => {
      const response = await request(app)
        .post('/orders/ord_1/void-factura')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should return 404 if order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/orders/ord_999/void-factura')
        .send({ reason: 'Customer request' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Order not found');
    });

    it('should return 404 if factura not found', async () => {
      const mockOrder = { id: 'ord_1', factura: null, merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const response = await request(app)
        .post('/orders/ord_1/void-factura')
        .send({ reason: 'Customer request' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Factura not found');
    });

    it('should handle void errors', async () => {
      const mockOrder = { id: 'ord_1', factura: { id: 'fac_1' }, merchantId: 'mer_1' };
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (FacturaService.voidFactura as jest.Mock).mockRejectedValue(new Error('Cannot void signed factura'));

      const response = await request(app)
        .post('/orders/ord_1/void-factura')
        .send({ reason: 'Customer request' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /orders/:orderId/audit-trail', () => {
    it('should retrieve complete audit history', async () => {
      const mockAuditLogs = [
        { id: '1', action: 'CREATED', timestamp: new Date(), userId: 'usr_1' },
        { id: '2', action: 'PAID', timestamp: new Date(), userId: 'usr_1' },
      ];

      (AuditService.getAuditTrail as jest.Mock).mockResolvedValue(mockAuditLogs);

      const response = await request(app).get('/orders/ord_1/audit-trail');

      expect(response.status).toBe(200);
      expect(response.body.auditTrail).toHaveLength(2);
      expect(response.body.auditTrail[0].action).toBe('CREATED');
      expect(AuditService.getAuditTrail).toHaveBeenCalledWith('ord_1');
    });

    it('should handle empty audit trail', async () => {
      (AuditService.getAuditTrail as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/orders/ord_1/audit-trail');

      expect(response.status).toBe(200);
      expect(response.body.auditTrail).toHaveLength(0);
    });

    it('should handle audit service errors', async () => {
      (AuditService.getAuditTrail as jest.Mock).mockRejectedValue(new Error('Service error'));

      const response = await request(app).get('/orders/ord_1/audit-trail');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /orders/:orderId/payment-history', () => {
    it('should retrieve payment attempts for order', async () => {
      const mockPayments = [
        { transactionId: 'txn_1', status: 'APPROVED', amount: 100, createdAt: new Date() },
      ];

      (PaymentService.getPaymentHistory as jest.Mock).mockResolvedValue(mockPayments);

      const response = await request(app).get('/orders/ord_1/payment-history');

      expect(response.status).toBe(200);
      expect(response.body.payments).toHaveLength(1);
      expect(response.body.payments[0].transactionId).toBe('txn_1');
      expect(response.body.payments[0].status).toBe('APPROVED');
      expect(PaymentService.getPaymentHistory).toHaveBeenCalledWith('ord_1');
    });

    it('should handle no payment history', async () => {
      (PaymentService.getPaymentHistory as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/orders/ord_1/payment-history');

      expect(response.status).toBe(200);
      expect(response.body.payments).toHaveLength(0);
    });

    it('should handle payment service errors', async () => {
      (PaymentService.getPaymentHistory as jest.Mock).mockRejectedValue(new Error('Service error'));

      const response = await request(app).get('/orders/ord_1/payment-history');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('should aggregate payment statistics', async () => {
      const mockPayments = [
        { transactionId: 'txn_1', status: 'APPROVED', amount: 100, createdAt: new Date() },
        { transactionId: 'txn_2', status: 'APPROVED', amount: 50, createdAt: new Date() },
        { transactionId: 'txn_3', status: 'FAILED', amount: 25, createdAt: new Date() },
      ];

      (PaymentService.getPaymentHistory as jest.Mock).mockResolvedValue(mockPayments);

      const response = await request(app).get('/orders/ord_1/payment-history');

      expect(response.status).toBe(200);
      expect(response.body.payments).toHaveLength(3);
      expect(response.body.summary.totalAttempts).toBe(3);
      expect(response.body.summary.successCount).toBe(2);
      expect(response.body.summary.totalApproved).toBe(150);
    });
  });

  describe('GET /orders', () => {
    it('should list orders with default limit', async () => {
      const mockOrders = [
        { id: 'ord_1', status: 'PAID', totalAmount: 100, createdAt: new Date() },
      ];

      (prisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);

      const response = await request(app).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].id).toBe('ord_1');
      expect(response.body.orders[0].status).toBe('PAID');
    });

    it('should filter orders by status', async () => {
      const mockOrders = [
        { id: 'ord_2', status: 'PENDING', totalAmount: 50, createdAt: new Date() },
      ];

      (prisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);

      const response = await request(app)
        .get('/orders')
        .query({ status: 'PENDING' });

      expect(response.status).toBe(200);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].status).toBe('PENDING');
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        })
      );
    });

    it('should limit result count to max 100', async () => {
      const mockOrders = Array.from({ length: 50 }, (_, i) => ({
        id: `ord_${i}`,
        status: 'PAID',
        totalAmount: 100,
        createdAt: new Date(),
      }));

      (prisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);

      const response = await request(app)
        .get('/orders')
        .query({ limit: '200' });

      expect(response.status).toBe(200);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('should support pagination with offset', async () => {
      const mockOrders = [];
      (prisma.order.findMany as jest.Mock).mockResolvedValue(mockOrders);

      const response = await request(app)
        .get('/orders')
        .query({ limit: '50', offset: '100' });

      expect(response.status).toBe(200);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 100,
        })
      );
    });

    it('should handle order retrieval errors', async () => {
      (prisma.order.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/orders');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });
});
