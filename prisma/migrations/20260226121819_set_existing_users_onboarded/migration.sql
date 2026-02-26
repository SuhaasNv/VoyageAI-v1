-- Mark existing users as onboarded so they don't see the first-login modal
UPDATE "users" SET "hasOnboarded" = true WHERE "hasOnboarded" = false;