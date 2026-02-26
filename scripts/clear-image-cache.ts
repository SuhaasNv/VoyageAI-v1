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
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN required");
        process.exit(1);
    }

    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });

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
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
