import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface AuditContext {
  userId: string;
  merchantId: string;
  userRole: 'ADMIN' | 'ACCOUNTANT' | 'USER';
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface WebhookRequest extends Request {
  webhookSignatureValid?: boolean;
  webhookPayload?: any;
  auditContext?: AuditContext;
  user?: {
    id: string;
    merchantId: string;
    role: 'ADMIN' | 'ACCOUNTANT' | 'USER';
  };
}

/**
 * Validates incoming webhook signatures using HMAC-SHA256
 * Enforces: engineering-security/SKILL.md
 */
export function validateWebhookSignature(req: WebhookRequest, res: Response, next: NextFunction): void {
  const signature = req.headers['x-webhook-signature'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;
  const secret = process.env.WEBHOOK_SECRET;

  if (!signature || !timestamp || !secret) {
    res.status(401).json({ error: 'Missing signature headers' });
    return;
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const payload = `${timestamp}.${body}`;
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  if (!isValid) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  req.webhookSignatureValid = true;
  next();
}

/**
 * Middleware requiring accounting context for financial operations
 * Enforces: engineering-compliance/SKILL.md (AuditLog on all mutations)
 */
export function requireAccounting(req: WebhookRequest, res: Response, next: NextFunction): void {
  const userId = req.user?.id;
  const merchantId = req.user?.merchantId;
  const userRole = req.user?.role;

  if (!userId || !merchantId || !userRole) {
    res.status(401).json({ error: 'Accounting context required' });
    return;
  }

  if (!['ADMIN', 'ACCOUNTANT'].includes(userRole)) {
    res.status(403).json({ error: 'Accounting role required' });
    return;
  }

  // Attach audit context to request
  req.auditContext = {
    userId,
    merchantId,
    userRole: (userRole as 'ADMIN' | 'ACCOUNTANT' | 'USER') || 'USER',
    timestamp: new Date(),
    ipAddress: req.ip || '',
    userAgent: req.get('user-agent') || '',
  };

  next();
}

/**
 * Middleware verifying Factura immutability after signing
 * Enforces: engineering-compliance/SKILL.md (Factura immutable post-SII)
 */
export function requireFacturaNotSigned(req: WebhookRequest, res: Response, next: NextFunction): void {
  const facturaStatus = req.body?.facturaStatus || req.query?.status;
  if (facturaStatus === 'SIGNED' || facturaStatus === 'VOIDED') {
    res.status(409).json({
      error: 'Factura is immutable after SII submission. Use void workflow instead.',
    });
    return;
  }
  next();
}
