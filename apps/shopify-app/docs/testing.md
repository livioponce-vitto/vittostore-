# Guía de Pruebas de Integración y Validación

## 1. Verifica configuración
- Asegúrate que el archivo `.env` tenga credenciales correctas y la URL pública (usa ngrok si es local).

## 2. Instala dependencias y ejecuta la app
```bash
npm install
npm run dev
```

## 3. Instala la app en una tienda de desarrollo Shopify
- Accede a:
  ```
  https://tu-dominio-publico.com/auth?shop=midominio.myshopify.com
  ```
- Completa el flujo de instalación.

## 4. Valida endpoints protegidos
- Accede a:
  - `GET /products?shop=midominio.myshopify.com`
  - `POST /products?shop=midominio.myshopify.com` (crea un producto)
  - `PUT /products/:id?shop=midominio.myshopify.com` (actualiza)
  - `DELETE /products/:id?shop=midominio.myshopify.com` (elimina)
- Repite para endpoints de órdenes y carritos.

## 5. Simula eventos de carrito abandonado
- Abandona un checkout en el admin de Shopify.
- Verifica que `/cart-recovery/webhook` lo reciba y procese.
- Revisa notificaciones y estados en `/cart-recovery?shop=midominio.myshopify.com`.

## 6. Valida webhooks de privacidad y desinstalación
- Desinstala la app desde la tienda y verifica que `/shopify/webhooks/app/uninstalled` limpie la sesión.
- Prueba endpoints de privacidad con Postman:
  - `POST /shopify/webhooks/customers/data_request`
  - `POST /shopify/webhooks/customers/redact`
  - `POST /shopify/webhooks/shop/redact`

## 7. Revisa los logs
- Verifica en consola que los logs de errores, advertencias y operaciones se registran correctamente.

---

## Ejemplos de comandos para automatizar pruebas

### Usando curl

```bash
# Obtener productos
curl "https://tu-dominio-publico.com/products?shop=midominio.myshopify.com"

# Crear producto
curl -X POST "https://tu-dominio-publico.com/products?shop=midominio.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{"title":"Producto Test","body_html":"<strong>Descripción</strong>"}'

# Simular webhook de carrito abandonado
curl -X POST "https://tu-dominio-publico.com/cart-recovery/webhook" \
  -H "Content-Type: application/json" \
  -d '{"id":123,"abandoned_checkout_url":"https://...","email":"test@shop.com"}'
```

### Usando Postman
- Importa los endpoints y prueba con distintos métodos y payloads.
- Guarda colecciones para repetir pruebas fácilmente.

---

> Para pruebas automatizadas más avanzadas, puedes integrar frameworks como Jest, Mocha o supertest.
