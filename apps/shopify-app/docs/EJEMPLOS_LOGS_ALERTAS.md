# Ejemplos de Logs Estructurados y Alertas Automáticas

## 1. Logs estructurados en formato JSON (usando Winston)

```js
// Instalación: npm install winston
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Uso en la app:
logger.info({
  message: 'Usuario autenticado',
  userId: req.user?.id,
  endpoint: req.originalUrl,
  timestamp: new Date().toISOString()
});
```

## 2. Ejemplo de alerta automática con Prometheus Alertmanager

- Define una regla en Prometheus:

```yaml
# alert.rules.yml
 groups:
   - name: vitto_alerts
     rules:
       - alert: HighErrorRate
         expr: increase(http_requests_total{status=~"5.."}[5m]) > 10
         for: 5m
         labels:
           severity: critical
         annotations:
           summary: "Alta tasa de errores 5xx en VITTOSTORE"
           description: "Más de 10 errores 5xx en 5 minutos."
```

- Configura Alertmanager para enviar notificaciones (correo, Slack, etc.) cuando se active la alerta.

---

Estos ejemplos te ayudarán a registrar eventos de forma estructurada y recibir alertas automáticas ante incidentes críticos.
