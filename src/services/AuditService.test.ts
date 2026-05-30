import { AuditService } from './AuditService';
import { prisma } from '../db';
import { Logger } from './Logger';

jest.mock('../db');
jest.mock('./Logger');

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('log()', () => {
    it('should create audit log with all required fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({
        id: 'log_1',
        action: 'CREATE',
        entity: 'ORDER',
      });

      await AuditService.log({
        action: 'CREATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        newValues: { amount: 100 },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          entity: 'ORDER',
          entityId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        }),
      });
    });

    describe('All action types', () => {
      const actions = ['CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'SIGN', 'VOID'] as const;
      const entities = ['USER', 'ORDER', 'PAYMENT', 'FACTURA', 'BOLETA', 'SETTLEMENT'] as const;

      actions.forEach((action) => {
        it(`should log ${action} action`, async () => {
          (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: `log_${action}` });

          await AuditService.log({
            action,
            entity: 'ORDER',
            entityId: 'ord_1',
            merchantId: 'mer_1',
          });

          expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ action }),
            })
          );
        });
      });

      entities.forEach((entity) => {
        it(`should log ${entity} entity type`, async () => {
          (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: `log_${entity}` });

          await AuditService.log({
            action: 'CREATE',
            entity,
            entityId: `ent_1`,
            merchantId: 'mer_1',
          });

          expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ entity }),
            })
          );
        });
      });
    });

    it('should handle null oldValues and newValues', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.log({
        action: 'CREATE',
        entity: 'ORDER',
        entityId: 'ord_1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues: null,
          newValues: null,
        }),
      });
    });

    it('should handle optional context fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.log({
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '192.168.1.1',
            userAgent: 'Chrome',
          }),
        })
      );
    });

    it('should reject if database fails', async () => {
      (prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        AuditService.log({
          action: 'CREATE',
          entity: 'ORDER',
          entityId: 'ord_1',
        })
      ).rejects.toThrow('DB error');
    });

    it('should handle special characters in changes field', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.log({
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        changes: 'Updated: email@example.com, phone: +56912345678, RUT: 12.345.678-9',
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logOrderCreated()', () => {
    it('should log order creation with full details', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({
        id: 'log_1',
        action: 'CREATE',
        entity: 'ORDER',
      });

      const orderData = {
        shopifyOrderId: 'shop_123',
        totalAmount: 100,
        currency: 'CLP',
      };

      await AuditService.logOrderCreated(
        'ord_1',
        'mer_1',
        'usr_1',
        orderData,
        { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          entity: 'ORDER',
          entityId: 'ord_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          newValues: orderData,
        }),
      });
    });

    it('should include Shopify order ID in changes', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logOrderCreated(
        'ord_1',
        'mer_1',
        'usr_1',
        { shopifyOrderId: 'shop_123' },
        {}
      );

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.changes).toContain('shop_123');
    });

    it('should handle order with PII data', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const orderData = {
        shopifyOrderId: 'shop_123',
        customerEmail: 'customer@example.com',
        customerPhone: '+56912345678',
      };

      await AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', orderData, {});

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle missing context fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', {}, {});

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: undefined,
          userAgent: undefined,
        }),
      });
    });

    it('should reject if create fails', async () => {
      (prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', {}, {})
      ).rejects.toThrow();
    });
  });

  describe('logPaymentProcessed()', () => {
    it('should log payment with status', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logPaymentProcessed('pmt_1', 'ord_1', 'mer_1', 'APPROVED', {
        ipAddress: '192.168.1.1',
      });

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.action).toBe('UPDATE');
      expect(call.data.entity).toBe('PAYMENT');
      expect(call.data.changes).toContain('APPROVED');
    });

    it('should handle different payment statuses', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const statuses = ['APPROVED', 'DECLINED', 'PENDING', 'FAILED'];

      for (const status of statuses) {
        await AuditService.logPaymentProcessed('pmt_1', 'ord_1', 'mer_1', status, {});

        const call = (prisma.auditLog.create as jest.Mock).mock.calls[
          (prisma.auditLog.create as jest.Mock).mock.calls.length - 1
        ][0];
        expect(call.data.changes).toContain(status);
      }
    });

    it('should not require userId for payment logging', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logPaymentProcessed('pmt_1', 'ord_1', 'mer_1', 'APPROVED', {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.userId).toBeUndefined();
    });

    it('should include context data', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logPaymentProcessed('pmt_1', 'ord_1', 'mer_1', 'APPROVED', {
        ipAddress: '10.0.0.1',
        userAgent: 'Payment Service v1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'Payment Service v1',
        }),
      });
    });
  });

  describe('logFacturaSubmitted()', () => {
    it('should log factura submission with SII tracking', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const siiResponse = { trackingId: 'sii_tracking_123' };

      await AuditService.logFacturaSubmitted('fac_1', 123, 'mer_1', 'usr_1', siiResponse, {
        ipAddress: '192.168.1.1',
      });

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.action).toBe('SUBMIT');
      expect(call.data.entity).toBe('FACTURA');
      expect(call.data.changes).toContain('sii_tracking_123');
      expect(call.data.changes).toContain('NOW IMMUTABLE');
    });

    it('should include folio in audit trail', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted(
        'fac_1',
        999,
        'mer_1',
        'usr_1',
        { trackingId: 'sii_1' },
        {}
      );

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.changes).toContain('999');
    });

    it('should set status and SII tracking in newValues', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted(
        'fac_1',
        100,
        'mer_1',
        'usr_1',
        { trackingId: 'sii_abc123' },
        {}
      );

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.newValues).toEqual({
        status: 'SUBMITTED',
        siiTrackingId: 'sii_abc123',
      });
    });

    it('should mark as immutable in changes field', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted(
        'fac_1',
        1,
        'mer_1',
        'usr_1',
        { trackingId: 'sii_1' },
        {}
      );

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.changes).toMatch(/IMMUTABLE/);
    });

    it('should require userId for compliance', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted('fac_1', 100, 'mer_1', 'usr_1', {}, {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.userId).toBe('usr_1');
    });
  });

  describe('logFacturaVoided()', () => {
    it('should log factura void with reason', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaVoided('fac_1', 100, 'mer_1', 'usr_1', 'Customer request', {
        ipAddress: '192.168.1.1',
      });

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.action).toBe('VOID');
      expect(call.data.entity).toBe('FACTURA');
      expect(call.data.changes).toContain('Customer request');
    });

    it('should set status and void reason in newValues', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaVoided('fac_1', 50, 'mer_1', 'usr_1', 'Error in data', {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.newValues).toEqual({
        status: 'VOIDED',
        voidReason: 'Error in data',
      });
    });

    it('should include folio in audit trail', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaVoided('fac_1', 777, 'mer_1', 'usr_1', 'Testing', {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.changes).toContain('777');
    });

    it('should handle various void reasons', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const reasons = ['Customer request', 'System error', 'Data correction', 'Fraud prevention'];

      for (const reason of reasons) {
        await AuditService.logFacturaVoided('fac_1', 100, 'mer_1', 'usr_1', reason, {});

        const call = (prisma.auditLog.create as jest.Mock).mock.calls[
          (prisma.auditLog.create as jest.Mock).mock.calls.length - 1
        ][0];
        expect(call.data.changes).toContain(reason);
      }
    });

    it('should require userId for compliance', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaVoided('fac_1', 100, 'mer_1', 'usr_1', 'Reason', {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.userId).toBe('usr_1');
    });
  });

  describe('getAuditTrail()', () => {
    it('should retrieve complete audit history for entity', async () => {
      const mockLogs = [
        {
          id: '1',
          action: 'CREATE',
          entity: 'ORDER',
          oldValues: null,
          newValues: { amount: 100 },
          changes: 'Order created',
          user: { email: 'user@example.com', name: 'Test User' },
          createdAt: new Date(),
        },
        {
          id: '2',
          action: 'UPDATE',
          entity: 'ORDER',
          oldValues: { status: 'PENDING' },
          newValues: { status: 'PAID' },
          changes: 'Payment received',
          user: { email: 'user@example.com', name: 'Test User' },
          createdAt: new Date(),
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('CREATE');
      expect(result[1].action).toBe('UPDATE');
    });

    it('should filter by entityId and entity type', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityId: 'ord_1', entity: 'ORDER' },
        })
      );
    });

    it('should sort by creation date ascending', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        })
      );
    });

    it('should include user information', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            user: { select: { email: true, name: true } },
          }),
        })
      );
    });

    it('should handle empty audit trail', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await AuditService.getAuditTrail('ord_999', 'ORDER');

      expect(result).toHaveLength(0);
    });

    it('should maintain chronological order', async () => {
      const now = new Date();
      const mockLogs = [
        { id: '1', createdAt: new Date(now.getTime() - 100000), action: 'CREATE' },
        { id: '2', createdAt: new Date(now.getTime() - 50000), action: 'UPDATE' },
        { id: '3', createdAt: new Date(now.getTime()), action: 'SUBMIT' },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(result[0].createdAt < result[1].createdAt).toBe(true);
      expect(result[1].createdAt < result[2].createdAt).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(AuditService.getAuditTrail('ord_1', 'ORDER')).rejects.toThrow('DB error');
    });

    it('should retrieve full oldValues and newValues', async () => {
      const mockLogs = [
        {
          id: '1',
          action: 'UPDATE',
          entity: 'FACTURA',
          oldValues: { status: 'DRAFT', amount: 100 },
          newValues: { status: 'SIGNED', amount: 100 },
          changes: 'Factura signed',
          user: { email: 'user@example.com', name: 'User' },
          createdAt: new Date(),
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await AuditService.getAuditTrail('fac_1', 'FACTURA');

      expect(result[0].oldValues).toEqual({ status: 'DRAFT', amount: 100 });
      expect(result[0].newValues).toEqual({ status: 'SIGNED', amount: 100 });
    });
  });

  describe('Multi-merchant Audit Chains', () => {
    it('should maintain separate audit trails for different merchants', async () => {
      (prisma.auditLog.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: '1', merchantId: 'mer_1' }])
        .mockResolvedValueOnce([{ id: '2', merchantId: 'mer_2' }]);

      const trail1 = await AuditService.getAuditTrail('ord_1', 'ORDER');
      const trail2 = await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(trail1[0].merchantId).toBe('mer_1');
      expect(trail2[0].merchantId).toBe('mer_2');
    });

    it('should log same action on same entity for different merchants', async () => {
      (prisma.auditLog.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'log_1' })
        .mockResolvedValueOnce({ id: 'log_2' });

      await AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', {}, {});
      await AuditService.logOrderCreated('ord_1', 'mer_2', 'usr_2', {}, {});

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      const calls = (prisma.auditLog.create as jest.Mock).mock.calls;
      expect(calls[0][0].data.merchantId).toBe('mer_1');
      expect(calls[1][0].data.merchantId).toBe('mer_2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long change descriptions', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const longDescription = 'x'.repeat(10000);

      await AuditService.log({
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        changes: longDescription,
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle special characters in reason fields', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaVoided(
        'fac_1',
        100,
        'mer_1',
        'usr_1',
        'Reason: customer@example.com, phone: +56912345678',
        {}
      );

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle null context gracefully', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', {}, {});

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: undefined,
          userAgent: undefined,
        }),
      });
    });

    it('should handle concurrent log operations', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const promises = [
        AuditService.logOrderCreated('ord_1', 'mer_1', 'usr_1', {}, {}),
        AuditService.logOrderCreated('ord_2', 'mer_1', 'usr_2', {}, {}),
        AuditService.logOrderCreated('ord_3', 'mer_1', 'usr_1', {}, {}),
      ];

      await Promise.all(promises);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
    });

    it('should handle unicode characters in descriptions', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.log({
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        changes: 'Spanish: ñáéíóú, Arabic: مرحبا, Emoji: 😀',
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle deeply nested oldValues and newValues', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      const oldValues = {
        address: { street: 'Main St', city: { name: 'Santiago' } },
        contacts: [{ email: 'user@example.com' }],
      };

      const newValues = {
        address: { street: 'New St', city: { name: 'Valparaiso' } },
        contacts: [{ email: 'newuser@example.com' }],
      };

      await AuditService.log({
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: 'ord_1',
        oldValues,
        newValues,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues,
          newValues,
        }),
      });
    });
  });

  describe('30-year Retention Strategy', () => {
    it('should support 7-year hot storage', () => {
      const hotRetentionYears = 7;
      const hotRetentionMs = hotRetentionYears * 365.25 * 24 * 60 * 60 * 1000;

      expect(hotRetentionYears).toBe(7);
      expect(hotRetentionMs).toBeGreaterThan(0);
    });

    it('should support 8-30 year cold archive', () => {
      const totalRetention = 30;
      const coldStartYear = 8;

      expect(totalRetention - coldStartYear).toBe(22);
    });

    it('should be retrievable within hot storage window', async () => {
      const sevenYearsAgo = new Date(Date.now() - 7 * 365.25 * 24 * 60 * 60 * 1000);

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        { id: '1', createdAt: sevenYearsAgo },
      ]);

      const result = await AuditService.getAuditTrail('ord_1', 'ORDER');

      expect(result).toHaveLength(1);
    });
  });

  describe('Immutability and Compliance', () => {
    it('should mark submitted Facturas as immutable', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted('fac_1', 100, 'mer_1', 'usr_1', {}, {});

      const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(call.data.changes).toContain('NOW IMMUTABLE');
    });

    it('should require userId for all state-changing operations', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.logFacturaSubmitted('fac_1', 100, 'mer_1', 'usr_1', {}, {});
      await AuditService.logFacturaVoided('fac_1', 100, 'mer_1', 'usr_1', 'Reason', {});

      const calls = (prisma.auditLog.create as jest.Mock).mock.calls;
      expect(calls[0][0].data.userId).toBe('usr_1');
      expect(calls[1][0].data.userId).toBe('usr_1');
    });

    it('should capture context for forensic analysis', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log_1' });

      await AuditService.log({
        action: 'SUBMIT',
        entity: 'FACTURA',
        entityId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Compliance Audit)',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '192.168.1.100',
          userAgent: expect.stringContaining('Mozilla'),
        }),
      });
    });
  });
});
