-- CreateTable
CREATE TABLE "StockReconciliation" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "locationId" UUID NOT NULL,
    "checked" INTEGER NOT NULL,
    "discrepancyCount" INTEGER NOT NULL,
    "discrepancies" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationHeartbeat" (
    "source" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "IntegrationHeartbeat_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReconciliation_eventId_key" ON "StockReconciliation"("eventId");

-- CreateIndex
CREATE INDEX "StockReconciliation_createdAt_idx" ON "StockReconciliation"("createdAt");

