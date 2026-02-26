/**
 * src/lib/rateLimiter.ts
 *
 * Rate limiter for VoyageAI AI endpoints.
 *
 * Production: Upstash Redis required. No in-memory fallback.
 * Development: Falls back to in-process Map when Redis is absent or unavailable.
 *
 * Configuration (environment variables)
 * --------------------------------------
 *   UPSTASH_REDIS_REST_URL    – Upstash Redis REST endpoint URL (required in production)
 *   UPSTASH_REDIS_REST_TOKEN  – Upstash Redis REST auth token (required in production)
 *   RATE_LIMIT_MAX            – Max requests per window (default: 30)
 *   RATE_LIMIT_WINDOW_SEC     – Window size in seconds   (default: 60)
 */

import { logInfo } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX ?? "30", 10);
const WINDOW_SEC = parseInt(process.env.RATE_LIMIT_WINDOW_SEC ?? "60", 10);

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
    readonly status = 429;
    readonly code = "RATE_LIMIT_EXCEEDED";

    constructor(key: string, limit: number, windowSec: number) {
        super(
            `Rate limit of ${limit} requests per ${windowSec}s exceeded for key "${key}"`
        );
        this.name = "RateLimitError";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis backend  (Upstash)
// ─────────────────────────────────────────────────────────────────────────────

async function redisCheckRateLimit(key: string): Promise<void> {
    const { Redis } = await import("@upstash/redis");

    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const redisKey = `rl:${key}`;

    // Atomic INCR + EXPIRE via pipeline – single round-trip.
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, WINDOW_SEC);
    const [count] = (await pipeline.exec()) as [number, ...unknown[]];

    if (count > MAX_REQUESTS) {
        throw new RateLimitError(key, MAX_REQUESTS, WINDOW_SEC);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fallback backend  (single-process, dev / CI only)
// ─────────────────────────────────────────────────────────────────────────────

interface MemoryBucket {
    count: number;
    expiresAt: number; // epoch ms
}

const memoryStore = new Map<string, MemoryBucket>();

function memoryCheckRateLimit(key: string): void {
    const now = Date.now();
    const bucket = memoryStore.get(key);

    if (!bucket || bucket.expiresAt <= now) {
        // New or expired bucket – start fresh.
        memoryStore.set(key, { count: 1, expiresAt: now + WINDOW_SEC * 1000 });
        return;
    }

    if (bucket.count >= MAX_REQUESTS) {
        throw new RateLimitError(key, MAX_REQUESTS, WINDOW_SEC);
    }

    bucket.count += 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

/**
 * Enforces a sliding-window rate limit for the given key.
 *
 * Key format:  ai:<userId>:<endpoint>
 *
 * In production: Redis required. No in-memory fallback.
 *
 * @throws {RateLimitError} if the limit is exceeded  (HTTP 429)
 * @throws {Error} in production if Redis is absent or unavailable
 */
export async function checkRateLimit(key: string): Promise<void> {
    const hasRedis =
        !!process.env.UPSTASH_REDIS_REST_URL &&
        !!process.env.UPSTASH_REDIS_REST_TOKEN;

    if (isProduction) {
        if (!hasRedis) {
            throw new Error(
                "Rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production"
            );
        }
        try {
            await redisCheckRateLimit(key);
            return;
        } catch (err) {
            if (err instanceof RateLimitError) throw err;
            throw err;
        }
    }

    if (hasRedis) {
        try {
            await redisCheckRateLimit(key);
            return;
        } catch (err) {
            if (err instanceof RateLimitError) throw err;
            logInfo("[rateLimiter] Redis error, falling back to in-memory", { err, level: "warn" });
        }
    }

    memoryCheckRateLimit(key);
}
