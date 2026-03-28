import "dotenv/config";
import { defineConfig } from "prisma/config";

/** Migrations: prefer DIRECT_URL (e.g. Supabase direct); else DATABASE_URL. */
const datasourceUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!datasourceUrl) {
  throw new Error("Set DATABASE_URL or DIRECT_URL for Prisma migrations.");
}

export default defineConfig({
  datasource: {
    url: datasourceUrl,
  },
});
