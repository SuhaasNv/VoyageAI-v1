-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costEstimateUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "endpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_logs_provider_idx" ON "ai_usage_logs"("provider");

-- CreateIndex
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_requestId_idx" ON "ai_usage_logs"("requestId");
