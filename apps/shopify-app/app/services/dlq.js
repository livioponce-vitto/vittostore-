/**
 * dlq.js
 * Dead Letter Queue service for failed Oraculo synchronization attempts
 * Stores failed orders for retry processing
 */

const fs = require('fs');
const path = require('path');

const DLQ_DIR = path.join(__dirname, '../../config/dlq');
const DLQ_INDEX = path.join(DLQ_DIR, 'index.json');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function ensureDir() {
  if (!fs.existsSync(DLQ_DIR)) {
    fs.mkdirSync(DLQ_DIR, { recursive: true });
  }
}

function getIndex() {
  ensureDir();
  if (!fs.existsSync(DLQ_INDEX)) {
    return { items: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DLQ_INDEX, 'utf8'));
  } catch (e) {
    console.error('[DLQ] Error reading index:', e.message);
    return { items: [] };
  }
}

function saveIndex(index) {
  ensureDir();
  fs.writeFileSync(DLQ_INDEX, JSON.stringify(index, null, 2));
}

function generateQueueId() {
  return `dlq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDLQFilePath(queueId) {
  return path.join(DLQ_DIR, `${queueId}.json`);
}

/**
 * Enqueue a failed order sync attempt
 */
function enqueue(order, idempotencyKey, error) {
  ensureDir();
  const queueId = generateQueueId();
  const item = {
    queueId,
    orderId: order.id,
    idempotencyKey,
    order,
    error: error.message,
    errorStack: error.stack,
    retries: 0,
    maxRetries: MAX_RETRIES,
    enqueuedAt: new Date().toISOString(),
    nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
    attempts: [
      {
        timestamp: new Date().toISOString(),
        error: error.message
      }
    ]
  };

  fs.writeFileSync(getDLQFilePath(queueId), JSON.stringify(item, null, 2));

  const index = getIndex();
  index.items.push({
    queueId,
    orderId: order.id,
    status: 'pending',
    enqueuedAt: item.enqueuedAt,
    nextRetryAt: item.nextRetryAt,
    retries: 0
  });
  saveIndex(index);

  console.info('[DLQ] Order enqueued for retry', {
    queueId,
    orderId: order.id,
    error: error.message
  });

  return queueId;
}

/**
 * Get pending items ready for retry
 */
function getPendingRetries() {
  ensureDir();
  const index = getIndex();
  const now = new Date();
  const pending = [];

  for (const indexItem of index.items) {
    if (indexItem.status === 'pending' && indexItem.retries < MAX_RETRIES) {
      const nextRetry = new Date(indexItem.nextRetryAt);
      if (nextRetry <= now) {
        try {
          const fullItem = JSON.parse(
            fs.readFileSync(getDLQFilePath(indexItem.queueId), 'utf8')
          );
          pending.push(fullItem);
        } catch (e) {
          console.error('[DLQ] Error reading item:', indexItem.queueId, e.message);
        }
      }
    }
  }

  return pending;
}

/**
 * Mark item as succeeded
 */
function markSucceeded(queueId) {
  ensureDir();
  const index = getIndex();
  const item = index.items.find(i => i.queueId === queueId);

  if (item) {
    item.status = 'succeeded';
    item.succeededAt = new Date().toISOString();
    saveIndex(index);
    console.info('[DLQ] Item marked as succeeded', { queueId, orderId: item.orderId });
  }
}

/**
 * Record failed retry attempt
 */
function recordRetryAttempt(queueId, error) {
  ensureDir();
  const filePath = getDLQFilePath(queueId);

  try {
    const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    item.retries += 1;
    item.attempts.push({
      timestamp: new Date().toISOString(),
      error: error.message
    });

    if (item.retries < MAX_RETRIES) {
      item.nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS * (item.retries + 1)).toISOString();
    }

    fs.writeFileSync(filePath, JSON.stringify(item, null, 2));

    const index = getIndex();
    const indexItem = index.items.find(i => i.queueId === queueId);
    if (indexItem) {
      indexItem.retries = item.retries;
      indexItem.nextRetryAt = item.nextRetryAt;
      if (item.retries >= MAX_RETRIES) {
        indexItem.status = 'failed';
        indexItem.failedAt = new Date().toISOString();
      }
      saveIndex(index);
    }

    console.warn('[DLQ] Retry attempt recorded', {
      queueId,
      orderId: item.orderId,
      retryCount: item.retries,
      maxRetries: MAX_RETRIES
    });
  } catch (e) {
    console.error('[DLQ] Error recording retry:', e.message);
  }
}

/**
 * Get permanently failed items (exhausted all retries)
 */
function getFailedItems() {
  const index = getIndex();
  const failed = [];

  for (const indexItem of index.items) {
    if (indexItem.status === 'failed') {
      try {
        const fullItem = JSON.parse(
          fs.readFileSync(getDLQFilePath(indexItem.queueId), 'utf8')
        );
        failed.push(fullItem);
      } catch (e) {
        console.error('[DLQ] Error reading failed item:', indexItem.queueId, e.message);
      }
    }
  }

  return failed;
}

/**
 * Get DLQ statistics
 */
function getStats() {
  const index = getIndex();
  const stats = {
    total: index.items.length,
    pending: 0,
    succeeded: 0,
    failed: 0,
    items: index.items
  };

  for (const item of index.items) {
    if (item.status === 'pending') stats.pending++;
    else if (item.status === 'succeeded') stats.succeeded++;
    else if (item.status === 'failed') stats.failed++;
  }

  return stats;
}

/**
 * Reset a failed item for manual retry
 */
function resetItemForRetry(queueId) {
  ensureDir();
  const filePath = getDLQFilePath(queueId);

  if (!fs.existsSync(filePath)) {
    const err = new Error(`Queue item not found: ${queueId}`);
    err.code = 'QUEUE_ITEM_NOT_FOUND';
    throw err;
  }

  try {
    const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    item.retries = 0;
    item.nextRetryAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(item, null, 2));

    const index = getIndex();
    const indexItem = index.items.find(i => i.queueId === queueId);
    if (indexItem) {
      indexItem.status = 'pending';
      indexItem.retries = 0;
      indexItem.nextRetryAt = item.nextRetryAt;
      saveIndex(index);
      console.info('[DLQ] Item reset for manual retry', { queueId, orderId: item.orderId });
      return item;
    }

    throw new Error(`Index entry not found for queueId: ${queueId}`);
  } catch (e) {
    if (e.code === 'QUEUE_ITEM_NOT_FOUND') throw e;
    console.error('[DLQ] Error resetting item for retry:', e.message);
    throw e;
  }
}

/**
 * Batch reset multiple failed items for retry
 */
function batchResetItemsForRetry(queueIds) {
  ensureDir();
  const results = {
    successful: [],
    failed: [],
    summary: {
      total: queueIds.length,
      succeeded: 0,
      failed: 0
    }
  };

  const index = getIndex();

  for (const queueId of queueIds) {
    const filePath = getDLQFilePath(queueId);

    try {
      if (!fs.existsSync(filePath)) {
        results.failed.push({
          queueId,
          error: `Queue item not found: ${queueId}`
        });
        results.summary.failed++;
        continue;
      }

      const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      item.retries = 0;
      item.nextRetryAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(item, null, 2));

      const indexItem = index.items.find(i => i.queueId === queueId);
      if (indexItem) {
        indexItem.status = 'pending';
        indexItem.retries = 0;
        indexItem.nextRetryAt = item.nextRetryAt;

        results.successful.push({
          queueId: item.queueId,
          orderId: item.orderId,
          nextRetryAt: item.nextRetryAt
        });
        results.summary.succeeded++;
      } else {
        results.failed.push({
          queueId,
          error: `Index entry not found for queueId: ${queueId}`
        });
        results.summary.failed++;
      }
    } catch (e) {
      console.error('[DLQ] Error resetting batch item:', queueId, e.message);
      results.failed.push({
        queueId,
        error: e.message
      });
      results.summary.failed++;
    }
  }

  saveIndex(index);
  console.info('[DLQ] Batch reset completed', {
    total: queueIds.length,
    succeeded: results.summary.succeeded,
    failed: results.summary.failed
  });

  return results;
}

module.exports = {
  enqueue,
  getPendingRetries,
  markSucceeded,
  recordRetryAttempt,
  getStats,
  getFailedItems,
  resetItemForRetry,
  batchResetItemsForRetry,
  MAX_RETRIES,
  RETRY_DELAY_MS
};
