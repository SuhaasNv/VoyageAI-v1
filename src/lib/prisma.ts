import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/infrastructure/env";
import dns from "node:dns";

// Fix Node fetch/connection IPv6 latency issue
if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
}

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pgPool: Pool | undefined;
};

function createPrismaClient() {
    if (!globalForPrisma.pgPool) {
        const rawConnectionString = env.DATABASE_URL;
        const connectionString = rawConnectionString
            .replace(/[&?]sslmode=[^&?#]*/g, "")
            .replace(/[?&]$/, "");

        globalForPrisma.pgPool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
        });
    }

    const adapter = new PrismaPg(globalForPrisma.pgPool);

    return new PrismaClient({
        adapter,
        log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
