# VittoStore — Monorepo

Plataforma de e-commerce chilena con automatizacion WhatsApp + Shopify.

## Estructura

```
D:\VITTOSTORE\
├── apps/
│   ├── shopify-app/       # Backend Node.js (Shopify OAuth, webhooks, CSRF)
│   ├── oraculo-backend/   # Backend automatizacion (WhatsApp, alertas financieras)
│   └── theme/             # Tema Shopify Liquid
├── docs/
│   ├── manuales/
│   │   ├── ENDPOINTS.md   # Referencia completa de endpoints
│   │   └── FAQ.md         # Errores comunes + soluciones
│   └── seguridad/
│       └── CHECKLIST_USABILIDAD_SEGURIDAD.md
└── infra/                 # Docker + Nginx + Prometheus
```

## Apps

### shopify-app
Backend principal Shopify. Maneja OAuth, webhooks, sincronizacion de productos/ordenes, recuperacion de carritos abandonados.
```bash
cd apps/shopify-app && npm install && npm test
```

### oraculo-backend
Motor de automatizacion. Recibe webhooks de Shopify, envia mensajes WhatsApp via Meta Cloud API, gestiona alertas financieras.
```bash
cd apps/oraculo-backend && npm install && npm test && npm run build
```

### theme
Tema Shopify personalizado en Liquid.

## Infraestructura

```bash
# Desarrollo
docker-compose -f infra/docker-compose.yml up

# Produccion
docker-compose -f infra/docker-compose.prod.yml up -d
```

## Tests

```bash
# shopify-app: 11 suites, 17 tests
cd apps/shopify-app && npm test

# oraculo-backend: 1 suite, 8 tests
cd apps/oraculo-backend && npm test
```

## Notas de arquitectura

- `apps/oraculo-backend/` tiene historial git independiente
- WhatsApp: Meta Cloud API (no Baileys local)
- Sesiones Shopify: SQLite en `config/sessions/` (excluido de git)