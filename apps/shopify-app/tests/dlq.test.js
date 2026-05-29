const dlq = require('../app/services/dlq');
const fs = require('fs');
const path = require('path');

const DLQ_DIR = path.join(__dirname, '../config/dlq');

function cleanupDLQ() {
  if (fs.existsSync(DLQ_DIR)) {
    fs.rmSync(DLQ_DIR, { recursive: true, force: true });
  }
}

describe('DLQ Service', () => {
  beforeAll(() => {
    cleanupDLQ();
  });

  afterAll(() => {
    cleanupDLQ();
  });

  it('enqueue: debería guardar orden fallida', () => {
    const order = { id: '1', email: 'test@example.com' };
    const error = new Error('API timeout');
    const queueId = dlq.enqueue(order, 'key-1', error);

    expect(queueId).toMatch(/^dlq-/);
    expect(fs.existsSync(path.join(DLQ_DIR, `${queueId}.json`))).toBe(true);
  });

  it('getStats: debería retornar estadísticas', () => {
    const stats = dlq.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.succeeded).toBe('number');
    expect(typeof stats.failed).toBe('number');
  });

  it('markSucceeded: debería marcar orden como exitosa', () => {
    const stats1 = dlq.getStats();
    const order = { id: '2', email: 'test2@example.com' };
    const queueId = dlq.enqueue(order, 'key-2', new Error('Test'));

    dlq.markSucceeded(queueId);
    const stats2 = dlq.getStats();

    expect(stats2.succeeded).toBe(stats1.succeeded + 1);
  });

  it('recordRetryAttempt: debería incrementar contador de reintentos', () => {
    const order = { id: '3', email: 'test3@example.com' };
    const queueId = dlq.enqueue(order, 'key-3', new Error('Test'));

    dlq.recordRetryAttempt(queueId, new Error('Retry 1'));
    dlq.recordRetryAttempt(queueId, new Error('Retry 2'));

    const stats = dlq.getStats();
    const item = stats.items.find(i => i.queueId === queueId);
    expect(item.retries).toBe(2);
  });

  it('getPendingRetries: debería traer órdenes listas para reintentar', () => {
    // Create a queued item and artificially set its nextRetryAt to the past
    const order = { id: '4', email: 'test4@example.com', updated_at: '2026-05-29T10:00:00Z' };
    const queueId = dlq.enqueue(order, 'key-4', new Error('Test'));

    // Manually modify index to set nextRetryAt in the past
    const indexPath = path.join(DLQ_DIR, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const item = index.items.find(i => i.queueId === queueId);
    if (item) {
      item.nextRetryAt = new Date(Date.now() - 10000).toISOString();
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }

    const pending = dlq.getPendingRetries();
    expect(pending.length).toBeGreaterThan(0);
  });

  it('retries limit: debería marcar como failed después de MAX_RETRIES', () => {
    const order = { id: '5', email: 'test5@example.com' };
    const queueId = dlq.enqueue(order, 'key-5', new Error('Test'));

    for (let i = 0; i < dlq.MAX_RETRIES; i++) {
      dlq.recordRetryAttempt(queueId, new Error(`Retry ${i}`));
    }

    const stats = dlq.getStats();
    const item = stats.items.find(i => i.queueId === queueId);
    expect(item.status).toBe('failed');
    expect(item.retries).toBe(dlq.MAX_RETRIES);
  });
});
