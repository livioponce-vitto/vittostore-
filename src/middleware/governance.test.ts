import crypto from 'crypto';
import { validateWebhookSignature, requireAccounting, requireFacturaNotSigned, WebhookRequest } from './governance';

jest.mock('crypto');

describe('governance middleware', () => {
  let req: Partial<WebhookRequest>;
  let res: any;
  let next: jest.Mock<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: {},
      body: {},
      user: undefined,
      ip: '192.168.1.1',
      get: jest.fn(() => 'Mozilla/5.0') as any,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    process.env.WEBHOOK_SECRET = 'test-secret-key';
  });

  describe('validateWebhookSignature', () => {
    it('should allow request with valid signature', () => {
      (req as any).headers = {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
      };
      (req as any).body = { order: 'test' };

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('valid-sig'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(true);

      validateWebhookSignature(req as any, res, next);

      expect((req as any).webhookSignatureValid).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should reject request with invalid signature', () => {
      (req as any).headers = {
        'x-webhook-signature': 'invalid-sig',
        'x-webhook-timestamp': '1234567890',
      };
      (req as any).body = { order: 'test' };

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('valid-sig'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(false);

      validateWebhookSignature(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
    });

    it('should reject request with missing signature header', () => {
      (req as any).headers = { 'x-webhook-timestamp': '1234567890' };

      validateWebhookSignature(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing signature headers' });
    });

    it('should reject request with missing timestamp header', () => {
      (req as any).headers = { 'x-webhook-signature': 'sig' };

      validateWebhookSignature(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with missing webhook secret', () => {
      delete process.env.WEBHOOK_SECRET;
      (req as any).headers = {
        'x-webhook-signature': 'sig',
        'x-webhook-timestamp': '1234567890',
      };

      validateWebhookSignature(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle string body type', () => {
      (req as any).headers = {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
      };
      (req as any).body = '{"order":"test"}';

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('valid-sig'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(true);

      validateWebhookSignature(req as any, res, next);

      expect(mockHmac.update).toHaveBeenCalled();
      expect((req as any).webhookSignatureValid).toBe(true);
    });

    it('should use HMAC-SHA256 algorithm', () => {
      (req as any).headers = {
        'x-webhook-signature': 'sig',
        'x-webhook-timestamp': '1234567890',
      };
      (req as any).body = {};

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('sig'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(true);

      validateWebhookSignature(req as any, res, next);

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-secret-key');
    });
  });

  describe('requireAccounting', () => {
    it('should allow ADMIN user', () => {
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ADMIN',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext).toEqual({
        userId: 'user-123',
        merchantId: 'merchant-456',
        userRole: 'ADMIN',
        timestamp: expect.any(Date),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(next).toHaveBeenCalled();
    });

    it('should allow ACCOUNTANT user', () => {
      (req as any).user = {
        id: 'user-789',
        merchantId: 'merchant-999',
        role: 'ACCOUNTANT',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.userRole).toBe('ACCOUNTANT');
      expect(next).toHaveBeenCalled();
    });

    it('should reject USER role', () => {
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'USER',
      };

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Accounting role required' });
    });

    it('should reject missing userId', () => {
      (req as any).user = { merchantId: 'merchant-456', role: 'ADMIN' };

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Accounting context required' });
    });

    it('should reject missing merchantId', () => {
      (req as any).user = { id: 'user-123', role: 'ADMIN' };

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject missing userRole', () => {
      (req as any).user = { id: 'user-123', merchantId: 'merchant-456' };

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject no user object', () => {
      (req as any).user = undefined;

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should capture IP address', () => {
      (req as any).ip = '203.0.113.42';
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ADMIN',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.ipAddress).toBe('203.0.113.42');
    });

    it('should use empty string for missing user-agent', () => {
      (req as any).get = jest.fn(() => undefined);
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ADMIN',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.userAgent).toBe('');
    });

    it('should use empty string when ip address is missing', () => {
      (req as any).ip = undefined;
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ADMIN',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.ipAddress).toBe('');
    });

    it('should use empty string when ip address is null', () => {
      (req as any).ip = null;
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ADMIN',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.ipAddress).toBe('');
    });

    it('should preserve userRole when present', () => {
      (req as any).user = {
        id: 'user-123',
        merchantId: 'merchant-456',
        role: 'ACCOUNTANT',
      };

      requireAccounting(req as any, res, next);

      expect((req as any).auditContext.userRole).toBe('ACCOUNTANT');
      expect((req as any).auditContext.userRole).not.toBe('USER');
    });
  });

  describe('requireFacturaNotSigned', () => {
    it('should allow DRAFT factura', () => {
      (req as any).body = { facturaStatus: 'DRAFT' };

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block SIGNED factura', () => {
      (req as any).body = { facturaStatus: 'SIGNED' };

      requireFacturaNotSigned(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Factura is immutable after SII submission. Use void workflow instead.',
      });
    });

    it('should block VOIDED factura', () => {
      (req as any).body = { facturaStatus: 'VOIDED' };

      requireFacturaNotSigned(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should allow status from query parameter', () => {
      (req as any).body = {};
      (req as any).query = { status: 'PENDING' };

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should prioritize body over query status', () => {
      (req as any).body = { facturaStatus: 'SIGNED' };
      (req as any).query = { status: 'PENDING' };

      requireFacturaNotSigned(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should allow SUBMITTED status', () => {
      (req as any).body = { facturaStatus: 'SUBMITTED' };

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow REJECTED status', () => {
      (req as any).body = { facturaStatus: 'REJECTED' };

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should use case-sensitive matching', () => {
      (req as any).body = { facturaStatus: 'signed' };

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle null body', () => {
      (req as any).body = null;
      (req as any).query = {};

      requireFacturaNotSigned(req as any, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Integration workflows', () => {
    it('should enforce signature validation first', () => {
      (req as any).headers = {
        'x-webhook-signature': 'invalid',
        'x-webhook-timestamp': '1234567890',
      };
      (req as any).body = {};

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('valid'),
      };
      (crypto.createHmac as jest.Mock).mockReturnValue(mockHmac);
      (crypto.timingSafeEqual as jest.Mock).mockReturnValue(false);

      validateWebhookSignature(req as any, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should enforce accounting before immutability', () => {
      (req as any).user = undefined;
      (req as any).body = { facturaStatus: 'SIGNED' };

      requireAccounting(req as any, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
