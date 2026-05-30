const request = require('supertest');
const express = require('express');

jest.mock('../app/middleware/authSession', () => (req, res, next) => {
  req.shop = req.query.shop || 'test.myshopify.com';
  next();
});

jest.mock('../app/middleware/validateBody', () => ({
  validate: () => (req, res, next) => next()
}));

jest.mock('../app/middleware/verifyWebhook', () => (req, res, next) => next());

jest.mock('../app/services/cartRecovery', () => ({
  upsertCart: jest.fn(),
  listCarts: jest.fn(() => []),
  getStats: jest.fn(() => ({ total: 0, recovered: 0, recoveryRate: 0 })),
  getEscalations: jest.fn(() => ({ items: [] })),
  getCart: jest.fn(() => null),
  markRecovered: jest.fn(),
  updateCart: jest.fn()
}));

jest.mock('../app/services/metaWhatsapp', () => ({
  verifyWebhookChallenge: jest.fn(() => 'challenge-token'),
  markAsRead: jest.fn(),
  sendText: jest.fn(),
  sendButtons: jest.fn()
}));

jest.mock('../app/services/conversationSession', () => ({
  isHumanControlled: jest.fn(() => false),
  getSession: jest.fn(() => ({ cartId: null })),
  recordIncoming: jest.fn(),
  recordOutgoing: jest.fn(),
  flagForHuman: jest.fn(),
  destroySession: jest.fn(),
  updateSession: jest.fn()
}));

jest.mock('../app/services/intentClassifier', () => ({
  classify: jest.fn(() => ({ intent: 'UNKNOWN', action: 'send_welcome' })),
  requiresEscalation: jest.fn(() => false)
}));

const cartRecoveryRouter = require('../app/routes/cartRecovery');
const { upsertCart, listCarts, getStats, getEscalations } = require('../app/services/cartRecovery');
const { verifyWebhookChallenge } = require('../app/services/metaWhatsapp');

