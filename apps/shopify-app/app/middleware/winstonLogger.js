// app/middleware/winstonLogger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

function winstonLogger(req, res, next) {
  logger.info({
    message: 'Petición recibida',
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id || null,
    timestamp: new Date().toISOString()
  });
  next();
}

module.exports = { logger, winstonLogger };
