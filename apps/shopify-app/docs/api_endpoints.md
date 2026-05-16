# Documentación de Endpoints VittoStore Shopify App

## Endpoints principales

### Autenticación y configuración
- `GET /auth?shop=midominio.myshopify.com` — Inicia el flujo OAuth de instalación.
- `GET /auth/callback` — Callback de OAuth, guarda sesión segura.
- `GET /shopify/config` — Devuelve configuración de la app y scopes.
- `GET /shopify/install?shop=midominio.myshopify.com` — Endpoint de inicio de instalación.

### Productos
- `GET /products?shop=xxx&limit=10&page_info=xxx` — Lista productos con paginación.
- `GET /products/:id?shop=xxx` — Obtiene un producto por ID.
- `POST /products?shop=xxx` — Crea un producto.
- `PUT /products/:id?shop=xxx` — Actualiza un producto.
- `DELETE /products/:id?shop=xxx` — Elimina un producto.

### Órdenes
- `GET /orders?shop=xxx&limit=10&status=any` — Lista órdenes.
- `GET /orders/:id?shop=xxx` — Obtiene una orden por ID.
- `PUT /orders/:id?shop=xxx` — Actualiza una orden.
- `POST /orders/:id/close?shop=xxx` — Cierra una orden.
- `POST /orders/:id/cancel?shop=xxx` — Cancela una orden.

### Carrito abandonado y recuperación
- `POST /cart-recovery/webhook` — Recibe eventos de carritos abandonados desde Shopify.
- `GET /cart-recovery/whatsapp-webhook` — Verificación de webhook de WhatsApp.
- `POST /cart-recovery/whatsapp-webhook` — Recibe mensajes entrantes de WhatsApp.
- `GET /cart-recovery?shop=xxx` — Lista carritos abandonados.
- `GET /cart-recovery/stats?shop=xxx` — Estadísticas de recuperación.
- `GET /cart-recovery/escalations` — Sesiones pendientes de atención humana.
- `POST /cart-recovery/human-takeover` — Marca teléfono como control humano.
- `POST /cart-recovery/human-release` — Devuelve control al bot.
- `POST /cart-recovery/:id/trigger` — Dispara manualmente la secuencia de recuperación.
- `POST /cart-recovery/:id/recovered` — Marca carrito como recuperado.

### Webhooks Shopify
- `POST /shopify/webhooks/app/uninstalled` — App desinstalada.
- `POST /shopify/webhooks/customers/data_request` — Solicitud de datos de cliente.
- `POST /shopify/webhooks/customers/redact` — Redacción de datos de cliente.
- `POST /shopify/webhooks/shop/redact` — Redacción de datos de tienda.

---

## Flujos principales

### 1. Instalación y autenticación
1. El comerciante accede a `/auth?shop=midominio.myshopify.com`.
2. Shopify redirige a `/auth/callback` tras autorizar.
3. Se guarda el token de acceso encriptado y se redirige a la app.

### 2. Recuperación de carrito abandonado
1. Shopify envía evento a `/cart-recovery/webhook`.
2. Se almacena el carrito y se inicia el scheduler de notificaciones.
3. El bot envía mensajes de recuperación por WhatsApp según el estado.
4. El usuario puede interactuar y marcar el carrito como recuperado.

### 3. Webhooks de privacidad
- Shopify envía eventos a los endpoints `/shopify/webhooks/*` para cumplir con solicitudes de datos y desinstalación.

---

> Para detalles de payloads y ejemplos, consulta los archivos de rutas en `app/routes/`.
