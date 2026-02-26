import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

// pg v8 maps sslmode=require → verify-full (their security upgrade, see warning).
// Strip sslmode from the URL so pg-connection-string doesn't override the
// explicit ssl config below, then re-enable SSL with rejectUnauthorized:false
// so Supabase's intermediate CA is accepted while the connection stays encrypted.
const connectionString = rawConnectionString
    .replace(/[&?]sslmode=[^&?#]*/g, "")
    .replace(/[?&]$/, "");

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log:
            env.NODE_ENV === "development"
                ? ["error", "warn"]
                : ["error"],
    });

if (env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
