-- Remove unused in-app notifications table (no writers in app; API was read-only).
DROP TABLE IF EXISTS "notifications";

-- Prisma had an unused enum; refresh_tokens.family is TEXT, not this type.
DROP TYPE IF EXISTS "TokenFamily";
