const request = require('supertest');
const express = require('express');

jest.mock('../app/services/adaptiveBotOrchestrator', () => ({
  handleAdaptiveBot: jest.fn()
}));

const adaptiveBotDemoRouter = require('../app/routes/adaptiveBotDemo');
const { handleAdaptiveBot } = require('../app/services/adaptiveBotOrchestrator');

describe('Adaptive Bot Demo API - Unit Tests', () => {
  let app;
  const testCustomerId = 'customer_123';
  const testWhatsappNumber = '+34912345678';
  const testProductId = 'product_456';
  const testMessage = 'Hola, me interesa el producto';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', adaptiveBotDemoRouter);
    jest.resetAllMocks();

    handleAdaptiveBot.mockImplementation(async (payload) => ({
      ok: true,
      conversationId: 'conv_123',
      message: 'Respuesta del bot',
      action: 'send_whatsapp',
      payload
    }));
  });

  describe('POST /adaptive-bot-demo', () => {
    it('debería procesar mensaje con parámetros requeridos', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.conversationId).toBe('conv_123');
      expect(handleAdaptiveBot).toHaveBeenCalledWith(
        expect.objectContaining({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        })
      );
    });

    it('debería retornar 400 sin message', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('parámetros requeridos');
    });

    it('debería retornar 400 sin customerId', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('parámetros requeridos');
    });

    it('debería retornar 400 sin whatsappNumber', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('parámetros requeridos');
    });

    it('debería aceptar productId opcional', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber,
          productId: testProductId
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(handleAdaptiveBot).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: testProductId
        })
      );
    });

    it('debería retornar respuesta con conversationId y action', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBeDefined();
      expect(res.body.action).toBe('send_whatsapp');
      expect(res.body.message).toBe('Respuesta del bot');
    });

    it('debería retornar 500 si handleAdaptiveBot falla', async () => {
      handleAdaptiveBot.mockRejectedValueOnce(new Error('Service error'));

      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Service error');
    });

    it('debería pasar parámetro productId cuando está ausente', async () => {
      const res = await request(app)
        .post('/adaptive-bot-demo')
        .send({
          message: testMessage,
          customerId: testCustomerId,
          whatsappNumber: testWhatsappNumber
        });

      expect(res.status).toBe(200);
      expect(handleAdaptiveBot).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: undefined
        })
      );
    });
  });
});
