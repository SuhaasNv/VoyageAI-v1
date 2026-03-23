/**
 * src/services/admin/actionExecutor.ts
 *
 * Executes structured admin actions triggered by the AI assistant.
 * Each action is isolated, fast, and returns a typed result.
 * Every execution is logged to AdminActionLog (fire-and-forget).
 *
 * Supported actions:
 *   CHECK_AI_PROVIDER  — ping OpenAI + check Gemini key presence
 *   CHECK_API_LOGS     — query recent 0-token errors from AiUsageLog
 *   VERIFY_MONITORING  — aggregate last-hour system health metrics
 *   CLEAR_CACHE        — delete destination-image:* keys from Redis
 *   ANALYZE_USERS      — user count, activity, and role breakdown
 */

import { logError } from "@/infrastructure/logger";
import { z } from "zod";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";

// ─── Public types ─────────────────────────────────────────────────────────────

export const ACTION_TYPES = [
    "CHECK_AI_PROVIDER",
    "CHECK_API_LOGS",
    "VERIFY_MONITORING",
    "CLEAR_CACHE",
    "ANALYZE_USERS",
] as const satisfies [string, ...string[]];

export type ActionType = typeof ACTION_TYPES[number];

/** Zod enum for action type — use this instead of z.enum(ACTION_TYPES) to preserve tuple inference. */
export const ActionTypeSchema = z.enum(ACTION_TYPES);

export interface AdminAction {
    type: ActionType;
    payload?: Record<string, unknown>;
}

export interface ActionResult {
    success: boolean;
    data?:   unknown;
    message?: string;
}

// ─── Individual handlers ──────────────────────────────────────────────────────

async function checkAiProvider(): Promise<ActionResult> {
    const results: Record<string, { available: boolean; latencyMs?: number; note?: string }> = {};

    // OpenAI — lightweight model metadata fetch (no token spend)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        const t0 = Date.now();
        try {
            const resp = await fetch("https://api.openai.com/v1/models/gpt-4.1-mini", {
                headers: { Authorization: `Bearer ${openaiKey}` },
                signal: AbortSignal.timeout(8_000),
            });
            results.openai = {
                available: resp.ok,
                latencyMs: Date.now() - t0,
                note:      resp.ok ? "Reachable" : `HTTP ${resp.status}`,
            };
        } catch (err) {
            results.openai = { available: false, note: (err as Error).message };
        }
    } else {
        results.openai = { available: false, note: "OPENAI_API_KEY not set" };
    }

    // Gemini — key presence only (avoids unnecessary quota usage)
    const geminiKey = process.env.GEMINI_API_KEY;
    results.gemini = {
        available: Boolean(geminiKey?.trim()),
        note:      geminiKey ? "API key present" : "GEMINI_API_KEY not set",
    };

    const allUp = Object.values(results).some((r) => r.available);
    return {
        success: allUp,
        data:    results,
        message: allUp ? "At least one provider is available" : "No AI providers available",
    };
}

async function checkApiLogs(): Promise<ActionResult> {
    const { prisma } = await import("@/lib/prisma");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [errors, total, recentErrors] = await Promise.all([
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
        prisma.aiUsageLog.findMany({
            where:   whereAiCallFailedSince(oneHourAgo),
            orderBy: { createdAt: "desc" },
            take:    10,
            select:  { id: true, provider: true, modelUsed: true, endpoint: true, createdAt: true, latencyMs: true },
        }),
    ]);

    const errorRatePct = total > 0 ? ((errors / total) * 100).toFixed(1) : "0.0";

    return {
        success: true,
        data: {
            window:       "last 1h",
            totalCalls:   total,
            errorCalls:   errors,
            errorRatePct: `${errorRatePct}%`,
            recentErrors: recentErrors.map((e) => ({
                id:        e.id.slice(-8),
                provider:  e.provider,
                model:     e.modelUsed,
                endpoint:  e.endpoint,
                latencyMs: e.latencyMs,
                at:        e.createdAt.toISOString(),
            })),
        },
        message: `${errors} error${errors === 1 ? "" : "s"} (${errorRatePct}%) in the last hour`,
    };
}

