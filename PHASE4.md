# VittoStore Phase 4: Application Server

## Overview

Phase 4 initializes the main Express application server, integrating all Phase 1-3 components:
- Pre-commit governance gates + CI/CD workflows
- Prisma schema with DB constraints
- Runtime services (Audit, Vault, Logger, Payment, Factura)
- API endpoints (Orders, Dashboard)

## Architecture

```
src/
├── app.ts              # Express app initialization + middleware
├── server.ts           # Server entry point (listen on PORT)
├── db.ts               # Prisma client singleton
├── middleware/
│   └── governance.ts   # HMAC validation, requireAccounting, audit context
├── routes/
│   ├── orders.ts       # Order webhook, SII submission, audit trails
│   └── dashboard.ts    # Dashboard stats, DLQ management, batch retry
├── services/
│   ├── AuditService.ts         # Audit logging (30-year retention)
│   ├── VaultService.ts         # AES-256-GCM encryption/decryption
│   ├── Logger.ts               # PII redaction
│   ├── PaymentService.ts       # Banco Chile tokenization
│   └── FacturaService.ts       # SII factura lifecycle + immutability
└── types.ts            # Express type extensions
```

## Files Created

### app.ts
- Express server initialization
- Middleware stack: JSON parsing, request logging
- Router mounting: `/orders`, `/dashboard`
- Health check endpoint: `GET /health`
- 404 + error handling middleware
- Graceful shutdown (SIGTERM/SIGINT)

### server.ts
- Entry point for `npm start`
- Listens on `PORT` (default 3000)
- Logs startup with environment info

### db.ts
- Prisma client singleton
- Query logging in development
- Error/warn event handlers
- Global instance reuse for HMR

### middleware/governance.ts (Updated)
- `validateWebhookSignature`: HMAC-SHA256 validation with timing-safe comparison
- `requireAccounting`: Role-based access control, audit context injection
- `requireFacturaNotSigned`: Immutability enforcement (blocks SIGNED/VOIDED updates)
- Type definitions: `AuditContext`, `WebhookRequest`

### .env.example
- Documents all required environment variables
- Database, Vault, Webhook, Banco Chile, SII, Logging settings

### tsconfig.json
- Strict mode enabled (all strictness flags)
- Target ES2020
- Source maps + declaration files for debugging
- No implicit any/this, unused variables flagged

## Setup & Configuration

### 1. Install Dependencies
```bash
npm install express
npm install -D @types/express typescript ts-node
npm install @prisma/client
npm install dotenv
```

### 2. Environment Variables
```bash
cp .env.example .env
# Edit .env with your values:
# - DATABASE_URL: PostgreSQL connection string
# - WEBHOOK_SECRET: Min 32 chars for HMAC validation
# - VAULT_ADDR, VAULT_TOKEN: HashiCorp Vault for key rotation
# - BANCO_CHILE_API_URL/KEY: Payment provider
# - SII_API_URL: Chilean tax authority (for production Factura submission)
```

### 3. Database Initialization
```bash
npx prisma migrate dev --name init
```

### 4. Package.json Scripts
```json
{
  "scripts": {
    "start": "node dist/server.js",
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

### 5. Start Server
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Health
- `GET /health` → `{ status: "ok", timestamp }`

### Orders
- `POST /webhook/orders/paid` - Shopify webhook receiver (HMAC validated)
- `POST /orders/:orderId/submit-sii` - Submit factura to SII (requireAccounting)
- `POST /orders/:orderId/void-factura` - Void DRAFT factura (requireAccounting)
- `GET /orders/:orderId/audit-trail` - Compliance audit history (requireAccounting)
- `GET /orders/:orderId/payment-history` - Payment attempts (requireAccounting)
- `GET /orders` - List orders with filtering (requireAccounting)

### Dashboard
- `GET /dashboard/stats` - Revenue, payment success rate, factura breakdown (requireAccounting)
- `GET /dlq/events` - List failed order processing events (requireAccounting)
- `POST /dlq/retry/:eventId` - Manual DLQ retry (requireAccounting)
- `POST /dlq/batch-retry` - Bulk retry with queueIds or retryAll (requireAccounting)
- `GET /dlq/failed` - Permanently failed events (status=FAILED) (requireAccounting)

## Middleware Chain

### Webhook Handler
1. Express.json() parses request body
2. `validateWebhookSignature` checks HMAC-SHA256 signature
3. Route handler receives validated payload

### Accounting Endpoints
1. Express.json() parses request body
2. `requireAccounting` validates role + injects auditContext
3. Route handler uses req.auditContext for audit logging
4. Response returned with audit trail

## Governance Enforcement

### Pre-commit Gates (Phase 1)
- Vault secrets check, Semgrep SAST, Trivy vulnerability scan
- TypeScript strict compilation, ESLint (max-warnings 0), Prettier format check
- Jest unit tests (85% coverage threshold)

### Database Constraints (Phase 2)
- Folio UNIQUE (SII sequential control)
- Payment amount CHECK > 0 (never negative)
- Factura UNIQUE (orderId, merchantId) prevents duplicates
- FOREIGN KEY constraints for referential integrity

### Runtime Enforcement (Phase 3-4)
- Webhook HMAC validation (timing-safe comparison)
- Factura immutability check (blocks updates to SIGNED/VOIDED)
- AuditLog on all financial mutations (userId, oldValues, newValues)
- PII redaction in logs (email, phone, RUT patterns)
- Payment tokenization enforcement (token_* format only, reject plaintext)

## Next Steps

**Phase 5: Unit Tests**
- Tests for Orders endpoints (webhook, submit, void, audit, payment history)
- Tests for Dashboard endpoints (stats, DLQ events, retry, batch retry)
- Mock Prisma client, PaymentService, FacturaService
- Coverage target: 85% branches/functions/lines/statements

**Phase 6: DLQ Retry Worker**
- Cron job runs every 5 minutes
- Processes PENDING DLQEvents with retryCount < maxRetries
- Exponential backoff for nextRetryAt
- Updates status to FAILED on max retries exceeded

**Phase 7: Banco Chile & SII Integration**
- Replace placeholder API calls with real integrations
- PaymentService.callBancoChile() → tokenization API
- FacturaService.submitToSII() → SII XML submission

## Compliance Notes

- **Encryption**: All PII (email, phone, RUT) encrypted at rest with AES-256-GCM
- **Audit Trail**: 30-year retention (7 years hot DB, 8-30 years cold archive)
- **Immutability**: Factura records locked after SII SIGNED status (void-only cancellation)
- **Idempotency**: Payment transactionId unique per order (prevents duplicate charges)
- **Security**: HMAC-SHA256 webhook validation, timing-safe comparison, no plaintext cards