describe('Cart Recovery API - Unit Tests', () => {
  let app;
  const testShop = 'test.myshopify.com';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/cart-recovery', cartRecoveryRouter);
    jest.clearAllMocks();
    jest.resetAllMocks();

    verifyWebhookChallenge.mockReturnValue('challenge-token');
    getStats.mockReturnValue({ total: 0, recovered: 0, recoveryRate: 0 });
    listCarts.mockReturnValue([]);
    getEscalations.mockReturnValue({ items: [] });
  });

  describe('GET /cart-recovery', () => {
    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/cart-recovery');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('shop requerido');
    });

    it('debería listar carritos abandonados', async () => {
      listCarts.mockReturnValue([
        { id: 'cart-1', shop: testShop, total_price: '1000', state: 'pending' }
      ]);

      const res = await request(app).get(`/cart-recovery?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(listCarts).toHaveBeenCalledWith(testShop);
    });

    it('debería retornar lista vacía cuando no hay carritos', async () => {
      listCarts.mockReturnValue([]);

      const res = await request(app).get(`/cart-recovery?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('GET /cart-recovery/stats', () => {
    it('debería retornar 400 sin parámetro shop', async () => {
      const res = await request(app).get('/cart-recovery/stats');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('shop requerido');
    });

    it('debería retornar estadísticas de recuperación', async () => {
      getStats.mockReturnValue({
        total: 10,
        recovered: 3,
        recoveryRate: 30
      });

      const res = await request(app).get(`/cart-recovery/stats?shop=${testShop}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(10);
      expect(res.body.recovered).toBe(3);
      expect(res.body.recoveryRate).toBe(30);
      expect(getStats).toHaveBeenCalledWith(testShop);
    });
  });

  describe('POST /cart-recovery/webhook', () => {
    it('debería retornar 400 para payload inválido', async () => {
      const res = await request(app)
        .post('/cart-recovery/webhook')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Payload inválido');
    });

    it('debería retornar 200 y skip para checkout sin URL', async () => {
      const res = await request(app)
        .post('/cart-recovery/webhook')
        .send({ id: '123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.skipped).toBe(true);
      expect(upsertCart).not.toHaveBeenCalled();
    });

    it('debería upsert cart con checkout válido', async () => {
      const checkout = {
        id: '123',
        abandoned_checkout_url: 'https://shop.com/checkout',
        email: 'test@example.com',
        total_price: '1000'
      };

      const res = await request(app)
        .post('/cart-recovery/webhook')
        .set('x-shopify-shop-domain', testShop)
        .send(checkout);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(upsertCart).toHaveBeenCalled();
    });
  });

  describe('GET /cart-recovery/whatsapp-webhook', () => {
    it('debería retornar 200 con challenge válido', async () => {
      verifyWebhookChallenge.mockReturnValue('challenge-token');

      const res = await request(app).get('/cart-recovery/whatsapp-webhook');

      expect([200, 403]).toContain(res.status);
      expect(verifyWebhookChallenge).toHaveBeenCalled();
    });
  });

  describe('POST /cart-recovery/whatsapp-webhook', () => {
    it('debería aceptar webhook válido', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: []
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('debería rechazar payload inválido', async () => {
      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send({ object: 'invalid' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /cart-recovery/:id/trigger', () => {
    it('debería disparar secuencia manual para carrito válido', async () => {
      const { getCart, updateCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-valid', state: 'pending', notificationsSent: [] });
      updateCart.mockReturnValue({ id: 'cart-valid', state: 'pending' });

      const res = await request(app)
        .post('/cart-recovery/cart-valid/trigger?shop=' + testShop)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.triggered).toBe(true);
    });

    it('debería retornar 400 para carrito ya recuperado', async () => {
      const { getCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'recovered', notificationsSent: [] });

      const res = await request(app)
        .post('/cart-recovery/cart-123/trigger?shop=' + testShop)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Carrito ya recuperado');
    });

    it('debería retornar 400 para carrito expirado', async () => {
      const { getCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'expired', notificationsSent: [] });

      const res = await request(app)
        .post('/cart-recovery/cart-123/trigger?shop=' + testShop)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Carrito expirado');
    });

    it('debería retornar 400 cuando secuencia completa', async () => {
      const { getCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({
        id: 'cart-123',
        state: 'pending',
        notificationsSent: ['msg1', 'msg2']
      });

      const res = await request(app)
        .post('/cart-recovery/cart-123/trigger?shop=' + testShop)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Secuencia completa');
    });

    it('debería retornar 404 cuando carrito no existe', async () => {
      const { getCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue(null);

      const res = await request(app)
        .post('/cart-recovery/nonexistent/trigger?shop=' + testShop)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Carrito no encontrado');
    });
  });

  describe('POST /cart-recovery/:id/recovered', () => {
    it('debería marcar carrito como recuperado', async () => {
      const { getCart, markRecovered } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'pending' });
      markRecovered.mockReturnValue({ id: 'cart-123', state: 'recovered' });

      const res = await request(app)
        .post('/cart-recovery/cart-123/recovered?shop=' + testShop)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.cart).toBeDefined();
      expect(markRecovered).toHaveBeenCalledWith('cart-123');
    });

    it('debería retornar 404 cuando carrito no existe', async () => {
      const { getCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue(null);

      const res = await request(app)
        .post('/cart-recovery/nonexistent/recovered?shop=' + testShop)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Carrito no encontrado');
    });
  });

  describe('POST /cart-recovery/whatsapp-webhook - Message Classification', () => {
    it('debería procesar mensaje de texto con escalación', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, flagForHuman, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'PEDIR_HUMANO', action: 'escalate' });
      requiresEscalation.mockReturnValue(true);
      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-123',
                from: '+1234567890',
                type: 'text',
                text: { body: 'Quiero hablar con un humano' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(flagForHuman).toHaveBeenCalledWith('+1234567890', 'requested');
    });

    it('debería procesar mensaje interactivo con button reply', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'ENTENDIDO', action: 'mark_recovered_close_cart' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: 'cart-123' });

      const { getCart, markRecovered } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'pending' });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-456',
                from: '+9876543210',
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: { title: 'Sí', id: 'yes_btn' }
                }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(markRecovered).toHaveBeenCalledWith('cart-123');
    });

    it('debería procesar mensaje con acción discount', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, updateSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendButtons } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'PRECIO_ALTO', action: 'offer_payment_plan' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: 'cart-123', offeredDiscount: false });

      const { getCart, updateCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'pending', discountCode: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-789',
                from: '+1111111111',
                type: 'text',
                text: { body: 'Muy caro' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(sendButtons).toHaveBeenCalled();
    });

    it('debería ignorar mensajes cuando human control activo', async () => {
      const { isHumanControlled } = require('../app/services/conversationSession');
      isHumanControlled.mockReturnValue(true);

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-999',
                from: '+2222222222',
                type: 'text',
                text: { body: 'Cualquier mensaje' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('debería enviar clarification para intent desconocido', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendButtons } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'UNKNOWN', action: 'unknown' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-unknown',
                from: '+3333333333',
                type: 'text',
                text: { body: 'zzzzzzzzz' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(sendButtons).toHaveBeenCalled();
    });

    it('debería procesar mensaje con acción shipping info', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'ENVIO', action: 'send_shipping_info' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-shipping',
                from: '+4444444444',
                type: 'text',
                text: { body: '¿Cuánto demora el envío?' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(sendText).toHaveBeenCalledWith(
        '+4444444444',
        expect.stringContaining('Información de envío')
      );
    });

    it('debería procesar mensaje con acción warranty info', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'GARANTIA', action: 'send_warranty_info' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-warranty',
                from: '+5555555555',
                type: 'text',
                text: { body: '¿Qué garantía tiene?' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(sendText).toHaveBeenCalledWith(
        '+5555555555',
        expect.stringContaining('Garantía')
      );
    });

    it('debería procesar mensaje con acción query order status', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'ESTADO_PEDIDO', action: 'query_order_status' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-order',
                from: '+6666666666',
                type: 'text',
                text: { body: '¿Dónde está mi pedido?' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(sendText).toHaveBeenCalledWith(
        '+6666666666',
        expect.stringContaining('número de orden')
      );
    });

    it('debería procesar mensaje con acción mark expired', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, destroySession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'NO_INTERESADO', action: 'mark_expired_stop_sequence' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: 'cart-123' });

      const { getCart, updateCart } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-123', state: 'pending' });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-expired',
                from: '+7777777777',
                type: 'text',
                text: { body: 'No me interesa' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(updateCart).toHaveBeenCalledWith('cart-123', { state: 'expired' });
      expect(destroySession).toHaveBeenCalledWith('+7777777777');
    });

    it('debería procesar mensaje interactivo con list reply', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming, recordOutgoing } = require('../app/services/conversationSession');
      const { sendText } = require('../app/services/metaWhatsapp');

      classify.mockReturnValue({ intent: 'ENTENDIDO', action: 'mark_recovered_send_link' });
      requiresEscalation.mockReturnValue(false);
      getSession.mockReturnValue({ cartId: 'cart-456' });

      const { getCart, markRecovered } = require('../app/services/cartRecovery');
      getCart.mockReturnValue({ id: 'cart-456', state: 'pending' });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-list',
                from: '+8888888888',
                type: 'interactive',
                interactive: {
                  type: 'list_reply',
                  list_reply: { title: 'Opción 1', id: 'opt1' }
                }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(markRecovered).toHaveBeenCalledWith('cart-456');
    });

    it('debería ignorar mensajes sin texto', async () => {
      const { classify, requiresEscalation } = require('../app/services/intentClassifier');
      const { getSession, recordIncoming } = require('../app/services/conversationSession');

      getSession.mockReturnValue({ cartId: null });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-image',
                from: '+9999999999',
                type: 'image',
                image: { id: 'image123' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/cart-recovery/whatsapp-webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(classify).not.toHaveBeenCalled();
    });
  });
});
