import { Logger } from './Logger';
import { VaultService } from './VaultService';

jest.mock('./VaultService');

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

    (VaultService.redact as jest.Mock).mockImplementation((value: string, type: string) => {
      if (type === 'email') {
        const [local, domain] = value.split('@');
        return `${local[0]}${'*'.repeat(local.length - 2)}@${domain}`;
      } else if (type === 'phone') {
        return `+56 ****${value.slice(-4)}`;
      } else if (type === 'rut') {
        return `**${value.slice(-4)}`;
      }
      return value;
    });

    process.env.DEBUG = 'false';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('Logger.info()', () => {
    it('should log info message with [INFO] prefix', () => {
      Logger.info('User logged in');

      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[INFO]');
      expect(call).toContain('User logged in');
    });

    it('should redact email in message', () => {
      Logger.info('Customer email: customer@example.com');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('customer@example.com', 'email');
    });

    it('should redact phone in message', () => {
      Logger.info('Contact: +56912345678');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith(expect.stringContaining('56'), 'phone');
    });

    it('should redact RUT in message', () => {
      Logger.info('Customer RUT: 12.345.678-9');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should redact PII in context object', () => {
      const context = { email: 'user@example.com', orderId: 'ord_1' };
      Logger.info('Order created', context);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('user@example.com', 'email');
    });

    it('should use message as context when context is not provided', () => {
      Logger.info('Payment processed with amount 1000');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0].length).toBeGreaterThanOrEqual(1);
    });

    it('should handle undefined context', () => {
      Logger.info('Event occurred', undefined);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('should handle null context', () => {
      Logger.info('Action completed', null);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('should redact multiple PII patterns in single message', () => {
      Logger.info('Email: user@example.com, Phone: +56912345678, RUT: 12.345.678-9');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });
  });

  describe('Logger.warn()', () => {
    it('should log warn message with [WARN] prefix', () => {
      Logger.warn('Deprecated API endpoint');

      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('[WARN]');
      expect(call).toContain('Deprecated API endpoint');
    });

    it('should redact email in warning', () => {
      Logger.warn('Failed to send email to customer@example.com');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('customer@example.com', 'email');
    });

    it('should redact phone in warning', () => {
      Logger.warn('SMS delivery failed for +56912345678');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should redact PII in context', () => {
      const context = { phone: '+56912345678', status: 'failed' };
      Logger.warn('SMS not sent', context);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should handle object context', () => {
      Logger.warn('Slow query detected', { queryTime: 5000, sql: 'SELECT...' });

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
    });

    it('should handle array context', () => {
      Logger.warn('Multiple errors', [{ code: 'ERR1', email: 'user@example.com' }]);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('user@example.com', 'email');
    });
  });

  describe('Logger.error()', () => {
    it('should log error message with [ERROR] prefix', () => {
      const error = new Error('Database connection failed');
      Logger.error('Fatal error', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('[ERROR]');
      expect(call).toContain('Fatal error');
    });

    it('should include error message in output', () => {
      const error = new Error('Connection timeout');
      Logger.error('DB error', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe('Connection timeout');
    });

    it('should redact PII in message', () => {
      const error = new Error('Auth failed');
      Logger.error('Login failed for user@example.com', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('user@example.com', 'email');
    });

    it('should redact PII in context', () => {
      const error = new Error('Payment declined');
      const context = { email: 'customer@example.com', orderId: 'ord_1' };
      Logger.error('Payment processing failed', error, context);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('customer@example.com', 'email');
    });

    it('should handle undefined error', () => {
      Logger.error('Something went wrong', undefined, { code: 'ERR_UNKNOWN' });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should handle error without message', () => {
      const error = new Error();
      Logger.error('Unexpected error', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should pass context object to console.error', () => {
      const error = new Error('API call failed');
      const context = { endpoint: '/orders', status: 500 };
      Logger.error('API error', error, context);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        'API call failed',
        expect.any(Object)
      );
    });

    it('should redact multiple PII patterns in error', () => {
      const error = new Error('Multiple failures');
      Logger.error('Batch processing failed: user@example.com and +56912345678', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });
  });

  describe('Logger.debug()', () => {
    it('should not log debug when DEBUG is false', () => {
      process.env.DEBUG = 'false';
      Logger.debug('Debug info', { detail: 'value' });

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should log debug when DEBUG is true', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Debug message');

      expect(consoleDebugSpy).toHaveBeenCalled();
      const call = consoleDebugSpy.mock.calls[0][0];
      expect(call).toContain('[DEBUG]');
      expect(call).toContain('Debug message');
    });

    it('should include [DEBUG] prefix', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Detailed trace information');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should redact PII in debug message', () => {
      process.env.DEBUG = 'true';
      Logger.debug('User data: customer@example.com');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalledWith('customer@example.com', 'email');
    });

    it('should redact PII in debug context', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Processing order', { email: 'user@example.com', orderId: 'ord_1' });

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should handle undefined context in debug', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Event triggered', undefined);

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should pass context to console.debug when provided', () => {
      process.env.DEBUG = 'true';
      const context = { requestId: 'req_123', userId: 'usr_1' };
      Logger.debug('Request handled', context);

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0].length).toBeGreaterThanOrEqual(2);
    });

    it('should redact phone numbers in debug', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Contact trace: +56912345678');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should redact RUT identifiers in debug', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Customer RUT: 12.345.678-9');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });
  });

  describe('PII Redaction Consistency', () => {
    it('should use VaultService.redact for all PII types', () => {
      Logger.info('User: user@example.com, Phone: +56912345678, RUT: 12.345.678-9');

      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should maintain consistent redaction across all log levels', () => {
      const message = 'Sensitive: customer@example.com';

      Logger.info(message);
      Logger.warn(message);
      Logger.error(message, new Error());

      process.env.DEBUG = 'true';
      Logger.debug(message);

      expect(VaultService.redact).toHaveBeenCalledTimes(7);
    });

    it('should redact PII in JSON stringified objects', () => {
      const context = { email: 'user@example.com', nested: { phone: '+56912345678' } };
      Logger.info('Processing', context);

      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should handle special characters in PII', () => {
      Logger.info('Email with plus: user+tag@example.com');

      expect(VaultService.redact).toHaveBeenCalled();
    });
  });

  describe('Message Type Handling', () => {
    it('should handle string messages', () => {
      Logger.info('String message');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('should handle numeric values in message', () => {
      Logger.info('Order total: 1000');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle boolean values in context', () => {
      Logger.info('Processing', { success: true, verified: false });

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle deeply nested objects', () => {
      const context = {
        user: { profile: { email: 'user@example.com', settings: { notifications: true } } },
      };
      Logger.info('User profile loaded', context);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });

    it('should handle arrays of objects', () => {
      Logger.info('Orders processed', [
        { orderId: 'ord_1', email: 'user1@example.com' },
        { orderId: 'ord_2', email: 'user2@example.com' },
      ]);

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(VaultService.redact).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string message', () => {
      Logger.info('');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle message with only whitespace', () => {
      Logger.info('   ');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);
      Logger.info(longMessage);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle special characters in message', () => {
      Logger.info('Message with @#$%^&*() special chars');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle Unicode characters', () => {
      Logger.info('Spanish: ñáéíóú, Emoji: 😀');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle circular reference prevention in JSON stringify', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      expect(() => {
        Logger.info('Circular', { ...obj, self: undefined });
      }).not.toThrow();
    });

    it('should handle null message safely', () => {
      Logger.info(null as any);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle undefined message safely', () => {
      Logger.info(undefined as any);

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Debug Environment Variable', () => {
    it('should respect DEBUG env var when true', () => {
      process.env.DEBUG = 'true';
      Logger.debug('Should appear');

      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should respect DEBUG env var when false', () => {
      process.env.DEBUG = 'false';
      Logger.debug('Should not appear');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should not log debug when DEBUG is undefined', () => {
      delete process.env.DEBUG;
      Logger.debug('Should not appear');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should treat non-true DEBUG values as false', () => {
      process.env.DEBUG = 'yes'; // Only 'true' string should enable
      Logger.debug('Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should handle DEBUG env var case-sensitively', () => {
      process.env.DEBUG = 'TRUE'; // Case-sensitive check
      Logger.debug('Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });
});
