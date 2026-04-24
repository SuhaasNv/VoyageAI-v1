/**
 * tests/security/rateLimiter.test.ts
 *
 * Unit tests for src/security/rateLimiter.ts
 *
 * Coverage targets:
 *  - RateLimitError class — properties, name, status code
 *  - checkRateLimit (in-memory path, dev/test environment)
 *  - checkRateLimit (production path: throws when Redis absent, fails-open on infra error)
 *
 * Strategy: use vi.resetModules() + vi.doMock() (not hoisted) so that
 * module-level constants (MAX_REQUESTS, WINDOW_SEC, isProduction) and
 * factory dependencies pick up fresh values per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Default top-level mocks (apply to all non-resetModules tests) ────────────

vi.mock("@/lib/redis", () => ({
    getRedisClient: vi.fn().mockReturnValue(null),
    hasRedisConfig: vi.fn().mockReturnValue(false),
}));

vi.mock("@/infrastructure/logger", () => ({
    logError: vi.fn(),
    logInfo:  vi.fn(),
    logStructured: vi.fn(),
    trunc: vi.fn().mockImplementation((s: string) => s ?? ""),
}));

// ─────────────────────────────────────────────────────────────────────────────
// RateLimitError class
// ─────────────────────────────────────────────────────────────────────────────

describe("RateLimitError", () => {
    it("has the correct class name", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        expect(new RateLimitError("k", 10, 60).name).toBe("RateLimitError");
    });

    it("status property is 429", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        expect(new RateLimitError("k", 10, 60).status).toBe(429);
    });

    it("code property is RATE_LIMIT_EXCEEDED", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        expect(new RateLimitError("k", 10, 60).code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("message contains the limit, window, and key", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        const err = new RateLimitError("my-key", 15, 30);
        expect(err.message).toContain("15");
        expect(err.message).toContain("30");
        expect(err.message).toContain("my-key");
    });

    it("is an instance of Error", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        expect(new RateLimitError("k", 1, 1)).toBeInstanceOf(Error);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRateLimit — in-memory path (NODE_ENV=test, no Redis, default 30 limit)
// ─────────────────────────────────────────────────────────────────────────────

describe("checkRateLimit — in-memory, default limit", () => {
    it("allows the first request without throwing", async () => {
        const { checkRateLimit } = await import("@/security/rateLimiter");
        const key = `test-key-${Date.now()}-${Math.random()}`;
        await expect(checkRateLimit(key)).resolves.toBeUndefined();
    });

    it("allows multiple requests up to the default limit (5 consecutive)", async () => {
        const { checkRateLimit } = await import("@/security/rateLimiter");
        const key = `test-key-${Date.now()}-${Math.random()}`;
        for (let i = 0; i < 5; i++) {
            await expect(checkRateLimit(key)).resolves.toBeUndefined();
        }
    });

    it("different keys have independent buckets", async () => {
        const { checkRateLimit } = await import("@/security/rateLimiter");
        const key1 = `key-a-${Date.now()}-${Math.random()}`;
        const key2 = `key-b-${Date.now()}-${Math.random()}`;
        await checkRateLimit(key1);
        await checkRateLimit(key2);
        await expect(checkRateLimit(key1)).resolves.toBeUndefined();
        await expect(checkRateLimit(key2)).resolves.toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRateLimit — custom low limit via env + resetModules
// Use vi.doMock() (NOT vi.mock()) after vi.resetModules() to avoid hoisting issues.
// ─────────────────────────────────────────────────────────────────────────────

describe("checkRateLimit — in-memory, custom low limit", () => {
    beforeEach(() => {
        vi.stubEnv("RATE_LIMIT_MAX", "3");
        vi.stubEnv("RATE_LIMIT_WINDOW_SEC", "60");
        vi.resetModules();
        vi.doMock("@/lib/redis", () => ({
            getRedisClient: vi.fn().mockReturnValue(null),
            hasRedisConfig: vi.fn().mockReturnValue(false),
        }));
        vi.doMock("@/infrastructure/logger", () => ({
            logError: vi.fn(),
            logInfo:  vi.fn(),
            logStructured: vi.fn(),
            trunc: vi.fn().mockImplementation((s: string) => s ?? ""),
        }));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("throws RateLimitError on the 4th request when limit is 3", async () => {
        const { checkRateLimit, RateLimitError } = await import("@/security/rateLimiter");
        const key = `limited-${Date.now()}-${Math.random()}`;

        await checkRateLimit(key);
        await checkRateLimit(key);
        await checkRateLimit(key);

        await expect(checkRateLimit(key)).rejects.toBeInstanceOf(RateLimitError);
    });

    it("thrown RateLimitError has status 429", async () => {
        const { checkRateLimit, RateLimitError } = await import("@/security/rateLimiter");
        const key = `limited-status-${Date.now()}-${Math.random()}`;

        for (let i = 0; i < 3; i++) await checkRateLimit(key);

        try {
            await checkRateLimit(key);
            expect.fail("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(RateLimitError);
            expect((err as InstanceType<typeof RateLimitError>).status).toBe(429);
        }
    });

    it("resets the counter after the window expires (fake timers)", async () => {
        vi.useFakeTimers();
        const { checkRateLimit, RateLimitError } = await import("@/security/rateLimiter");
        const key = `reset-${Date.now()}-${Math.random()}`;

        // Exhaust the limit
        for (let i = 0; i < 3; i++) await checkRateLimit(key);
        await expect(checkRateLimit(key)).rejects.toBeInstanceOf(RateLimitError);

        // Advance time past the window
        vi.advanceTimersByTime(61_000);

        // Should be allowed again (new window)
        await expect(checkRateLimit(key)).resolves.toBeUndefined();

        vi.useRealTimers();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRateLimit — production path
// ─────────────────────────────────────────────────────────────────────────────

describe("checkRateLimit — production path", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("throws when NODE_ENV=production and no Redis is configured", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", "");
        vi.resetModules();
        vi.doMock("@/lib/redis", () => ({
            getRedisClient: vi.fn().mockReturnValue(null),
            hasRedisConfig: vi.fn().mockReturnValue(false),
        }));
        vi.doMock("@/infrastructure/logger", () => ({
            logError: vi.fn(), logInfo: vi.fn(), logStructured: vi.fn(), trunc: vi.fn(),
        }));

        const { checkRateLimit } = await import("@/security/rateLimiter");

        await expect(checkRateLimit("prod-key")).rejects.toThrow(
            /requires REDIS_URL in production/,
        );
    });

    it("fails open (does NOT throw) when Redis infra error occurs in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", "redis://localhost:6379");
        vi.resetModules();

        // Define the error BEFORE vi.doMock (not vi.mock which is hoisted)
        const redisInfraError = new Error("Redis connection reset");
        vi.doMock("@/lib/redis", () => ({
            hasRedisConfig: vi.fn().mockReturnValue(true),
            getRedisClient: vi.fn().mockReturnValue({
                incr: vi.fn().mockRejectedValue(redisInfraError),
                expire: vi.fn().mockResolvedValue(1),
            }),
        }));
        vi.doMock("@/infrastructure/logger", () => ({
            logError: vi.fn(), logInfo: vi.fn(), logStructured: vi.fn(), trunc: vi.fn(),
        }));

        const { checkRateLimit } = await import("@/security/rateLimiter");

        // Must resolve (fail open) — not throw
        await expect(checkRateLimit("prod-infra-fail")).resolves.toBeUndefined();
    });
});
