/**
 * POST /api/admin/clear-image-cache
 * Clears destination-image:* keys from Redis. Dev/debug only.
 */

import { NextRequest } from "next/server";
import { successResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { requireAdminApiAuth } from "@/lib/admin";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const adminAuth = requireAdminApiAuth(req);
        if (!adminAuth.ok) return adminAuth.response;

        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        if (!url || !token) {
            return successResponse({ cleared: 0, error: "Redis not configured" });
        }

        const { Redis } = await import("@upstash/redis");
        const redis = new Redis({ url, token });
        const keys = await redis.keys("destination-image:*");
        for (const key of keys) {
            await redis.del(key);
        }
        return successResponse({ cleared: keys.length });
    });
}
