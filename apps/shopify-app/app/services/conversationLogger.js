// conversationLogger.js
// Registra cada interacción para aprendizaje adaptativo
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../../data/conversations.log');

function logConversation({
  customerId,
  productId,
  message,
  classifiedIntent,
  adaptation,
  response,
  deliveryResult,
  timestamp = Date.now()
}) {
  const entry = {
    timestamp,
    customerId,
    productId,
    message,
    classifiedIntent,
    adaptation,
    response,
    deliveryResult
  };
  fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n', err => {
    if (err) console.error('Logger error:', err);
  });
}

module.exports = { logConversation };
