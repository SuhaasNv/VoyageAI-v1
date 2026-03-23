/**
 * GET /api/admin/system-health
 *
 * Lightweight system health aggregation from AiUsageLog.
 * No heavy infra — all aggregation is in-DB via Prisma.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, internalErrorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { requireAdminApiAuth } from "@/lib/admin";

export interface SystemHealth {
    avgLatencyMs5m:  number;
    avgLatencyMs1h:  number;
    errorRate5m:     number;   // percentage 0–100
    errorRate1h:     number;
    requestsPer5m:   number;   // raw count in last 5 min
    requestsPerMin:  number;   // derived: requestsPer5m / 5
    activeUsers24h:  number;
    status:          "healthy" | "degraded" | "down";
}

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        try {
            const now = Date.now();
            const fiveMinAgo  = new Date(now - 5 * 60 * 1000);
            const oneHourAgo  = new Date(now - 60 * 60 * 1000);
            const twentyFourH = new Date(now - 24 * 60 * 60 * 1000);

            const [
                stats5m,
                stats1h,
                errors5m,
                errors1h,
                count5m,
                count1h,
                activeUsers,
            ] = await Promise.all([
                prisma.aiUsageLog.aggregate({
                    where: { createdAt: { gte: fiveMinAgo } },
                    _avg: { latencyMs: true },
                    _count: { id: true },
                }),
                prisma.aiUsageLog.aggregate({
                    where: { createdAt: { gte: oneHourAgo } },
                    _avg: { latencyMs: true },
                    _count: { id: true },
                }),
                prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo }, totalTokens: 0 } }),
                prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo }, totalTokens: 0 } }),
                prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo } } }),
                prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
                prisma.user.count({ where: { lastLoginAt: { gte: twentyFourH } } }),
            ]);

            const errorRate5m = count5m > 0 ? (errors5m / count5m) * 100 : 0;
            const errorRate1h = count1h > 0 ? (errors1h / count1h) * 100 : 0;
            const avgLatency5m = Math.round(stats5m._avg.latencyMs ?? 0);
            const avgLatency1h = Math.round(stats1h._avg.latencyMs ?? 0);

            let status: SystemHealth["status"] = "healthy";
            if (errorRate5m > 20 || avgLatency5m > 30_000) status = "down";
            else if (errorRate5m > 5 || avgLatency5m > 10_000) status = "degraded";

            const health: SystemHealth = {
                avgLatencyMs5m:  avgLatency5m,
                avgLatencyMs1h:  avgLatency1h,
                errorRate5m:     Math.round(errorRate5m * 100) / 100,
                errorRate1h:     Math.round(errorRate1h * 100) / 100,
                requestsPer5m:   count5m,
                requestsPerMin:  Math.round((count5m / 5) * 10) / 10,
                activeUsers24h:  activeUsers,
                status,
            };

            return successResponse(health);
        } catch {
            return internalErrorResponse();
        }
    });
}
