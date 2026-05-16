/**
 * NotificationJob.js — Job para envío de notificaciones de carrito abandonado
 *
 * Separa la lógica de notificaciones del servicio cartRecovery.
 * Permite ejecutar y testear el flujo de notificaciones de forma independiente.
 */

const cartRecovery = require('../services/cartRecovery');

class NotificationJob {
  /**
   * Ejecuta el job de notificaciones para todos los carritos pendientes.
   * @param {Object} [options] - Opciones para ejecución (shop, logger, etc)
   */
  static async run(options = {}) {
    const { shop, logger = console } = options;
    const carts = shop ? cartRecovery.listCarts(shop) : Object.values(cartRecovery.readStore());
    logger.info(`[NotificationJob] Ejecutando para ${carts.length} carritos`);
    for (const cart of carts) {
      await NotificationJob.processCart(cart, logger);
    }
  }

  /**
   * Procesa un carrito individual y envía notificaciones según el estado.
   */
  static async processCart(cart, logger = console) {
    try {
      if (cart.state === 'pending') {
        logger.info(`[NotificationJob] Notificando carrito pendiente: ${cart.id}`);
        await cartRecovery.sendRecoveryNotification(cart, 1);
      } else if (cart.state === 'notified_1h') {
        logger.info(`[NotificationJob] Notificando carrito 24h: ${cart.id}`);
        await cartRecovery.sendRecoveryNotification(cart, 2);
      } else {
        logger.info(`[NotificationJob] Sin acción para carrito: ${cart.id} estado: ${cart.state}`);
      }
    } catch (err) {
      logger.error(`[NotificationJob] Error procesando carrito ${cart.id}: ${err.message}`);
    }
  }
}

module.exports = NotificationJob;
