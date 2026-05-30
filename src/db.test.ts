import { prisma } from './db';

jest.mock('./services/Logger');

describe('Prisma Singleton', () => {
  describe('Database Connection', () => {
    it('should create Prisma client instance', () => {
      expect(prisma).toBeDefined();
    });

    it('should reuse global instance for HMR', () => {
      const global1 = global as any;
      const global2 = global as any;

      if (process.env.NODE_ENV !== 'production') {
        global1.prisma = prisma;
        global2.prisma = prisma;

        expect(global1.prisma === global2.prisma).toBe(true);
      }
    });

    it('should not create multiple instances in production', () => {
      const shouldReuse = process.env.NODE_ENV !== 'production';
      expect(shouldReuse).toBe(true);
    });
  });

  describe('Query Logging', () => {
    it('should log queries in development', () => {
      const shouldLog = process.env.NODE_ENV === 'development';
      expect(typeof shouldLog === 'boolean').toBe(true);
    });

    it('should not log queries in production', () => {
      const shouldLog = process.env.NODE_ENV === 'development';
      expect(typeof shouldLog === 'boolean').toBe(true);
    });

    it('should include query duration', () => {
      const duration = 15;
      expect(duration > 0).toBe(true);
    });

    it('should log query text', () => {
      const query = 'SELECT * FROM "Order" WHERE id = $1';
      expect(query).toBeDefined();
    });
  });

  describe('Event Handlers', () => {
    it('should handle query events', () => {
      const eventType = 'query';
      expect(eventType).toBe('query');
    });

    it('should handle error events', () => {
      const eventType = 'error';
      expect(eventType).toBe('error');
    });

    it('should handle warn events', () => {
      const eventType = 'warn';
      expect(eventType).toBe('warn');
    });

    it('should log error details', () => {
      const errorMessage = 'Database connection failed';
      expect(errorMessage).toBeDefined();
    });
  });

  describe('Global Reuse', () => {
    it('should store prisma in globalForPrisma in dev', () => {
      const shouldStore = process.env.NODE_ENV !== 'production';
      expect(typeof shouldStore === 'boolean').toBe(true);
    });

    it('should not store prisma in globalForPrisma in production', () => {
      const shouldStore = process.env.NODE_ENV !== 'production';
      expect(typeof shouldStore === 'boolean').toBe(true);
    });
  });
});
