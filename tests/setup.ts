/**
 * tests/setup.ts
 *
 * Global Vitest setup file — runs before any test module is imported.
 * Loads the project's .env file into process.env so that @/infrastructure/env
 * and @/lib/prisma initialise correctly when imported by E2E tests.
 */
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from the project root (same directory vitest runs from)
config({ path: resolve(process.cwd(), ".env") });
