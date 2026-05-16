# Validación de Integración Shopify – VittoStore

Esta guía te ayuda a validar que la integración entre tu app VittoStore y Shopify funciona correctamente, cubriendo los puntos críticos para producción y publicación en Shopify App Store.

---

## 1. Pruebas de instalación y autenticación
- Accede a `/auth?shop=midominio.myshopify.com` desde un navegador.
- Completa el flujo OAuth y verifica que la app aparece instalada en el panel de Shopify.
- Confirma que se crea una sesión segura y puedes acceder a recursos protegidos.

## 2. Pruebas de endpoints principales
- Realiza peticiones a `/products`, `/orders`, `/cart-recovery` usando el parámetro `shop`.
- Verifica que los datos retornados corresponden a la tienda conectada.
- Prueba crear, actualizar y eliminar productos y órdenes.

## 3. Webhooks
- Simula eventos de Shopify (desinstalación, privacidad, carritos abandonados) usando la API de Shopify o herramientas como Postman.
- Verifica que los webhooks `/shopify/webhooks/*` y `/cart-recovery/webhook` reciben y procesan correctamente los eventos.
- Consulta logs para confirmar el procesamiento.

## 4. Seguridad y privacidad
- Intenta acceder a endpoints protegidos sin sesión: la API debe responder 401.
- Verifica que los tokens y datos sensibles están cifrados y nunca expuestos en logs o respuestas.
- Consulta el checklist en `docs/privacy_security.md`.

## 5. Monitoreo y métricas
- Accede a `/metrics` y verifica que Prometheus recolecta métricas, incluyendo `vitto_errors_5xx_total`.
- Simula errores 5xx y confirma que la métrica aumenta.

## 6. Pruebas de extremo a extremo (E2E)
- Instala la app en una tienda de prueba de Shopify Partners.
- Realiza un flujo completo: instalación, creación de productos, simulación de carrito abandonado, recuperación y cierre de órdenes.
- Verifica que las notificaciones (ej: WhatsApp) se envían correctamente.

## 7. Checklist para publicación
- Todos los endpoints y webhooks funcionan y están documentados.
- Cumples con los requisitos de seguridad y privacidad de Shopify.
- El monitoreo y alertas están activos.
- La documentación técnica y de usuario está actualizada.

---

**¡Tu integración está lista para producción y revisión en Shopify App Store!**
