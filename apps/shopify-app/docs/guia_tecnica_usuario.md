# Documentación Técnica y de Usuario

## 1. Introducción

VittoStore Shopify App es una solución para la gestión de campañas, productos, órdenes y recuperación de carritos abandonados en tiendas Shopify. Incluye seguridad avanzada, monitoreo, endpoints REST y flujos automatizados.

---

## 2. Instalación y Despliegue

### Local
1. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPO>
   cd VITTOSTORE
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Copia `.env.example` a `.env` y completa los valores requeridos.
4. Ejecuta en desarrollo:
   ```bash
   npm run dev
   ```
   Accede a `http://localhost:3000`.

### Producción
- Usa HTTPS obligatorio.
- Protege el archivo `.env`.
- Ejecuta:
  ```bash
  npm run build
  npm start
  ```
- Configura dominio y redirecciones en Shopify Partners.

---

## 3. Seguridad y Autenticación
- Todas las rutas sensibles usan el middleware `authSession`.
- Si la sesión expira o no existe, la API responde 401.
- Consulta `docs/privacy_security.md` para checklist de seguridad y privacidad.

---

## 4. Endpoints Principales

| Recurso         | Método | Endpoint                                 | Descripción breve                  |
|-----------------|--------|------------------------------------------|------------------------------------|
| Autenticación   | GET    | /auth?shop=mi-tienda.myshopify.com       | Inicia OAuth/instalación           |
| Productos       | GET    | /products?shop=xxx                       | Lista productos                    |
| Productos       | GET    | /products/:id?shop=xxx                   | Obtiene producto por ID            |
| Productos       | POST   | /products?shop=xxx                       | Crea producto                      |
| Productos       | PUT    | /products/:id?shop=xxx                   | Actualiza producto                 |
| Productos       | DELETE | /products/:id?shop=xxx                   | Elimina producto                   |
| Órdenes         | GET    | /orders?shop=xxx                         | Lista órdenes                      |
| Órdenes         | GET    | /orders/:id?shop=xxx                     | Obtiene orden por ID               |
| Carritos        | GET    | /cart-recovery?shop=xxx                  | Lista carritos abandonados         |
| Carritos        | POST   | /cart-recovery/webhook                   | Webhook de carrito abandonado      |
| Métricas        | GET    | /metrics                                 | Métricas Prometheus                |
| Salud           | GET    | /health                                  | Healthcheck de la app              |

> Consulta [docs/api_endpoints.md](docs/api_endpoints.md) para detalles y ejemplos avanzados.

---

## 5. Flujos Recomendados

### Instalación y autenticación
- Accede a `/auth?shop=midominio.myshopify.com` para instalar la app.
- Shopify redirige a `/auth/callback` tras autorizar.
- El acceso queda protegido y seguro.

### Gestión de productos y órdenes
- Usa `/products` y `/orders` para gestionar tu catálogo y ventas.
- Todos los endpoints requieren el parámetro `shop`.

### Recuperación de carritos abandonados
- Shopify envía eventos a `/cart-recovery/webhook`.
- El bot notifica por WhatsApp y permite marcar carritos como recuperados.

### Webhooks de privacidad
- Shopify envía eventos a `/shopify/webhooks/*` para solicitudes de datos y desinstalación.

---

## 6. Monitoreo y Alertas

- Endpoint `/metrics` compatible con Prometheus.
- Métrica personalizada: `vitto_errors_5xx_total` (errores 5xx).

### Ejemplo de alerta Prometheus

Agrega esto a tu archivo de reglas de alertas (`alert.rules.yml`):

```
groups:
  - name: vitto-alerts
    rules:
      - alert: MuchosErrores5xx
        expr: increase(vitto_errors_5xx_total[5m]) > 3
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Más de 3 errores 5xx en 5 minutos"
          description: "La app VittoStore está generando demasiados errores 5xx."
```

Configura Alertmanager para recibir notificaciones (email, Slack, etc.) según tus necesidades.

---

## 7. Pruebas

- Ejecuta todos los tests:
  ```bash
  npm test
  ```

---

## 8. Recursos y soporte

- Documentación extendida: [docs/api_endpoints.md](docs/api_endpoints.md)
- Checklist de seguridad y privacidad: [docs/privacy_security.md](docs/privacy_security.md)
- Contacto y soporte: [README.md](README.md)

---

¡Listo para usar y desplegar VittoStore Shopify App con seguridad, monitoreo y documentación clara!
