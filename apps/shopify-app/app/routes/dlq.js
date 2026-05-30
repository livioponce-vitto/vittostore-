/**
 * dlq.js — DLQ monitoring routes
 * Provides visibility into Dead Letter Queue state for operations
 */

const express = require('express');
const router = express.Router();
const dlq = require('../services/dlq');

/**
 * @swagger
 * /dlq/stats:
 *   get:
 *     summary: Get Dead Letter Queue statistics
 *     tags: [DLQ]
 *     responses:
 *       200:
 *         description: Current DLQ state and metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total items in queue
 *                     pending:
 *                       type: integer
 *                       description: Items awaiting retry
 *                     succeeded:
 *                       type: integer
 *                       description: Successfully synced items
 *                     failed:
 *                       type: integer
 *                       description: Items that exhausted retries
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           queueId:
 *                             type: string
 *                           orderId:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [pending, succeeded, failed]
 *                           retries:
 *                             type: integer
 *                           enqueuedAt:
 *                             type: string
 *                             format: date-time
 *                           nextRetryAt:
 *                             type: string
 *                             format: date-time
 */
/**
 * @swagger
 * /dlq/failed:
 *   get:
 *     summary: Get permanently failed items from Dead Letter Queue
 *     tags: [DLQ]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Failed orders that exhausted all retry attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           queueId:
 *                             type: string
 *                           orderId:
 *                             type: string
 *                           retries:
 *                             type: integer
 *                           maxRetries:
 *                             type: integer
 *                           enqueuedAt:
 *                             type: string
 *                             format: date-time
 *                           failedAt:
 *                             type: string
 *                             format: date-time
 *                           attempts:
 *                             type: array
 *                             items:
 *                               type: object
 */
router.get('/failed', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const allFailed = dlq.getFailedItems();
    const total = allFailed.length;
    const paginated = allFailed.slice(offset, offset + limit);

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      data: {
        total,
        limit,
        offset,
        items: paginated
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = dlq.getStats();
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
