# VittoStore Shopify App

## Endpoints principales
- `/auth` - Autenticación y OAuth Shopify
- `/shopify` - Webhooks y endpoints Shopify
- `/products` - Productos
- `/orders` - Órdenes
- `/dashboard` - Dashboard de la app
- `/campaigns` - Campañas de marketing
- `/channels` - Canales de venta
- `/cart-recovery` - Recuperación de carritos
- `/api` - Demo de bot adaptativo

## Onboarding rápido
1. Clona el repo y copia `.env.example` a `.env`
2. Instala dependencias: `npm install`
3. Inicia el servidor: `npm start`
4. Registra la URL en Shopify Partners
5. Instala la app en tu tienda de prueba

## Documentación
- [docs/api_endpoints.md](docs/api_endpoints.md)
- [docs/privacy_security.md](docs/privacy_security.md)
- [docs/onboarding.md](docs/onboarding.md)
- [docs/deployment.md](docs/deployment.md)

## Checklist de lanzamiento
- [docs/CHECKLIST_FINAL_LANZAMIENTO.md](docs/CHECKLIST_FINAL_LANZAMIENTO.md)

## Contacto
- Soporte: soporte@vittostore.com
- Documentación: https://docs.vittostore.com
## Seguridad y autenticación de rutas

Las rutas protegidas (productos, recuperación de carritos, etc.) usan el middleware `authSession` para validar la sesión y desencriptar el token de acceso antes de acceder a recursos sensibles. Si la sesión está expirada o no existe, la API responde 401.

**Ejemplo:**

```js
const authSession = require("../middleware/authSession");
router.use(authSession); // Protege todas las rutas del recurso
```

O bien, para rutas específicas:

```js
router.get("/", authSession, handler);
```


# VITTOSTORE Shopify App

![VittoStore UI](public/images/logo-original.png.jpg)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)

Aplicación para gestión de campañas, productos, órdenes y recuperación de carritos abandonados en Shopify.

---

## Despliegue Local

1. **Clonar el repositorio:**
	```bash
	git clone <URL_DEL_REPO>
	cd VITTOSTORE
	```
2. **Instalar dependencias:**
	```bash
	npm install
	```
3. **Configurar variables de entorno:**
	- Copia `.env.example` a `.env` y completa los valores requeridos:
	  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `HOST`, etc.
4. **Ejecutar en desarrollo:**
	```bash
	npm run dev
	```
	- Accede a `http://localhost:3000`.

---

## Despliegue en Producción

1. **Configurar entorno seguro:**
	- Usa HTTPS obligatorio.
	- Protege el archivo `.env`.
2. **Build y ejecución:**
	```bash
	npm run build
	npm start
	```
3. **Configurar dominio y redirecciones en Shopify Partners.**

---

## Publicación en Shopify App Store

1. **Cumplir requisitos Shopify:**
	- Verifica el cumplimiento en [`docs/privacy_security.md`](docs/privacy_security.md).
	- Completa la documentación en `docs/`.
2. **Pruebas:**
	- Ejecuta los tests de integración:
	  ```bash
	  npm test
	  ```
3. **Subir la app a Shopify Partners:**
	- Sigue la guía oficial: https://shopify.dev/docs/apps/store/publish
4. **Completar checklist de revisión:**
	- Seguridad, privacidad, endpoints, UI responsive, documentación.

---

## Checklist de Usabilidad, Seguridad y Proactividad

Consulta el archivo `CHECKLIST_USABILIDAD_SEGURIDAD.md` para ver el checklist completo y marcar avances.


**Resumen de puntos clave:**
- Respuestas de error claras y con sugerencia de acción (`next`).
- Endpoints REST predecibles y documentados.
- README con pasos claros y tabla de endpoints (en progreso).
- Panel web accesible, mobile-first y con mensajes de feedback visibles.
- Middlewares de seguridad activos y avanzados:
	- `helmet` (cabeceras HTTP seguras)
	- `cors` (control de orígenes permitidos)
	- `xss-clean` (protección XSS)
	- `express-mongo-sanitize` (protección NoSQL injection)
	- `hpp` (protección contra HTTP Parameter Pollution)
	- `express-rate-limit` (limitación de peticiones por IP)
	- `csurf` (protección CSRF en rutas sensibles)
