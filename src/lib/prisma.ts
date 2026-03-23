import { Prisma, PrismaClient } from "@prisma/client";
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

/** True when the generated client includes the AgentExecutionLog delegate (post–schema add). */
function hasAgentExecutionLogDelegate(client: PrismaClient): boolean {
    return (
        typeof (client as unknown as { agentExecutionLog?: { findMany?: unknown } }).agentExecutionLog
            ?.findMany === "function"
    );
}

/** True when the generated client includes AiDecisionLog (explainability layer). */
function hasAiDecisionLogDelegate(client: PrismaClient): boolean {
    return (
        typeof (client as unknown as { aiDecisionLog?: { findMany?: unknown } }).aiDecisionLog?.findMany === "function"
    );
}

/** Current `prisma generate` output includes AiUsageLog.callSucceeded. */
function generatedHasAiUsageCallSucceeded(): boolean {
    try {
        return "callSucceeded" in Prisma.AiUsageLogScalarFieldEnum;
    } catch {
        return false;
    }
}

/**
 * True if this PrismaClient instance was built with the same schema (has callSucceeded on AiUsageLog).
 * Stale global singletons from pre-migration HMR omit new columns → "Unknown argument callSucceeded".
 */
function clientRuntimeHasAiUsageCallSucceeded(client: PrismaClient): boolean {
    const fields = (client as unknown as {
        _runtimeDataModel?: { models?: Record<string, { fields?: unknown }> };
    })._runtimeDataModel?.models?.AiUsageLog?.fields;

    if (fields == null) return false;
    if (Array.isArray(fields)) {
        return fields.some((f: { name?: string }) => f.name === "callSucceeded");
    }
    if (typeof fields === "object") {
        return Object.prototype.hasOwnProperty.call(fields, "callSucceeded");
    }
    return false;
}

/**
 * In development, `globalThis.prisma` can survive across HMR while `prisma generate`
 * adds new models or columns — the cached client then omits delegates / fields and queries crash.
 * Drop the stale singleton and build a fresh client when any expected piece is missing.
 */
function getOrCreatePrisma(): PrismaClient {
    let existing = globalForPrisma.prisma;

    const callSucceededMismatch =
        existing != null
        && generatedHasAiUsageCallSucceeded()
        && !clientRuntimeHasAiUsageCallSucceeded(existing);

    if (callSucceededMismatch) {
        globalForPrisma.prisma = undefined;
        existing = undefined;
    }

    if (existing && hasAgentExecutionLogDelegate(existing) && hasAiDecisionLogDelegate(existing)) {
        return existing;
    }
    if (existing && env.NODE_ENV !== "production") {
        globalForPrisma.prisma = undefined;
    }
    const client = createPrismaClient();
    // Cache on global in all environments so repeated access (e.g. via Proxy below) does not spawn clients.
    globalForPrisma.prisma = client;
    return client;
}

/**
 * Lazy facade: every property access runs delegate checks and returns the current singleton.
 * Fixes dev/HMR where `export const prisma = getOrCreatePrisma()` froze an old client missing new models
 * (e.g. aiDecisionLog) while globalThis was updated elsewhere.
 */
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
        const client = getOrCreatePrisma();
        const value = Reflect.get(client as object, prop, receiver);
        if (typeof value === "function") {
            return value.bind(client);
        }
        return value;
    },
});
