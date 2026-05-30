/**
 * DLQRetryJob.js — Job para reintentar órdenes fallidas en DLQ
 *
 * Procesa órdenes pendientes en la Dead Letter Queue
 * e intenta sincronizarlas nuevamente con Oraculo.
 */

const dlq = require('../services/dlq');
const oraculo = require('../services/oraculo');

class DLQRetryJob {
  /**
   * Ejecuta el job de reintentos de DLQ.
   * @param {Object} [options] - Opciones para ejecución (logger, etc)
   */
  static async run(options = {}) {
    const { logger = console } = options;

    try {
      const pending = dlq.getPendingRetries();
      logger.info(`[DLQRetryJob] Procesando ${pending.length} órdenes pendientes`);

      for (const item of pending) {
        await DLQRetryJob.processItem(item, logger);
      }
    } catch (error) {
      logger.error(`[DLQRetryJob] Error en ejecución del job: ${error.message}`);
    }
  }

  /**
   * Procesa un item individual de DLQ.
   */
  static async processItem(item, logger = console) {
    const { queueId, order, idempotencyKey } = item;

    try {
      logger.info(`[DLQRetryJob] Retentando orden ${order.id} (intento ${item.retries + 1})`);

      await oraculo.syncOrder(order, idempotencyKey);

      dlq.markSucceeded(queueId);
      logger.info(`[DLQRetryJob] Orden ${order.id} sincronizada exitosamente`);
    } catch (error) {
      dlq.recordRetryAttempt(queueId, error);
      logger.warn(`[DLQRetryJob] Error retentando orden ${order.id}: ${error.message}`);
    }
  }
}

module.exports = DLQRetryJob;
