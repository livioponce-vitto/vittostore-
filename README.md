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

## Docker Development

The project uses Docker Compose for local development and production deployment. All services (Node app, PostgreSQL, Redis) are orchestrated with health checks and automatic dependency management.

### Setup

1. **Environment variables**: Copy `.env.docker` to `.env` and configure as needed
   ```bash
   cp .env.docker .env
   ```

2. **Build and start services**:
   ```bash
   # Build multi-stage image and start all services
   docker-compose build
   docker-compose up
   ```
   - App: http://localhost:3000 (health check: `GET /health`)
   - PostgreSQL: localhost:5432 (credentials in .env)
   - Redis: localhost:6379

3. **Run tests in container**:
   ```bash
   docker-compose exec app npm test
   ```

4. **Rebuild after code changes**:
   ```bash
   docker-compose up --build
   ```

5. **View logs**:
   ```bash
   docker-compose logs -f app
   ```

6. **Stop all services**:
   ```bash
   docker-compose down
   # Clean volumes (removes persistent data):
   docker-compose down -v
   ```

### Architecture

- **Dockerfile**: Multi-stage build (builder → runtime), Alpine-based, non-root user (nodejs), dumb-init for signal handling
- **docker-compose.yml**: Production-ready services with health checks and dependency ordering
- **docker-compose.override.yml**: Local development overrides (live reload, mounted source)
- **.dockerignore**: Excludes build artifacts, env files, git history

## Infraestructura (Legacy)

Legacy infra reference (replaced by Docker Compose):
```bash
# Old development setup
docker-compose -f infra/docker-compose.yml up

# Old production setup
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