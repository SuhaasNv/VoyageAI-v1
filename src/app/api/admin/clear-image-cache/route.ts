/**
 * POST /api/admin/clear-image-cache
 * Clears destination-image:* keys from Redis. Dev/debug only.
 */

import { NextRequest } from "next/server";
import { successResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { requireAdminApiAuth } from "@/lib/admin";
import { getRedisClient, hasRedisConfig } from "@/lib/redis";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const adminAuth = requireAdminApiAuth(req);
        if (!adminAuth.ok) return adminAuth.response;

        if (!hasRedisConfig()) {
            return successResponse({ cleared: 0, error: "Redis not configured" });
        }

        const redis = getRedisClient();
        if (!redis) {
            return successResponse({ cleared: 0, error: "Redis not configured" });
        }
        const keys = await redis.keys("destination-image:*");
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        return successResponse({ cleared: keys.length });
    });
}
