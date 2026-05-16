# Checklist de Validación de Integraciones Shopify

## Webhooks
- [ ] Todos los endpoints de webhooks están activos y accesibles desde Shopify.
- [ ] Se valida correctamente la firma HMAC de Shopify.
- [ ] Se reciben y procesan eventos de prueba (creación de orden, actualización de producto, etc.).
- [ ] Se registran logs de cada evento recibido y procesado.

## Flujos de compra
- [ ] Las órdenes de prueba en Shopify se reflejan en la app.
- [ ] Los cambios de estado (pagado, enviado, cancelado) se sincronizan correctamente.
- [ ] Se manejan correctamente los reintentos y duplicados de eventos.

## Sincronización de productos y órdenes
- [ ] La importación inicial de productos y órdenes funciona sin errores.
- [ ] Las actualizaciones en Shopify (altas, bajas, cambios) se reflejan en la app.
- [ ] Los datos se mantienen consistentes entre Shopify y la app.

---

# Ejemplo de prueba automatizada para un webhook (Jest + Supertest)

```js
const request = require('supertest');
const app = require('../server');
const crypto = require('crypto');

describe('Webhook Shopify - Orden creada', () => {
  it('debe validar HMAC y procesar evento', async () => {
    const payload = JSON.stringify({ id: 123, total_price: '100.00' });
    const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(payload)
      .digest('base64');
    const res = await request(app)
      .post('/shopify/webhooks/orders/create')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .send(payload);
    expect(res.statusCode).toBe(200);
    // Puedes agregar más validaciones según la lógica de tu app
  });
});
```

---

Esta checklist y ejemplo te ayudarán a validar y automatizar la integración con Shopify.