- Revisar logs, feedback y dependencias periódicamente.
- Automatizar pruebas y monitoreo de métricas.
- **IMPORTANTE:** Si el archivo `.env` no existe, la app mostrará una advertencia y usará `.env.example` como referencia. Nunca subas tus credenciales reales a git.

> Revisa y actualiza el checklist en cada release para mantener la app segura, usable y proactiva.

---

- [Documentación de endpoints](docs/api_endpoints.md)
- [Privacidad y seguridad](docs/privacy_security.md)
- [Guía de pruebas](docs/testing.md)
- [Uso de NotificationJob](docs/notification_job.md)

## Ejemplo visual de la UI

<img src="public/images/vittostore-icon-1200.png" alt="Captura UI" width="200" />

---

- [Documentación de endpoints](docs/api_endpoints.md)
- [Privacidad y seguridad](docs/privacy_security.md)
- [Guía de pruebas](docs/testing.md)
- [Uso de NotificationJob](docs/notification_job.md)



## Tabla de Endpoints Principales

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


## Monitoreo y alertas con Prometheus

La app expone métricas en `/metrics` compatibles con Prometheus. Ejemplo de métrica personalizada:

```
# HELP vitto_errors_5xx_total Total de respuestas 5xx generadas por la app
# TYPE vitto_errors_5xx_total counter
vitto_errors_5xx_total 0
```

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

## Flujos recomendados para usuarios y desarrolladores

1. **Instalación y autenticación:**
	- Accede a `/auth?shop=mi-tienda.myshopify.com` para instalar la app.
	- Completa el flujo OAuth y accede a los recursos protegidos.

2. **Gestión de productos:**
	- Usa `/products` para listar, crear, actualizar o eliminar productos.
	- Siempre incluye el parámetro `shop` en la query.

3. **Recuperación de carritos:**
	- Consulta `/cart-recovery?shop=xxx` para ver carritos pendientes.
	- Usa el webhook `/cart-recovery/webhook` para integración con Shopify.

4. **Monitoreo y salud:**
	- `/metrics` para Prometheus.
	- `/health` para chequeo rápido de estado.

---

## Ejemplos de uso de la API

### Crear producto (curl)
```bash
curl -X POST "http://localhost:3000/products?shop=tu-tienda.myshopify.com" \
		-H "Content-Type: application/json" \
		-d '{"title":"Producto Test","price":1000,"stock":10}'
```

**Respuesta exitosa:**
```json
{
	"ok": true,
	"product": {
		"id": 123456789,
		"title": "Producto Test",
		"price": 1000,
		"stock": 10
	}
}
```

**Respuesta de error (sin sesión):**
```json
{
	"ok": false,
	"error": "No hay sesion para la tienda: tu-tienda.myshopify.com",
	"next": "Instala la app primero en /auth?shop=tu-tienda.myshopify.com"
}
```

### Recuperar carritos (Postman)
- Método: GET
- URL: http://localhost:3000/cart-recovery?shop=tu-tienda.myshopify.com

**Respuesta exitosa:**
```json
{
	"ok": true,
	"carts": [
		{ "id": "abc123", "email": "cliente@ejemplo.com", ... }
	]
}
```

**Respuesta de error:**
```json
{
	"ok": false,
	"error": "Param 'shop' requerido"
}
```

---
- [Documentación de endpoints](docs/api_endpoints.md)
- [Privacidad y seguridad](docs/privacy_security.md)
- [Guía de pruebas](docs/testing.md)
- [Uso de NotificationJob](docs/notification_job.md)
- [Documentación de endpoints](docs/api_endpoints.md)
- [Privacidad y seguridad](docs/privacy_security.md)
- [Guía de pruebas](docs/testing.md)
- [Uso de NotificationJob](docs/notification_job.md)

---

## Soporte
Para dudas o soporte, contacta a: soporte@vittostore.com
