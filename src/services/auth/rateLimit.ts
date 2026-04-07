/**
 * lib/auth/rateLimit.ts
 *
 * Sliding-window rate limiter with three tiers:
 *   1. Redis          – preferred (production)
 *   2. Prisma / PostgreSQL – fallback when Redis is unconfigured
 *   3. In-memory map  – last resort so the route never crashes (dev / CI)
 *
 * Usage:
 *   const result = await rateLimit(key, { limit: 5, windowMs: 60_000 });
 *   if (!result.allowed) { return 429; }
 */

import { prisma } from "@/lib/prisma";
import { logError } from "@/infrastructure/logger";
import { getRedisClient, hasRedisConfig } from "@/lib/redis";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
    /** Maximum number of requests allowed within the window. */
    limit: number;
    /** Window duration in milliseconds. */
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfterMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 – Redis
// ─────────────────────────────────────────────────────────────────────────────

async function redisRateLimit(
    key: string,
    opts: RateLimitOptions
): Promise<RateLimitResult> {
    const redis = getRedisClient();
    if (!redis) throw new Error("Redis client unavailable");

    const windowKey = `ratelimit:${key}`;
    const windowSeconds = Math.ceil(opts.windowMs / 1000);

    const count = await redis.incr(windowKey);
    await redis.expire(windowKey, windowSeconds);

    const resetAt = new Date(Date.now() + opts.windowMs);
    const remaining = Math.max(0, opts.limit - count);
    const allowed = count <= opts.limit;

    return {
        allowed,
        remaining,
        resetAt,
        retryAfterMs: allowed ? 0 : opts.windowMs,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 – Prisma / PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

async function dbRateLimit(
    key: string,
    opts: RateLimitOptions
): Promise<RateLimitResult> {
    const now = new Date();
    const windowKey = `ratelimit:${key}`;

    const existing = await prisma.rateLimitEntry.findUnique({
        where: { key: windowKey },
    });

    let count: number;
    let resetAt: Date;

    if (!existing || existing.resetAt <= now) {
        resetAt = new Date(now.getTime() + opts.windowMs);
        const entry = await prisma.rateLimitEntry.upsert({
            where: { key: windowKey },
            update: { count: 1, resetAt },
            create: { key: windowKey, count: 1, resetAt },
        });
        count = entry.count;
    } else {
        const entry = await prisma.rateLimitEntry.update({
            where: { key: windowKey },
            data: { count: { increment: 1 } },
        });
        count = entry.count;
        resetAt = existing.resetAt;
    }

    const remaining = Math.max(0, opts.limit - count);
    const allowed = count <= opts.limit;

    return {
        allowed,
        remaining,
        resetAt,
        retryAfterMs: allowed ? 0 : Math.max(0, resetAt.getTime() - now.getTime()),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3 – In-memory (never throws, always available)
// ─────────────────────────────────────────────────────────────────────────────

interface MemoryWindow {
    count: number;
    resetAt: number;
}

const memoryStore = new Map<string, MemoryWindow>();

// Clean up expired windows every 60 seconds to prevent unbounded memory growth.
setInterval(() => {
    const now = Date.now();
    for (const [key, win] of memoryStore) {
        if (win.resetAt <= now) memoryStore.delete(key);
    }
}, 60_000);

function memoryRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const existing = memoryStore.get(key);

    let count: number;
    let resetAt: number;

    if (!existing || existing.resetAt <= now) {
        resetAt = now + opts.windowMs;
        count = 1;
        memoryStore.set(key, { count, resetAt });
    } else {
        count = existing.count + 1;
        resetAt = existing.resetAt;
        memoryStore.set(key, { count, resetAt });
    }

    const remaining = Math.max(0, opts.limit - count);
    const allowed = count <= opts.limit;

    return {
        allowed,
        remaining,
        resetAt: new Date(resetAt),
        retryAfterMs: allowed ? 0 : Math.max(0, resetAt - now),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
//
// Failure policy (intentional, security-first):
//   PRODUCTION  – fail-closed: any infrastructure error propagates as an
//                 exception so the calling route returns 500 rather than
//                 silently bypassing rate limiting. This prevents brute-force
//                 attacks from succeeding during a Redis or DB outage.
//                 Alert on the thrown error via your observability platform.
//   DEVELOPMENT – fail-open with fallback: Redis error → DB, DB error → memory.
//                 The in-memory tier is not suitable for production because it
//                 is per-process and does not survive restarts.
// ─────────────────────────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

export async function rateLimit(
    key: string,
    opts: RateLimitOptions
): Promise<RateLimitResult> {
    const hasRedis = hasRedisConfig();

    if (hasRedis) {
        try {
            return await redisRateLimit(key, opts);
        } catch (err) {
            if (isProduction) {
                logError("[rateLimit] Redis unavailable in production — failing closed", err);
                throw err;
            }
            logError("[rateLimit] Redis error, falling back to DB", err);
        }
    }

    try {
        return await dbRateLimit(key, opts);
    } catch (err) {
        if (isProduction) {
            logError("[rateLimit] DB unavailable in production — failing closed", err);
            throw err;
        }
        logError("[rateLimit] DB error, falling back to memory store", err);
    }

    return memoryRateLimit(key, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-configured route limiters
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_RATE_LIMIT: RateLimitOptions = {
    limit: 10,
    windowMs: 15 * 60 * 1000,
};

export const REFRESH_RATE_LIMIT: RateLimitOptions = {
    limit: 30,
    windowMs: 15 * 60 * 1000,
};
