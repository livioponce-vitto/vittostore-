jest.mock('./services/Logger');

let capturedMockOn: jest.Mock;

jest.mock('@prisma/client', () => {
  const mockOn = jest.fn();
  capturedMockOn = mockOn;

  return {
    PrismaClient: jest.fn(() => ({
      $on: mockOn,
      $disconnect: jest.fn(),
    })),
  };
});

process.env.NODE_ENV = 'development';

// Clear global.prisma before tests
(global as any).prisma = undefined;

import { Logger } from './services/Logger';

let prisma: any;
let queryHandler: any;
let errorHandler: any;
let warnHandler: any;

beforeAll(() => {
  // Clear require cache to force fresh import
  delete require.cache[require.resolve('./db')];

  // Dynamically require after NODE_ENV is set and cache cleared
  prisma = require('./db').prisma;

  // Store handler functions before they get cleared
  queryHandler = capturedMockOn.mock.calls[0]?.[1];
  errorHandler = capturedMockOn.mock.calls[1]?.[1];
  warnHandler = capturedMockOn.mock.calls[2]?.[1];
});

describe('Prisma Singleton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Connection', () => {
    it('should create Prisma client instance', () => {
      expect(prisma).toBeDefined();
    });

    it('should have $on method for event subscription', () => {
      expect(typeof prisma.$on).toBe('function');
    });

    it('should have $disconnect method for cleanup', () => {
      expect(typeof prisma.$disconnect).toBe('function');
    });
  });

  describe('Event Handler Registration', () => {
    it('should register query event handler', () => {
      expect(queryHandler).toBeDefined();
      expect(typeof queryHandler).toBe('function');
    });

    it('should register error event handler', () => {
      expect(errorHandler).toBeDefined();
      expect(typeof errorHandler).toBe('function');
    });

    it('should register warn event handler', () => {
      expect(warnHandler).toBeDefined();
      expect(typeof warnHandler).toBe('function');
    });
  });

  describe('Query Event Handler', () => {
    it('should log query with duration', () => {
      queryHandler({
        query: 'SELECT * FROM "Order" WHERE id = $1',
        duration: 25,
        params: ['ord_1'],
      });

      expect(Logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[QUERY]'),
        expect.objectContaining({
          duration: '25ms',
        })
      );
    });

    it('should include query string in debug log', () => {
      queryHandler({
        query: 'UPDATE "User" SET email = $1 WHERE id = $2',
        duration: 10,
        params: ['new@example.com', 'usr_1'],
      });

      expect(Logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "User"'),
        expect.any(Object)
      );
    });

    it('should handle zero duration queries', () => {
      queryHandler({
        query: 'SELECT COUNT(*) FROM "Order"',
        duration: 0,
        params: [],
      });

      expect(Logger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          duration: '0ms',
        })
      );
    });

    it('should handle long duration queries', () => {
      queryHandler({
        query: 'SELECT * FROM "Order" INNER JOIN "Payment"...',
        duration: 5000,
        params: [],
      });

      expect(Logger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          duration: '5000ms',
        })
      );
    });
  });

  describe('Error Event Handler', () => {
    it('should log database errors', () => {
      errorHandler(new Error('Database connection failed'));

      expect(Logger.error).toHaveBeenCalledWith('[PRISMA ERROR]', expect.any(Error));
    });

    it('should handle error objects with message', () => {
      const err = new Error('Unique constraint violation');
      errorHandler(err);

      expect(Logger.error).toHaveBeenCalledWith('[PRISMA ERROR]', err);
    });

    it('should handle custom error object', () => {
      const customError = { message: 'Custom error', code: 'P2025' } as any;
      errorHandler(customError);

      expect(Logger.error).toHaveBeenCalledWith('[PRISMA ERROR]', customError);
    });
  });

  describe('Warn Event Handler', () => {
    it('should log database warnings', () => {
      warnHandler({
        message: 'Slow query detected',
        duration: 1000,
      });

      expect(Logger.warn).toHaveBeenCalledWith(
        '[PRISMA WARN]',
        expect.objectContaining({
          message: 'Slow query detected',
        })
      );
    });

    it('should include warning message in log', () => {
      warnHandler({
        message: 'N+1 query pattern detected',
        context: { queries: 100 },
      });

      expect(Logger.warn).toHaveBeenCalledWith(
        '[PRISMA WARN]',
        expect.objectContaining({
          message: 'N+1 query pattern detected',
        })
      );
    });

    it('should handle warn without context', () => {
      warnHandler({
        message: 'Simple warning',
      });

      expect(Logger.warn).toHaveBeenCalledWith(
        '[PRISMA WARN]',
        expect.objectContaining({
          message: 'Simple warning',
        })
      );
    });
  });

  describe('Global Reuse', () => {
    it('should have stored prisma in global', () => {
      const globalForPrisma = global as any;
      expect(globalForPrisma.prisma).toBeDefined();
    });

    it('should reuse existing global prisma', () => {
      const globalForPrisma = global as any;
      const existingPrisma = globalForPrisma.prisma;

      expect(prisma).toBe(existingPrisma);
    });
  });
});
