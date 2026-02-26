-- Partial unique index: prevent duplicate (provider, providerId) when both are set.
-- Email-only users (provider IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "users_provider_providerId_key" ON "users" ("provider", "providerId") WHERE "provider" IS NOT NULL AND "providerId" IS NOT NULL;