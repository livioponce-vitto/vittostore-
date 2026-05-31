import { prisma } from '../db';
import { Logger } from './Logger';

interface ListEventsOptions {
  page: number;
  limit: number;
  status?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
}

interface RetryAllFilter {
  status?: string;
  eventType?: string;
  maxRetries?: number;
}

interface PaginatedResult<T> {
  events: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface DLQStats {
  total: number;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  successRate: number;
  byType: Array<{
    eventType: string;
    count: number;
  }>;
}

class DLQQueryServiceImpl {
  async listEvents(options: ListEventsOptions): Promise<PaginatedResult<any>> {
    const { page, limit, status, eventType, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [events, total] = await Promise.all([
      prisma.dLQEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nextRetryAt: 'asc' },
      }),
      prisma.dLQEvent.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getStats(): Promise<DLQStats> {
    const [total, pending, processing, failed, completed] = await Promise.all([
      prisma.dLQEvent.count(),
      prisma.dLQEvent.count({ where: { status: 'PENDING' } }),
      prisma.dLQEvent.count({ where: { status: 'PROCESSING' } }),
      prisma.dLQEvent.count({ where: { status: 'FAILED_MAX_RETRIES' } }),
      prisma.dLQEvent.count({ where: { status: 'SUCCEEDED' } }),
    ]);

    const byTypeData = await prisma.dLQEvent.groupBy({
      by: ['eventType'],
      _count: {
        id: true,
      },
    });

    const byType = byTypeData.map((item) => ({
      eventType: item.eventType,
      count: item._count.id,
    }));

    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      pending,
      processing,
      failed,
      completed,
      successRate: Math.round(successRate * 100) / 100,
      byType,
    };
  }

  async manualRetry(eventId: string): Promise<void> {
    const event = await prisma.dLQEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.status === 'SUCCEEDED' || event.status === 'FAILED_MAX_RETRIES') {
      throw new Error('Cannot retry completed events');
    }

    await prisma.dLQEvent.update({
      where: { id: eventId },
      data: {
        status: 'PENDING',
        nextRetryAt: new Date(),
        retryCount: 0,
      },
    });

    Logger.info(`Event ${eventId} manually retried`, {
      eventType: event.eventType,
    });
  }

  async retryAll(filter: RetryAllFilter): Promise<{ count: number }> {
    const where: any = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.eventType) {
      where.eventType = filter.eventType;
    }

    if (filter.maxRetries !== undefined) {
      where.retryCount = { lt: filter.maxRetries };
    }

    const result = await prisma.dLQEvent.updateMany({
      where,
      data: {
        status: 'PENDING',
        nextRetryAt: new Date(),
        retryCount: 0,
      },
    });

    Logger.info(`Bulk retry operation completed`, {
      count: result.count,
      filter,
    });

    return { count: result.count };
  }

  async deleteEvent(eventId: string): Promise<void> {
    await prisma.dLQEvent.delete({
      where: { id: eventId },
    });

    Logger.info(`Event ${eventId} deleted`);
  }
}

export const DLQQueryService = new DLQQueryServiceImpl();
