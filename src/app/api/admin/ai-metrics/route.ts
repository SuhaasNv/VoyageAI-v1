/**
 * GET /api/admin/ai-metrics
 *
 * Aggregates ai_usage_logs into a structured metrics payload.
 * Access is restricted to authenticated users whose email is in
 * ADMIN_EMAILS or whose JWT role is "ADMIN".
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import {
    successResponse,
    unauthorizedResponse,
    forbiddenResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { isAdminPayload } from "@/lib/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiMetrics {
    totalCalls: number;
    totalTokens: number;
    avgLatencyMs: number;
    errorCount: number;
    successCount: number;
    errorRate: number;          // percentage, 0–100
    totalCostUsd: number;
    byEndpoint: EndpointRow[];
    byProvider: ProviderRow[];
}

export interface EndpointRow {
    endpoint: string;
    calls: number;
    tokens: number;
    avgLatencyMs: number;
    costUsd: number;
}

export interface ProviderRow {
    provider: string;
    calls: number;
    tokens: number;
    avgLatencyMs: number;
    costUsd: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        // 1. Auth
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        // 2. Admin gate
        if (!isAdminPayload(auth.user)) return forbiddenResponse();

        try {
            // 3. Run all aggregations in parallel
            const [totals, errorCount, byEndpoint, byProvider] = await Promise.all([
                prisma.aiUsageLog.aggregate({
                    _count: { id: true },
                    _sum:   { totalTokens: true, costEstimateUsd: true },
                    _avg:   { latencyMs: true },
                }),
                // Proxy for errors: calls where the model returned 0 tokens.
                prisma.aiUsageLog.count({ where: { totalTokens: 0 } }),
                prisma.aiUsageLog.groupBy({
                    by:       ["endpoint"],
                    _count:   { id: true },
                    _sum:     { totalTokens: true, costEstimateUsd: true },
                    _avg:     { latencyMs: true },
                    orderBy:  { _count: { id: "desc" } },
                }),
                prisma.aiUsageLog.groupBy({
                    by:       ["provider"],
                    _count:   { id: true },
                    _sum:     { totalTokens: true, costEstimateUsd: true },
                    _avg:     { latencyMs: true },
                    orderBy:  { _count: { id: "desc" } },
                }),
            ]);

            const totalCalls   = totals._count.id;
            const successCount = totalCalls - errorCount;

            const metrics: AiMetrics = {
                totalCalls,
                totalTokens:  totals._sum.totalTokens    ?? 0,
                avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
                errorCount,
                successCount,
                errorRate:    totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
                totalCostUsd: totals._sum.costEstimateUsd ?? 0,
                byEndpoint: byEndpoint.map((row) => ({
                    endpoint:     row.endpoint ?? "(unknown)",
                    calls:        row._count.id,
                    tokens:       row._sum.totalTokens    ?? 0,
                    avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
                    costUsd:      row._sum.costEstimateUsd ?? 0,
                })),
                byProvider: byProvider.map((row) => ({
                    provider:     row.provider,
                    calls:        row._count.id,
                    tokens:       row._sum.totalTokens    ?? 0,
                    avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
                    costUsd:      row._sum.costEstimateUsd ?? 0,
                })),
            };

            return successResponse(metrics);
        } catch (err) {
            logError("[GET /api/admin/ai-metrics] Aggregation failed", err);
            return internalErrorResponse();
        }
    });
}
