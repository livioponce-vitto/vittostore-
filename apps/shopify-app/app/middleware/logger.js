// logger.js — Express middleware para logging detallado
// Registra método, URL, status, tiempo de respuesta y errores

function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`;
    if (res.statusCode >= 400) {
      console.error(log);
    } else {
      console.log(log);
    }
  });
  next();
}

// Error handler para logs de errores no capturados
function errorLogger(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { logger, errorLogger };