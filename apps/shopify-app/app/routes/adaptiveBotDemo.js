// adaptiveBotDemo.js
// Endpoint demo para probar el flujo adaptativo y envío por WhatsApp

const express = require('express');
const router = express.Router();
const { handleAdaptiveBot } = require('../services/adaptiveBotOrchestrator');

/**
 * POST /api/adaptive-bot-demo
 * Body: { message, customerId, productId, whatsappNumber }
 */
router.post('/adaptive-bot-demo', async (req, res) => {
  const { message, customerId, productId, whatsappNumber } = req.body;
  if (!message || !customerId || !whatsappNumber) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }
  try {
    const result = await handleAdaptiveBot({ message, customerId, productId, whatsappNumber });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
