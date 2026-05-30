-- Governance: engineering-data/SKILL.md
-- All models enforce immutability, audit trails, and referential integrity

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "phoneEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_merchantId_idx" ON "User"("merchantId");

-- CreateTable Merchant
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "rutEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "razonSocial" TEXT NOT NULL,
    "giro" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "siiStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Merchant_rut_key" ON "Merchant"("rut");
CREATE UNIQUE INDEX "Merchant_rut_razonSocial_key" ON "Merchant"("rut", "razonSocial");
CREATE INDEX "Merchant_siiStatus_idx" ON "Merchant"("siiStatus");

-- CreateTable Order
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopifyOrderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" VARCHAR(255) NOT NULL,
    "customerEmailEnc" BOOLEAN NOT NULL DEFAULT true,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId");
CREATE UNIQUE INDEX "Order_shopifyOrderId_merchantId_key" ON "Order"("shopifyOrderId", "merchantId");
CREATE INDEX "Order_merchantId_idx" ON "Order"("merchantId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateTable Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "cardToken" TEXT NOT NULL,
    "cardLast4" CHAR(4) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");
CREATE UNIQUE INDEX "Payment_transactionId_merchantId_key" ON "Payment"("transactionId", "merchantId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE CHECK (amount > 0);

-- CreateTable Factura (immutable after SIGNED)
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" BIGINT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "rut" CHAR(12) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "siiResponseCode" TEXT,
    "siiTrackingId" TEXT,
    "xmlContent" TEXT,
    "signatureStatus" TEXT NOT NULL DEFAULT 'UNSIGNED',
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Factura_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT,
    CONSTRAINT "Factura_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Factura_folio_key" ON "Factura"("folio");
CREATE UNIQUE INDEX "Factura_orderId_key" ON "Factura"("orderId");
CREATE UNIQUE INDEX "Factura_siiTrackingId_key" ON "Factura"("siiTrackingId");
CREATE INDEX "Factura_merchantId_idx" ON "Factura"("merchantId");
CREATE INDEX "Factura_status_idx" ON "Factura"("status");

-- CreateTable Boleta
CREATE TABLE "Boleta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "rut" CHAR(12) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Boleta_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Boleta_orderId_key" ON "Boleta"("orderId");
CREATE UNIQUE INDEX "Boleta_merchantId_orderId_key" ON "Boleta"("merchantId", "orderId");

-- CreateTable Settlement
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalRevenue" DECIMAL(10,2) NOT NULL,
    "totalTaxes" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bankTransferId" TEXT,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Settlement_merchantId_period_key" ON "Settlement"("merchantId", "period");
CREATE UNIQUE INDEX "Settlement_bankTransferId_key" ON "Settlement"("bankTransferId");
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateTable LibroMayor (general ledger)
CREATE TABLE "LibroMayor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facturaId" TEXT NOT NULL,
    "account" CHAR(6) NOT NULL,
    "debit" DECIMAL(10,2),
    "credit" DECIMAL(10,2),
    "concept" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibroMayor_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "LibroMayor_facturaId_key" ON "LibroMayor"("facturaId");
CREATE INDEX "LibroMayor_account_idx" ON "LibroMayor"("account");

-- CreateTable AuditLog (30-year retention: 7 years hot, 8-30 years cold)
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "merchantId" TEXT,
    "userId" TEXT,
    "oldValues" JSON,
    "newValues" JSON,
    "changes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL,
    CONSTRAINT "AuditLog_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Order" ("id") ON DELETE CASCADE
);

CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");
CREATE INDEX "AuditLog_merchantId_idx" ON "AuditLog"("merchantId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateTable SyncLog
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "payload" JSON,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "SyncLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE
);

CREATE INDEX "SyncLog_merchantId_idx" ON "SyncLog"("merchantId");
CREATE INDEX "SyncLog_syncType_idx" ON "SyncLog"("syncType");
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateTable DLQEvent
CREATE TABLE "DLQEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" DATETIME,
    CONSTRAINT "DLQEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE
);

CREATE INDEX "DLQEvent_orderId_idx" ON "DLQEvent"("orderId");
CREATE INDEX "DLQEvent_status_idx" ON "DLQEvent"("status");
CREATE INDEX "DLQEvent_nextRetryAt_idx" ON "DLQEvent"("nextRetryAt");
