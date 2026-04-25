-- Migration: add_missing_tables_and_columns
-- Adds all schema objects that were introduced after the last tracked migration
-- but were never captured in a migration file (applied via db push / drift).
--
-- Safe to run repeatedly — all statements use IF NOT EXISTS / IF EXISTS guards.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rate_limit_entries  (DB-backed rate-limit fallback)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "rate_limit_entries" (
    "id"        TEXT        NOT NULL,
    "key"       TEXT        NOT NULL,
    "count"     INTEGER     NOT NULL DEFAULT 0,
    "resetAt"   TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_entries_key_key"
    ON "rate_limit_entries"("key");

CREATE INDEX IF NOT EXISTS "rate_limit_entries_key_idx"
    ON "rate_limit_entries"("key");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. trips — add shareToken and status columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "trips"
    ADD COLUMN IF NOT EXISTS "shareToken" TEXT,
    ADD COLUMN IF NOT EXISTS "status"     TEXT NOT NULL DEFAULT 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS "trips_shareToken_key"
    ON "trips"("shareToken");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ai_usage_logs — add callSucceeded nullable column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ai_usage_logs"
    ADD COLUMN IF NOT EXISTS "callSucceeded" BOOLEAN;

CREATE INDEX IF NOT EXISTS "ai_usage_logs_callSucceeded_idx"
    ON "ai_usage_logs"("callSucceeded");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_action_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "admin_action_logs" (
    "id"         TEXT        NOT NULL,
    "actionType" TEXT        NOT NULL,
    "payload"    JSONB,
    "result"     JSONB,
    "success"    BOOLEAN     NOT NULL,
    "userId"     TEXT        NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_action_logs_userId_idx"
    ON "admin_action_logs"("userId");

CREATE INDEX IF NOT EXISTS "admin_action_logs_actionType_idx"
    ON "admin_action_logs"("actionType");

CREATE INDEX IF NOT EXISTS "admin_action_logs_createdAt_idx"
    ON "admin_action_logs"("createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ai_decision_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ai_decision_logs" (
    "id"           TEXT        NOT NULL,
    "decisionType" TEXT        NOT NULL,
    "source"       TEXT        NOT NULL,
    "reasoning"    TEXT        NOT NULL,
    "inputSummary" TEXT        NOT NULL,
    "confidence"   DOUBLE PRECISION,
    "outcome"      TEXT        NOT NULL,
    "requestId"    TEXT,
    "triggeredBy"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decision_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_decision_logs_decisionType_idx"
    ON "ai_decision_logs"("decisionType");

CREATE INDEX IF NOT EXISTS "ai_decision_logs_createdAt_idx"
    ON "ai_decision_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "ai_decision_logs_requestId_idx"
    ON "ai_decision_logs"("requestId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. agent_execution_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "agent_execution_logs" (
    "id"        TEXT         NOT NULL,
    "requestId" TEXT         NOT NULL,
    "agentName" TEXT         NOT NULL,
    "stepIndex" INTEGER      NOT NULL,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "latencyMs" INTEGER      NOT NULL,
    "success"   BOOLEAN      NOT NULL,
    "errorMsg"  TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_execution_logs_requestId_idx"
    ON "agent_execution_logs"("requestId");

CREATE INDEX IF NOT EXISTS "agent_execution_logs_agentName_idx"
    ON "agent_execution_logs"("agentName");

CREATE INDEX IF NOT EXISTS "agent_execution_logs_createdAt_idx"
    ON "agent_execution_logs"("createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. favorite_destinations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "favorite_destinations" (
    "id"          TEXT         NOT NULL,
    "userId"      TEXT         NOT NULL,
    "destination" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_destinations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "favorite_destinations"
    DROP CONSTRAINT IF EXISTS "favorite_destinations_userId_fkey";

ALTER TABLE "favorite_destinations"
    ADD CONSTRAINT "favorite_destinations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "favorite_destinations_userId_destination_key"
    ON "favorite_destinations"("userId", "destination");

CREATE INDEX IF NOT EXISTS "favorite_destinations_userId_idx"
    ON "favorite_destinations"("userId");

CREATE INDEX IF NOT EXISTS "favorite_destinations_destination_idx"
    ON "favorite_destinations"("destination");
