# VittoStore — Documentación de Endpoints

> Auto-generado: 2026-05-16. Actualizar manualmente al añadir endpoints.

## App Shopify (`apps/shopify-app/`) — Puerto 3000

### Salud y estado
| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | No | Healthcheck simple |
| GET | `/status?shop=xxx` | No | Estado del servidor + sesión (alias de `/me`) |
| GET | `/metrics` | No | Métricas Prometheus |

### Autenticación Shopify (OAuth)
| Método | Path | Rate-limit | Descripción |
|---|---|---|---|
| GET | `/auth?shop=xxx` | Estricto (10/15m) | Inicia flujo OAuth |
| GET | `/auth/callback` | Estricto | Callback de Shopify |

### Productos
| Método | Path | Body | Descripción |
|---|---|---|---|
| GET | `/products?shop=xxx` | — | Lista productos |
| GET | `/products/:id?shop=xxx` | — | Obtiene producto |
| POST | `/products?shop=xxx` | `{ title, ... }` | Crea producto |
| PUT | `/products/:id?shop=xxx` | `{ ... }` | Actualiza |
| DELETE | `/products/:id?shop=xxx` | — | Elimina |

### Órdenes
| Método | Path | Body | Validación |
|---|---|---|---|
| GET | `/orders?shop=xxx&status=any` | — | — |
| GET | `/orders/:id?shop=xxx` | — | — |
| PUT | `/orders/:id?shop=xxx` | `orderUpdateSchema` | Zod |
| POST | `/orders/:id/close?shop=xxx` | `orderCloseSchema` | Zod |
| POST | `/orders/:id/cancel?shop=xxx` | — | — |

### Campañas
| Método | Path | Validación |
|---|---|---|
| GET | `/campaigns?shop=xxx` | — |
| POST | `/campaigns?shop=xxx` | `campaignCreateSchema` (Zod) |
| PUT | `/campaigns/:id?shop=xxx` | `campaignUpdateSchema` (Zod) |

### Recuperación de carrito
| Método | Path | Validación |
|---|---|---|
| POST | `/cart-recovery/:id/trigger` | `cartTriggerSchema` (Zod) |

### Webhooks Shopify (HMAC validation, sin CSRF)
- `POST /shopify/webhooks/orders/paid`
- `POST /shopify/webhooks/orders/create`
- `POST /shopify/webhooks/orders/cancelled`
- `POST /shopify/webhooks/products/create`
- `POST /shopify/webhooks/products/update`
- `POST /shopify/webhooks/customers/create`
- `POST /shopify/webhooks/app/uninstalled`
- `POST /shopify/webhooks/app/scopes_update`
- GDPR: `customers/data_request`, `customers/redact`, `shop/redact`

### Sincronización
| Método | Path | Rate-limit |
|---|---|---|
| POST | `/shopify/sync` | Estricto (10/15m) |

---

## Oráculo Backend (`apps/oraculo-backend/`) — Puerto 3000

| Método | Path | Auth | Rate-limit |
|---|---|---|---|
| GET | `/health` | No | General (100/15m) |
| POST | `/webhook` | HMAC Shopify | Estricto (20/15m) |
| GET | `/finance-alert/ping` | No | General |
| POST | `/finance-alert` | Header `x-finance-alert-token` | Estricto (20/15m) |

---

## Códigos de respuesta estándar

| Código | Significado |
|---|---|
| 200 | OK |
| 201 | Recurso creado |
| 400 | Payload inválido (Zod issues en `issues[]`) |
| 401 | Sin sesión / token / HMAC inválido |
| 403 | Permisos insuficientes |
| 429 | Rate limit excedido |
| 500 | Error interno |

Formato de error estándar:
```json
{ "ok": false, "error": "Descripción", "next": "Sugerencia opcional" }
```

---

## Seguridad transversal
- **helmet**: headers HTTP seguros (CSP, HSTS, etc.)
- **cors**: lista blanca de orígenes
- **xss-clean + mongo-sanitize + hpp**: sanitización
- **csrf-csrf**: double-submit cookie (excepto webhooks y tests)
- **express-rate-limit**: 200/15m general, 10/15m estricto (shopify-app)
- **AES-256-GCM**: tokens de sesión Shopify encriptados en disco
- **Winston**: logs estructurados con rotación