async function verifyMonitoring(): Promise<ActionResult> {
    const { prisma } = await import("@/lib/prisma");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [h1, allTime, userCount] = await Promise.all([
        prisma.aiUsageLog.aggregate({
            where:  { createdAt: { gte: oneHourAgo } },
            _count: { id: true },
            _avg:   { latencyMs: true },
            _sum:   { costEstimateUsd: true, totalTokens: true },
        }),
        prisma.aiUsageLog.aggregate({
            _count: { id: true },
            _avg:   { latencyMs: true },
        }),
        prisma.user.count(),
    ]);

    const h1Errors = await prisma.aiUsageLog.count({
        where: whereAiCallFailedSince(oneHourAgo),
    });

    const allTimeAvgLatency = allTime._avg.latencyMs ?? 0;
    const h1AvgLatency      = h1._avg.latencyMs ?? 0;
    const latencyRatio       = allTimeAvgLatency > 0 ? h1AvgLatency / allTimeAvgLatency : 1;
    const errorRate          = h1._count.id > 0 ? (h1Errors / h1._count.id) * 100 : 0;

    return {
        success: true,
        data: {
            health: {
                status:        errorRate > 15 ? "degraded" : latencyRatio > 2 ? "slow" : "healthy",
                errorRatePct:  errorRate.toFixed(1),
                latencyRatio:  latencyRatio.toFixed(2),
            },
            last1h: {
                calls:       h1._count.id,
                errors:      h1Errors,
                avgLatencyMs: Math.round(h1AvgLatency),
                costUsd:     (h1._sum.costEstimateUsd ?? 0).toFixed(5),
                tokens:      h1._sum.totalTokens ?? 0,
            },
            allTime: {
                totalCalls:   allTime._count.id,
                avgLatencyMs: Math.round(allTimeAvgLatency),
            },
            users: { total: userCount },
        },
        message: `System is ${errorRate > 15 ? "degraded" : latencyRatio > 2 ? "slow" : "healthy"}`,
    };
}

async function clearCache(): Promise<ActionResult> {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return { success: false, message: "Redis not configured — UPSTASH_REDIS_REST_URL / TOKEN missing" };
    }

    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });
    const keys  = await redis.keys("destination-image:*");
    if (keys.length > 0) {
        await redis.del(...(keys as [string, ...string[]]));
    }

    return {
        success: true,
        data:    { keysCleared: keys.length },
        message: `Cleared ${keys.length} cached image ${keys.length === 1 ? "key" : "keys"}`,
    };
}

async function analyzeUsers(): Promise<ActionResult> {
    const { prisma } = await import("@/lib/prisma");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, active7d, new7d, byRole] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { createdAt:   { gte: sevenDaysAgo } } }),
        prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
    ]);

    const inactive = total - active7d;
    const engagementPct = total > 0 ? ((active7d / total) * 100).toFixed(1) : "0.0";

    return {
        success: true,
        data: {
            total,
            active7d,
            inactive,
            new7d,
            engagementPct: `${engagementPct}%`,
            byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count.id])),
        },
        message: `${total} total users · ${engagementPct}% active in last 7d`,
    };
}

// ─── Log helper (fire-and-forget) ─────────────────────────────────────────────

async function persistActionLog(
    action: AdminAction,
    result: ActionResult,
    userId: string,
): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        // Prisma Json? fields require either a value or omission — never JS null.
        // JSON.parse(JSON.stringify) strips undefined values so nested data is safe.
        const safePayload = action.payload !== undefined
            ? JSON.parse(JSON.stringify(action.payload)) as object
            : undefined;
        const safeResult  = JSON.parse(
            JSON.stringify(result.data ?? { message: result.message ?? "" })
        ) as object;

        await prisma.adminActionLog.create({
            data: {
                actionType: action.type,
                payload:    safePayload,
                result:     safeResult,
                success:    result.success,
                userId,
            },
        });
    } catch (err) {
        logError("[ActionExecutor] DB log failed", { actionType: action.type, error: (err as Error).message });
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function executeAdminAction(
    action: AdminAction,
    userId: string,
): Promise<ActionResult> {
    let result: ActionResult;

    try {
        switch (action.type) {
            case "CHECK_AI_PROVIDER":  result = await checkAiProvider();  break;
            case "CHECK_API_LOGS":     result = await checkApiLogs();     break;
            case "VERIFY_MONITORING":  result = await verifyMonitoring(); break;
            case "CLEAR_CACHE":        result = await clearCache();       break;
            case "ANALYZE_USERS":      result = await analyzeUsers();     break;
            default:
                result = { success: false, message: `Unknown action type: ${(action as AdminAction).type}` };
        }
    } catch (err) {
        logError("[ActionExecutor] handler threw", { type: action.type, error: (err as Error).message });
        result = { success: false, message: (err as Error).message ?? "Unexpected error" };
    }

    // Non-blocking audit log
    persistActionLog(action, result, userId).catch(() => {});

    return result;
}
