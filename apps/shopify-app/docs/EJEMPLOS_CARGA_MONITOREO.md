# Ejemplo de Script de Carga para k6

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 }, // 10 usuarios en 30s
    { duration: '1m', target: 50 },  // sube a 50 usuarios
    { duration: '30s', target: 0 },  // baja a 0
  ],
};

export default function () {
  const res = http.get('http://localhost:3000/products');
  check(res, {
    'status es 200': (r) => r.status === 200,
  });
  sleep(1);
}
```

---

# Ejemplo de Configuración de Monitoreo

## 1. Integración básica con Prometheus y Grafana
- Expón métricas en un endpoint `/metrics` usando librerías como `prom-client`:

```js
// server.js
const client = require('prom-client');
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```
- Configura Prometheus para scrapear `http://tu-app:3000/metrics` y visualiza en Grafana.

## 2. Monitoreo de errores con Sentry

```js
// server.js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

Estas plantillas te ayudarán a simular carga y monitorear tu app en producción.
