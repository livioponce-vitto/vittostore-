import { Router, Request, Response } from 'express';
import { DLQQueryService } from '../services/DLQQueryService';
import { requireAccounting } from '../middleware/governance';
import { Logger } from '../services/Logger';

const router = Router();

// GET /dashboard/dlq/stats - DLQ aggregate statistics
router.get('/dlq/stats', requireAccounting, async (req: Request, res: Response) => {
  try {
    const stats = await DLQQueryService.getStats();
    res.json(stats);
  } catch (error) {
    Logger.error('Failed to fetch DLQ stats', error as Error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /dashboard/dlq/events - List DLQ events with filtering and pagination
router.get('/dlq/events', requireAccounting, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, status, eventType, startDate, endDate } = req.query;

    const result = await DLQQueryService.listEvents({
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      status: status as string | undefined,
      eventType: eventType as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(result);
  } catch (error) {
    Logger.error('Failed to fetch DLQ events', error as Error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /dashboard/dlq/retry/:eventId - Manual retry for single event
router.post('/dlq/retry/:eventId', requireAccounting, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    await DLQQueryService.manualRetry(eventId);
    res.json({ message: 'Event scheduled for retry' });
  } catch (error) {
    Logger.error(`Failed to retry event ${req.params.eventId}`, error as Error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /dashboard/dlq/batch-retry - Bulk retry with filter or retryAll flag
router.post('/dlq/batch-retry', requireAccounting, async (req: Request, res: Response) => {
  try {
    const { status, eventType, maxRetries, retryAll } = req.body;

    if (retryAll === true) {
      // Retry all events with no filters
      const result = await DLQQueryService.retryAll({});
      res.json(result);
      return;
    }

    // Retry with specific filters
    const result = await DLQQueryService.retryAll({
      status: status as string | undefined,
      eventType: eventType as string | undefined,
      maxRetries: maxRetries as number | undefined,
    });

    res.json(result);
  } catch (error) {
    Logger.error('Failed to execute batch retry', error as Error);
    res.status(500).json({ error: 'Failed to execute batch retry' });
  }
});

// GET /dashboard/dlq/failed - List permanently failed events with pagination
router.get('/dlq/failed', requireAccounting, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const result = await DLQQueryService.listEvents({
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      status: 'FAILED_MAX_RETRIES',
    });

    res.json(result);
  } catch (error) {
    Logger.error('Failed to fetch permanently failed events', error as Error);
    res.status(500).json({ error: 'Failed to fetch failed events' });
  }
});

// DELETE /dashboard/dlq/event/:eventId - Delete specific event
router.delete('/dlq/event/:eventId', requireAccounting, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    await DLQQueryService.deleteEvent(eventId);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    Logger.error(`Failed to delete event ${req.params.eventId}`, error as Error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
