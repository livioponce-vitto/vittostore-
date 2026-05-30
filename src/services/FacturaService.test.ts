import { FacturaService } from './FacturaService';
import { prisma } from '../db';
import { AuditService } from './AuditService';
import { Logger } from './Logger';

jest.mock('../db');
jest.mock('./AuditService');
jest.mock('./Logger');

describe('FacturaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.factura as any) = {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    };
  });

  describe('FacturaService.createFactura()', () => {
    it('should create factura with DRAFT status', async () => {
      const mockLastFactura = { folio: '5' };
      const mockFactura = {
        id: 'fac_1',
        folio: 6,
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Test Shop',
        rut: '12345678-9',
        totalAmount: 1000,
        status: 'DRAFT',
        createdAt: new Date(),
      };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(mockLastFactura);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const result = await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Test Shop',
        rut: '12345678-9',
        totalAmount: 1000,
        userId: 'usr_1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.status).toBe('DRAFT');
      expect(result.id).toBe('fac_1');
      expect(prisma.factura.create).toHaveBeenCalled();
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'FACTURA',
          entityId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      );
      expect(Logger.info).toHaveBeenCalled();
    });

    it('should assign sequential folio number starting from 1 when no prior facturas', async () => {
      const mockFactura = {
        id: 'fac_1',
        folio: 1,
        orderId: 'ord_1',
        merchantId: 'mer_1',
        status: 'DRAFT',
      };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folio: 1 }),
        })
      );
    });

    it('should increment folio from previous merchant factura', async () => {
      const mockLastFactura = { folio: '99' };
      const mockFactura = {
        id: 'fac_2',
        folio: 100,
        orderId: 'ord_1',
        merchantId: 'mer_1',
        status: 'DRAFT',
      };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(mockLastFactura);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folio: 100 }),
        })
      );
    });

    it('should store merchant and RUT information', async () => {
      const mockFactura = {
        id: 'fac_1',
        folio: 1,
        razonSocial: 'Empresa Ltda',
        rut: '76.543.210-9',
        status: 'DRAFT',
      };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Empresa Ltda',
        rut: '76.543.210-9',
        totalAmount: 5000,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            razonSocial: 'Empresa Ltda',
            rut: '76.543.210-9',
          }),
        })
      );
    });

    it('should include context (ipAddress, userAgent) in audit log', async () => {
      const mockFactura = { id: 'fac_1', folio: 1, status: 'DRAFT' };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
        ipAddress: '10.0.0.1',
        userAgent: 'Test Agent',
      });

      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'Test Agent',
        })
      );
    });

    it('should handle database creation errors', async () => {
      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        FacturaService.createFactura({
          orderId: 'ord_1',
          merchantId: 'mer_1',
          razonSocial: 'Shop',
          rut: '12345678-9',
          totalAmount: 100,
          userId: 'usr_1',
        })
      ).rejects.toThrow('DB error');
    });

    it('should handle special characters in razonSocial', async () => {
      const mockFactura = { id: 'fac_1', folio: 1, razonSocial: 'Café & Pastelería S.A.', status: 'DRAFT' };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Café & Pastelería S.A.',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ razonSocial: 'Café & Pastelería S.A.' }),
        })
      );
    });
  });

  describe('FacturaService.submitToSII()', () => {
    it('should submit DRAFT factura and mark SIGNED', async () => {
      const mockFactura = {
        id: 'fac_1',
        folio: '1',
        status: 'DRAFT',
        orderId: 'ord_1',
      };

      const mockUpdated = {
        id: 'fac_1',
        folio: '1',
        status: 'SIGNED',
        signatureStatus: 'SIGNED',
        siiTrackingId: 'sii_1234567890',
        updatedAt: new Date(),
      };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaSubmitted as jest.Mock).mockResolvedValue(undefined);

      const result = await FacturaService.submitToSII({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        ipAddress: '192.168.1.1',
      });

      expect(result.status).toBe('SIGNED');
      expect(result.siiTrackingId).toBeDefined();
      expect(prisma.factura.update).toHaveBeenCalled();
      expect(AuditService.logFacturaSubmitted).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('NOW IMMUTABLE'));
    });

    it('should generate SII tracking ID', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = {
        id: 'fac_1',
        status: 'SIGNED',
        siiTrackingId: 'sii_1234567890',
      };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaSubmitted as jest.Mock).mockResolvedValue(undefined);

      const result = await FacturaService.submitToSII({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
      });

      expect(result.siiTrackingId).toMatch(/^sii_/);
    });

    it('should reject submission if factura not found', async () => {
      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        FacturaService.submitToSII({
          facturaId: 'fac_999',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      ).rejects.toThrow('Factura not found');
    });

    it('should enforce immutability: reject submission if already SIGNED', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'SIGNED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await expect(
        FacturaService.submitToSII({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      ).rejects.toThrow('immutable');
    });

    it('should enforce immutability: reject submission if already VOIDED', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'VOIDED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await expect(
        FacturaService.submitToSII({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      ).rejects.toThrow('immutable');
    });

    it('should log factura submission with context', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = { id: 'fac_1', status: 'SIGNED', siiTrackingId: 'sii_123' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaSubmitted as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.submitToSII({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        ipAddress: '10.0.0.5',
        userAgent: 'Mobile App',
      });

      expect(AuditService.logFacturaSubmitted).toHaveBeenCalledWith(
        'fac_1',
        1,
        'mer_1',
        'usr_1',
        expect.any(Object),
        expect.objectContaining({
          ipAddress: '10.0.0.5',
          userAgent: 'Mobile App',
        })
      );
    });

    it('should handle SII submission errors gracefully', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockRejectedValue(new Error('SII service unavailable'));

      await expect(
        FacturaService.submitToSII({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      ).rejects.toThrow('SII service unavailable');

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('FacturaService.voidFactura()', () => {
    it('should void DRAFT factura', async () => {
      const mockFactura = {
        id: 'fac_1',
        folio: '1',
        status: 'DRAFT',
      };

      const mockUpdated = {
        id: 'fac_1',
        folio: '1',
        status: 'VOIDED',
        voidedAt: new Date(),
        voidReason: 'Customer request',
      };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaVoided as jest.Mock).mockResolvedValue(undefined);

      const result = await FacturaService.voidFactura({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        reason: 'Customer request',
      });

      expect(result.status).toBe('VOIDED');
      expect(result.voidedAt).toBeDefined();
      expect(result.voidReason).toBe('Customer request');
      expect(AuditService.logFacturaVoided).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalled();
    });

    it('should reject void of SIGNED factura (immutable)', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'SIGNED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await expect(
        FacturaService.voidFactura({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          reason: 'Customer request',
        })
      ).rejects.toThrow('immutable');
    });

    it('should reject void of already VOIDED factura', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'VOIDED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await expect(
        FacturaService.voidFactura({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          reason: 'Duplicate void',
        })
      ).rejects.toThrow('already voided');
    });

    it('should reject void if factura not found', async () => {
      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        FacturaService.voidFactura({
          facturaId: 'fac_999',
          merchantId: 'mer_1',
          userId: 'usr_1',
          reason: 'Not found',
        })
      ).rejects.toThrow('Factura not found');
    });

    it('should capture void reason in audit log', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = { id: 'fac_1', status: 'VOIDED', voidReason: 'Duplicate entry' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaVoided as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.voidFactura({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        reason: 'Duplicate entry',
      });

      expect(AuditService.logFacturaVoided).toHaveBeenCalledWith(
        'fac_1',
        1,
        'mer_1',
        'usr_1',
        'Duplicate entry',
        expect.any(Object)
      );
    });

    it('should include context in void audit log', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = { id: 'fac_1', status: 'VOIDED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaVoided as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.voidFactura({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        reason: 'Fraud detected',
        ipAddress: '203.0.113.5',
        userAgent: 'Admin Dashboard',
      });

      expect(AuditService.logFacturaVoided).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ipAddress: '203.0.113.5',
          userAgent: 'Admin Dashboard',
        })
      );
    });

    it('should handle database update errors', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockRejectedValue(new Error('DB constraint violation'));

      await expect(
        FacturaService.voidFactura({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          reason: 'Test reason',
        })
      ).rejects.toThrow('DB constraint violation');
    });

    it('should handle complex void reasons with special characters', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = { id: 'fac_1', status: 'VOIDED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaVoided as jest.Mock).mockResolvedValue(undefined);

      const complexReason = 'Customer requested void (Invoice #12345) - "Do not proceed" & mark as review';

      await FacturaService.voidFactura({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        reason: complexReason,
      });

      expect(prisma.factura.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            voidReason: complexReason,
          }),
        })
      );
    });
  });

  describe('FacturaService.verifyImmutability()', () => {
    it('should allow operations on DRAFT factura', async () => {
      const mockFactura = { status: 'DRAFT', folio: '1' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      const result = await FacturaService.verifyImmutability('fac_1');

      expect(result).toBe(true);
    });

    it('should block operations on SIGNED factura', async () => {
      const mockFactura = { status: 'SIGNED', folio: '1' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      const result = await FacturaService.verifyImmutability('fac_1');

      expect(result).toBe(false);
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('IMMUTABLE VIOLATION'));
    });

    it('should allow operations on VOIDED factura', async () => {
      const mockFactura = { status: 'VOIDED', folio: '1' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      const result = await FacturaService.verifyImmutability('fac_1');

      expect(result).toBe(true);
    });

    it('should reject if factura not found', async () => {
      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(FacturaService.verifyImmutability('fac_999')).rejects.toThrow('Factura not found');
    });

    it('should handle database errors', async () => {
      (prisma.factura.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(FacturaService.verifyImmutability('fac_1')).rejects.toThrow('DB error');
    });

    it('should log immutability violation with folio', async () => {
      const mockFactura = { status: 'SIGNED', folio: '12345' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await FacturaService.verifyImmutability('fac_1');

      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('12345'));
    });
  });

  describe('FacturaService.getAuditTrail()', () => {
    it('should retrieve audit trail for factura', async () => {
      const mockAuditTrail = [
        { id: '1', action: 'CREATE', timestamp: new Date() },
        { id: '2', action: 'UPDATE', timestamp: new Date() },
      ];

      (AuditService.getAuditTrail as jest.Mock).mockResolvedValue(mockAuditTrail);

      const result = await FacturaService.getAuditTrail('fac_1');

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('CREATE');
      expect(result[1].action).toBe('UPDATE');
      expect(AuditService.getAuditTrail).toHaveBeenCalledWith('fac_1', 'FACTURA');
    });

    it('should handle empty audit trail', async () => {
      (AuditService.getAuditTrail as jest.Mock).mockResolvedValue([]);

      const result = await FacturaService.getAuditTrail('fac_1');

      expect(result).toEqual([]);
    });

    it('should handle audit service errors', async () => {
      (AuditService.getAuditTrail as jest.Mock).mockRejectedValue(new Error('Audit service error'));

      await expect(FacturaService.getAuditTrail('fac_1')).rejects.toThrow('Audit service error');
    });

    it('should pass FACTURA entity type to audit service', async () => {
      (AuditService.getAuditTrail as jest.Mock).mockResolvedValue([]);

      await FacturaService.getAuditTrail('fac_1');

      expect(AuditService.getAuditTrail).toHaveBeenCalledWith('fac_1', 'FACTURA');
    });
  });

  describe('Folio Sequential Control', () => {
    it('should query only merchant-specific facturas for folio increment', async () => {
      const mockLastFactura = { folio: '50' };
      const mockFactura = { id: 'fac_1', folio: 51 };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(mockLastFactura);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_2',
        razonSocial: 'Shop',
        rut: '11111111-1',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: 'mer_2' }),
        })
      );
    });

    it('should handle concurrent factura creation from same merchant', async () => {
      const mockLastFactura = { folio: '100' };
      const mockFactura1 = { id: 'fac_1', folio: 101 };
      const mockFactura2 = { id: 'fac_2', folio: 102 };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(mockLastFactura);
      (prisma.factura.create as jest.Mock)
        .mockResolvedValueOnce(mockFactura1)
        .mockResolvedValueOnce(mockFactura2);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const result1 = await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      const result2 = await FacturaService.createFactura({
        orderId: 'ord_2',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 200,
        userId: 'usr_1',
      });

      expect(result1.folio).toBe(101);
      expect(result2.folio).toBe(102);
    });
  });

  describe('Immutability Enforcement', () => {
    it('should prevent any state changes after SIGNED', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'SIGNED' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);

      await expect(
        FacturaService.submitToSII({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
        })
      ).rejects.toThrow();

      await expect(
        FacturaService.voidFactura({
          facturaId: 'fac_1',
          merchantId: 'mer_1',
          userId: 'usr_1',
          reason: 'test',
        })
      ).rejects.toThrow();
    });

    it('should track immutability marker in audit log (NOW IMMUTABLE)', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const mockUpdated = { id: 'fac_1', status: 'SIGNED', siiTrackingId: 'sii_1' };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaSubmitted as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.submitToSII({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
      });

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('NOW IMMUTABLE'));
    });
  });

  describe('Multi-Merchant Isolation', () => {
    it('should isolate folio sequences by merchant', async () => {
      const mockMer1Last = { folio: '99' };
      const mockMer2Last = { folio: '5' };
      const mockFactura1 = { id: 'fac_1', folio: 100 };
      const mockFactura2 = { id: 'fac_2', folio: 6 };

      (prisma.factura.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockMer1Last)
        .mockResolvedValueOnce(mockMer2Last);

      (prisma.factura.create as jest.Mock)
        .mockResolvedValueOnce(mockFactura1)
        .mockResolvedValueOnce(mockFactura2);

      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const result1 = await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop1',
        rut: '11111111-1',
        totalAmount: 100,
        userId: 'usr_1',
      });

      const result2 = await FacturaService.createFactura({
        orderId: 'ord_2',
        merchantId: 'mer_2',
        razonSocial: 'Shop2',
        rut: '22222222-2',
        totalAmount: 200,
        userId: 'usr_1',
      });

      expect(result1.folio).toBe(100);
      expect(result2.folio).toBe(6);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large folio numbers', async () => {
      const mockLastFactura = { folio: '999999999' };
      const mockFactura = { id: 'fac_1', folio: 1000000000 };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(mockLastFactura);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folio: 1000000000 }),
        })
      );
    });

    it('should handle unicode characters in razonSocial', async () => {
      const mockFactura = {
        id: 'fac_1',
        folio: 1,
        razonSocial: '株式会社テスト',
        status: 'DRAFT',
      };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: '株式会社テスト',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalled();
    });

    it('should handle empty context object', async () => {
      const mockFactura = { id: 'fac_1', folio: 1, status: 'DRAFT' };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 100,
        userId: 'usr_1',
      });

      expect(AuditService.log).toHaveBeenCalled();
    });

    it('should handle zero-amount factura', async () => {
      const mockFactura = { id: 'fac_1', folio: 1, totalAmount: 0, status: 'DRAFT' };

      (prisma.factura.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.factura.create as jest.Mock).mockResolvedValue(mockFactura);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.createFactura({
        orderId: 'ord_1',
        merchantId: 'mer_1',
        razonSocial: 'Shop',
        rut: '12345678-9',
        totalAmount: 0,
        userId: 'usr_1',
      });

      expect(prisma.factura.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmount: 0 }),
        })
      );
    });

    it('should handle very long void reason', async () => {
      const mockFactura = { id: 'fac_1', folio: '1', status: 'DRAFT' };
      const longReason = 'x'.repeat(500);
      const mockUpdated = { id: 'fac_1', status: 'VOIDED', voidReason: longReason };

      (prisma.factura.findUnique as jest.Mock).mockResolvedValue(mockFactura);
      (prisma.factura.update as jest.Mock).mockResolvedValue(mockUpdated);
      (AuditService.logFacturaVoided as jest.Mock).mockResolvedValue(undefined);

      await FacturaService.voidFactura({
        facturaId: 'fac_1',
        merchantId: 'mer_1',
        userId: 'usr_1',
        reason: longReason,
      });

      expect(AuditService.logFacturaVoided).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        longReason,
        expect.any(Object)
      );
    });
  });
});
