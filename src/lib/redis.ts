import Redis from "ioredis";

let redisClient: Redis | null | undefined;

export function hasRedisConfig(): boolean {
    return !!process.env.REDIS_URL?.trim();
}

export function getRedisClient(): Redis | null {
    if (redisClient !== undefined) return redisClient;

    const url = process.env.REDIS_URL?.trim();
    if (!url) {
        redisClient = null;
        return redisClient;
    }

    redisClient = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
    });

    redisClient.on("error", () => {
        // Non-fatal: callsites already handle cache/rate-limit fallbacks.
    });

    return redisClient;
}
