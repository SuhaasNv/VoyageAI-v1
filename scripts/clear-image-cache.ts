/**
 * Clears destination-image cache keys from Redis.
 * Run from project root: npm run clear-image-cache
 * Or call POST /api/admin/clear-image-cache (authenticated) while server is running.
 */
import { config } from "dotenv";
import { resolve } from "path";

const root = resolve(process.cwd());
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local") });

async function main() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.error("REDIS_URL is required");
        process.exit(1);
    }

    const Redis = (await import("ioredis")).default;
    const redis = new Redis(redisUrl);

    const keys = await redis.keys("destination-image:*");
    if (keys.length === 0) {
        console.log("No destination-image keys found.");
        return;
    }
    for (const key of keys) {
        await redis.del(key);
        console.log("Deleted:", key);
    }
    console.log(`Cleared ${keys.length} key(s).`);
    redis.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
