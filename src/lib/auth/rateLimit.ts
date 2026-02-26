/**
 * lib/auth/rateLimit.ts
 *
 * Sliding-window rate limiter with three tiers:
 *   1. Upstash Redis  – preferred (production)
 *   2. Prisma / PostgreSQL – fallback when Redis is unconfigured
 *   3. In-memory map  – last resort so the route never crashes (dev / CI)
 *
 * Usage:
 *   const result = await rateLimit(key, { limit: 5, windowMs: 60_000 });
 *   if (!result.allowed) { return 429; }
 */

import { prisma } from "@/lib/prisma";

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
// Tier 1 – Upstash Redis
// ─────────────────────────────────────────────────────────────────────────────

async function redisRateLimit(
    key: string,
    opts: RateLimitOptions
): Promise<RateLimitResult> {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const windowKey = `ratelimit:${key}`;
    const windowSeconds = Math.ceil(opts.windowMs / 1000);

    const pipeline = redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, windowSeconds);
    const [count] = (await pipeline.exec()) as [number, number];

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
// Public API – cascades through tiers, never throws
// ─────────────────────────────────────────────────────────────────────────────

export async function rateLimit(
    key: string,
    opts: RateLimitOptions
): Promise<RateLimitResult> {
    const hasUpstash =
        !!process.env.UPSTASH_REDIS_REST_URL &&
        !!process.env.UPSTASH_REDIS_REST_TOKEN;

    if (hasUpstash) {
        try {
            return await redisRateLimit(key, opts);
        } catch (err) {
            console.error("[rateLimit] Upstash error, falling back:", err);
        }
    }

    try {
        return await dbRateLimit(key, opts);
    } catch (err) {
        console.error("[rateLimit] DB error, falling back to memory store:", err);
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
