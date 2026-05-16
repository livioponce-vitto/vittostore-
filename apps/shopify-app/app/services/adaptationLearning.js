// adaptationLearning.js
// Analiza logs y ajusta reglas de adaptación
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../../data/conversations.log');

function analyzeConversations() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  return lines.map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// Ejemplo: detectar si muchos usuarios repiten la misma pregunta
function detectConfusionPatterns() {
  const logs = analyzeConversations();
  const confusion = logs.filter(l => l.classifiedIntent && l.classifiedIntent.confidence < 0.5);
  // Aquí se pueden ajustar reglas, enviar alertas, etc.
  return confusion;
}

module.exports = { analyzeConversations, detectConfusionPatterns };
