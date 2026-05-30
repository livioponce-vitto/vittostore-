import { PrismaClient } from '@prisma/client';
import { Logger } from './services/Logger';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  });

// Log Prisma queries in development
if (process.env.NODE_ENV === 'development') {
  (prisma as any).$on('query', (e: any) => {
    Logger.debug(`[QUERY] ${e.query}`, {
      duration: `${e.duration}ms`,
    });
  });

  (prisma as any).$on('error', (e: any) => {
    Logger.error('[PRISMA ERROR]', e as Error);
  });

  (prisma as any).$on('warn', (e: any) => {
    Logger.warn('[PRISMA WARN]', {
      message: e.message,
    });
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
