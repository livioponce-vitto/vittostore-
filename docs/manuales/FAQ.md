# FAQ — Errores Comunes y Soluciones

## Shopify App

### "No hay sesion para la tienda: xxx.myshopify.com" (401)
**Causa:** La app no está instalada en esa tienda o la sesión expiró.
**Solución:** Visita `/auth?shop=xxx.myshopify.com` para reinstalar.

### "Sesión expirada" (401)
**Causa:** Pasaron más de 60 días desde la instalación.
**Solución:** Re-autenticar vía `/auth?shop=xxx`.

### "Invalid CSRF token" (403)
**Causa:** Falta cookie `__Host-vitto-csrf-token` o header de CSRF.
**Solución:** Hacer un GET previo para que el servidor setee la cookie.

### "Demasiadas peticiones..." (429)
**Causa:** Rate limit excedido (200/15min general, 10/15min para `/auth` y `/shopify/sync`).
**Solución:** Esperar 15 minutos.

### "Payload invalido" (400) con `issues[]`
**Causa:** Validación Zod fallida.
**Solución:** Revisar el campo señalado en `issues[i].path`.

---

## Oráculo Backend

### "Invalid HMAC" (401) en `/webhook`
**Causa:** Falta header `x-shopify-hmac-sha256` o no coincide con `SHOPIFY_WEBHOOK_SECRET`.
**Solución:** Verificar variable de entorno y que la firma se calcule con el body raw.

### "Unauthorized" (401) en `/finance-alert`
**Causa:** Header `x-finance-alert-token` ausente o no coincide con `FINANCE_ALERT_TOKEN`.
**Solución:** Configurar la variable en Google Apps Script.

### "WHATSAPP_DISCONNECTED" en `/health`
**Causa:** Sesión de WhatsApp (Baileys) caída.
**Solución:** Revisar logs, re-scanear QR si es necesario.

### "QUEUE_OVERLOAD: N" en `/health`
**Causa:** Cola de mensajes > umbral (default 20).
**Solución:** Investigar fallos de envío; revisar conexión WhatsApp.

---

## Deployment

### "Cannot find module './services/sessionStorage'" al arrancar
**Causa:** Falta `npm install` o build no compilado.
**Solución:**
- shopify-app: `npm ci`
- oraculo-backend: `npm ci && npm run build && npm run start:prod`

### Tests fallan con "Cannot read properties of undefined (reading '__Host-vitto-csrf-token')"
**Causa:** Tests sin cookie-parser o sin bypass CSRF.
**Solución:** Asegurar `NODE_ENV=test` (ya configurado en `tests/setup.js`).