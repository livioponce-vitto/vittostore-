# NotificationJob

Este job permite separar y centralizar la lógica de envío de notificaciones de carritos abandonados, facilitando su ejecución manual, automatizada o desde otros servicios.

## Ubicación
`app/jobs/NotificationJob.js`

## Uso básico

```js
const NotificationJob = require('../jobs/NotificationJob');

// Ejecutar para todos los carritos de todas las tiendas
NotificationJob.run();

// Ejecutar solo para una tienda específica
NotificationJob.run({ shop: 'midominio.myshopify.com' });
```

## Métodos

- `NotificationJob.run(options)`
  - Ejecuta el job para todos los carritos pendientes o filtrados por tienda.
  - Parámetros:
    - `shop` (opcional): dominio de la tienda a procesar.
    - `logger` (opcional): objeto logger (por defecto, console).

- `NotificationJob.processCart(cart, logger)`
  - Procesa un carrito individual y envía la notificación correspondiente según el estado.


## Integración automática con cron

Puedes automatizar la ejecución usando node-cron:

```js
// app/jobs/notificationCron.js
const cron = require('node-cron');
const NotificationJob = require('./NotificationJob');
cron.schedule('0 * * * *', async () => {
  await NotificationJob.run();
});
```

## Ejecución manual

Para pruebas o debugging, ejecuta:

```bash
node app/jobs/runNotificationJob.js
```

Esto ejecutará el job una vez y mostrará el resultado por consola.

---

> Para detalles de los estados y lógica de negocio, revisa `app/services/cartRecovery.js`.
