/**
 * POST /api/admin/assistant
 *
 * AI operations analyst for the VoyageAI admin panel.
 *
 * Pipeline:
 *   1. Auth gate (requireAdminApiAuth)
 *   2. Parallel data fetch — users, trips, AI usage (last 1h / 7d / 30d)
 *   3. Pre-LLM anomaly detection — latency spikes, cost spikes, error surges,
 *      engagement drops injected as a structured [ANOMALIES] section
 *   4. Compact context build (<800 tokens)
 *   5. gpt-4.1-mini call in JSON mode → structured { insight, reasoning,
 *      recommendation, actions? }
 *
 * Security: requireAdminApiAuth enforced before any DB or LLM call.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { OpenAIClient } from "@/infrastructure/llm/openaiClient";
import { internalErrorResponse, errorResponse } from "@/lib/api/response";
import { logError, logInfo } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { sanitizeUserInput } from "@/security/safety";
import { logLLMCallFailure, logLLMUsage } from "@/services/logging/usageLogger";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";
import { ActionTypeSchema } from "@/services/admin/actionExecutor";
import { getRequestId } from "@/lib/requestContext";
import { getPredictions, formatPredictionsForContext } from "@/services/ai/predictive.service";
import { logDecision, deriveAssistantConfidence } from "@/services/ai/explanation.service";

// ─── Validation ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
    query: z.string().min(1).max(600).trim(),
});

// ─── Anomaly thresholds ───────────────────────────────────────────────────────

const THRESHOLDS = {
    latencySpike:   2.0,   // 1h avg > Nx all-time avg
    errorRateHigh:  15,    // % error rate (0-token calls)
    errorRateSpike: 3.0,   // 5m error rate > Nx 1h error rate
    costSurge:      1.8,   // 7d burn-rate > Nx 30d daily average
    engagementLow:  0.20,  // active/total users ratio
} as const;

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchSystemData() {
    const now          = Date.now();
    const oneHourAgo   = new Date(now - 60 * 60 * 1000);
    const fiveMinAgo   = new Date(now - 5  * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo= new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
        totalUsers, newUsers7d, activeUsers7d,
        usersByRole,
        totalTrips, tripsLast7d,
        topDestinations,
        aiAllTime,
        ai1h,   errors1h,  count1h,
        ai5m,   errors5m,  count5m,
        ai7d,
        ai30d,
        byProvider,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt:  { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.groupBy({ by: ["role"], _count: { id: true } }),

        prisma.trip.count(),
        prisma.trip.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.trip.groupBy({
            by: ["destination"], _count: { id: true },
            orderBy: { _count: { id: "desc" } }, take: 5,
        }),

        // all-time baselines
        prisma.aiUsageLog.aggregate({
            _count: { id: true },
            _sum:   { totalTokens: true, costEstimateUsd: true },
            _avg:   { latencyMs: true },
        }),

        // 1-hour window
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: oneHourAgo } },
            _count: { id: true },
            _sum:   { costEstimateUsd: true },
            _avg:   { latencyMs: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),

        // 5-minute window (for spike detection)
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: fiveMinAgo } },
            _count: { id: true },
            _avg:   { latencyMs: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(fiveMinAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo } } }),

        // 7-day window
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: sevenDaysAgo } },
            _count: { id: true },
            _sum:   { costEstimateUsd: true },
            _avg:   { latencyMs: true },
        }),

        // 30-day window
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: thirtyDaysAgo } },
            _count: { id: true },
            _sum:   { costEstimateUsd: true },
        }),

        prisma.aiUsageLog.groupBy({
            by: ["provider"],
            _count: { id: true },
            _sum:   { totalTokens: true, costEstimateUsd: true },
            orderBy: { _count: { id: "desc" } },
        }),
    ]);

    return {
        users: { totalUsers, newUsers7d, activeUsers7d, usersByRole },
        trips: { totalTrips, tripsLast7d, topDestinations },
        ai: {
            allTime:  aiAllTime,
            h1:       { ...ai1h, errors: errors1h, total: count1h },
            m5:       { ...ai5m, errors: errors5m, total: count5m },
            d7:       ai7d,
            d30:      ai30d,
            byProvider,
        },
    };
}

// ─── Anomaly detector ─────────────────────────────────────────────────────────

interface Anomaly {
    severity: "critical" | "warning" | "info";
    label:    string;
    detail:   string;
}

function detectAnomalies(d: Awaited<ReturnType<typeof fetchSystemData>>): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const { ai, users } = d;

    const allTimeAvgLatency = ai.allTime._avg.latencyMs ?? 0;
    const h1AvgLatency      = ai.h1._avg.latencyMs ?? 0;
    const m5AvgLatency      = ai.m5._avg.latencyMs ?? 0;

    // Latency spike — last hour vs all-time
    if (allTimeAvgLatency > 0 && h1AvgLatency > allTimeAvgLatency * THRESHOLDS.latencySpike) {
        anomalies.push({
            severity: "critical",
            label:    "Latency spike (1h)",
            detail:   `Avg latency last hour is ${Math.round(h1AvgLatency)}ms vs all-time avg ${Math.round(allTimeAvgLatency)}ms (${(h1AvgLatency / allTimeAvgLatency).toFixed(1)}x).`,
        });
    } else if (allTimeAvgLatency > 0 && m5AvgLatency > allTimeAvgLatency * THRESHOLDS.latencySpike) {
        anomalies.push({
            severity: "warning",
            label:    "Latency spike (5m)",
            detail:   `Avg latency last 5 min is ${Math.round(m5AvgLatency)}ms vs all-time ${Math.round(allTimeAvgLatency)}ms.`,
        });
    }

    // Error rate — last hour
    const errorRate1h = ai.h1.total > 0 ? (ai.h1.errors / ai.h1.total) * 100 : 0;
    if (errorRate1h >= THRESHOLDS.errorRateHigh) {
        anomalies.push({
            severity: errorRate1h >= 30 ? "critical" : "warning",
            label:    "High AI error rate",
            detail:   `${errorRate1h.toFixed(1)}% of AI calls in the last hour returned 0 tokens.`,
        });
    }

    // Error rate spike — 5m vs 1h
    const errorRate5m = ai.m5.total > 0 ? (ai.m5.errors / ai.m5.total) * 100 : 0;
    if (errorRate1h > 0 && errorRate5m > errorRate1h * THRESHOLDS.errorRateSpike && ai.m5.total >= 3) {
        anomalies.push({
            severity: "critical",
            label:    "Error rate surging",
            detail:   `5-min error rate (${errorRate5m.toFixed(1)}%) is ${(errorRate5m / errorRate1h).toFixed(1)}x the 1h rate.`,
        });
    }

    // Cost surge — 7d run rate vs 30d daily avg
    const d30Daily = (ai.d30._sum.costEstimateUsd ?? 0) / 30;
    const d7Daily  = (ai.d7._sum.costEstimateUsd ?? 0) / 7;
    if (d30Daily > 0 && d7Daily > d30Daily * THRESHOLDS.costSurge) {
        anomalies.push({
            severity: "warning",
            label:    "Cost surge",
            detail:   `7-day daily avg cost ($${d7Daily.toFixed(4)}) is ${(d7Daily / d30Daily).toFixed(1)}x the 30-day daily avg ($${d30Daily.toFixed(4)}).`,
        });
    }

    // Low engagement
    const engagementRatio = users.totalUsers > 0 ? users.activeUsers7d / users.totalUsers : 1;
    if (users.totalUsers >= 10 && engagementRatio < THRESHOLDS.engagementLow) {
        anomalies.push({
            severity: "info",
            label:    "Low weekly engagement",
            detail:   `Only ${(engagementRatio * 100).toFixed(0)}% of users (${users.activeUsers7d}/${users.totalUsers}) logged in this week.`,
        });
    }

    // Zero AI activity in last hour (possible outage) — only flag if there was prior activity
    if (ai.allTime._count.id > 20 && ai.h1._count.id === 0) {
        anomalies.push({
            severity: "warning",
            label:    "No AI activity (1h)",
            detail:   "Zero AI calls recorded in the last hour despite historical usage. Possible silent failure.",
        });
    }

    return anomalies;
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(
    d: Awaited<ReturnType<typeof fetchSystemData>>,
    anomalies: Anomaly[],
    predictionBlock = "",
): string {
    const { users, trips, ai } = d;
    const roles = Object.fromEntries(users.usersByRole.map((r) => [r.role, r._count.id]));

    const errorRate1h = ai.h1.total > 0
        ? ((ai.h1.errors / ai.h1.total) * 100).toFixed(1)
        : "0.0";

    const anomalyBlock = anomalies.length > 0
        ? `\n[DETECTED ANOMALIES — address these in your analysis]\n${anomalies.map(
            (a) => `[${a.severity.toUpperCase()}] ${a.label}: ${a.detail}`
          ).join("\n")}`
        : "\n[ANOMALIES] None detected.";

    const predBlock = predictionBlock ? `\n${predictionBlock}` : "";

    return `=== VOYAGEAI OPS SNAPSHOT (${new Date().toUTCString()}) ===${anomalyBlock}${predBlock}

[USERS]
Total: ${users.totalUsers} (${roles.USER ?? 0} users, ${roles.ADMIN ?? 0} admins)
New last 7d: ${users.newUsers7d} | Active last 7d: ${users.activeUsers7d}
Engagement: ${users.totalUsers > 0 ? ((users.activeUsers7d / users.totalUsers) * 100).toFixed(0) : 0}%

[TRIPS]
Total: ${trips.totalTrips} | Created last 7d: ${trips.tripsLast7d}
Top destinations: ${trips.topDestinations.map((d) => `${d.destination}(${d._count.id})`).join(", ")}

[AI USAGE — ALL TIME]
Calls: ${ai.allTime._count.id} | Tokens: ${(ai.allTime._sum.totalTokens ?? 0).toLocaleString()}
Cost: $${(ai.allTime._sum.costEstimateUsd ?? 0).toFixed(4)} | Avg latency: ${Math.round(ai.allTime._avg.latencyMs ?? 0)}ms

[AI USAGE — LAST 1H]
Calls: ${ai.h1._count.id} | Errors (0-token): ${ai.h1.errors}
Error rate: ${errorRate1h}% | Avg latency: ${Math.round(ai.h1._avg.latencyMs ?? 0)}ms | Cost: $${(ai.h1._sum.costEstimateUsd ?? 0).toFixed(4)}

[AI USAGE — LAST 7D]
Calls: ${ai.d7._count.id} | Cost: $${(ai.d7._sum.costEstimateUsd ?? 0).toFixed(4)} | Avg latency: ${Math.round(ai.d7._avg.latencyMs ?? 0)}ms

[AI USAGE — LAST 30D]
Calls: ${ai.d30._count.id} | Cost: $${(ai.d30._sum.costEstimateUsd ?? 0).toFixed(4)}

[PROVIDERS]
${ai.byProvider.map((p) => `${p.provider}: ${p._count.id} calls, ${(p._sum.totalTokens ?? 0).toLocaleString()} tokens, $${(p._sum.costEstimateUsd ?? 0).toFixed(4)}`).join(" | ")}`.trim();
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a query and summarization tool for VoyageAI admin data. You receive system log snapshots and return structured summaries grounded in those numbers.

Your job is to summarize the system log data provided, surface observations, and suggest next steps. You do not have access to real-time data beyond the snapshot supplied.

You will receive:
- A live system snapshot with user, trip, and AI usage data
- A list of pre-detected anomalies (if any)
- The admin's question or focus area

You MUST respond with a valid JSON object matching this exact schema:
{
  "insight": "<1-3 sentences: the single most important thing happening in the system right now, referencing real numbers>",
  "reasoning": "<2-4 sentences: why this is happening — connect the dots between metrics, explain the root cause or trend>",
  "recommendation": "<2-3 clear, direct action items the admin should take — be specific, not generic>",
  "actions": [
    {
      "id": "<unique string, e.g. 'check-provider-1'>",
      "label": "<short human-readable button label, e.g. 'Check AI provider status'>",
      "type": "<one of: CHECK_AI_PROVIDER | CHECK_API_LOGS | VERIFY_MONITORING | CLEAR_CACHE | ANALYZE_USERS>"
    }
  ]
}

Action type guide (use ONLY these exact values):
- CHECK_AI_PROVIDER  → use when AI provider status is unknown or there are provider errors
- CHECK_API_LOGS     → use when error rate is elevated or there are recent failures
- VERIFY_MONITORING  → use when system health is unclear or latency is anomalous
- CLEAR_CACHE        → use when image cache issues are suspected
- ANALYZE_USERS      → use when user activity or engagement is the focus

Rules:
- Ground every claim in the data provided — no hallucination
- If anomalies are detected, lead with them; they are highest priority
- actions[] is optional (omit if no concrete next steps); max 4 items
- Each action must have a unique id, a clear label, and an exact type from the list above
- Be direct and factual — cite the exact numbers from the snapshot
- Numbers must match the snapshot exactly
- If data is sparse (low counts), state that explicitly and do not extrapolate
- Do not claim capabilities or awareness beyond the data in the snapshot`;

// ─── Output schema ────────────────────────────────────────────────────────────

const ActionItemSchema = z.object({
    id:      z.string().min(1),
    label:   z.string().min(1),
    type:    ActionTypeSchema,
    payload: z.record(z.string(), z.unknown()).optional(),
});

const OutputSchema = z.object({
    insight:        z.string().min(1),
    reasoning:      z.string().min(1),
    recommendation: z.string().min(1),
    actions:        z.array(ActionItemSchema).max(4).optional(),
});

export type ActionItem        = z.infer<typeof ActionItemSchema>;
export type AssistantResponse = z.infer<typeof OutputSchema>;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        let query: string;
        try {
            const body   = await req.json();
            const parsed = BodySchema.safeParse(body);
            if (!parsed.success) {
                return errorResponse("INVALID_INPUT", "query must be a non-empty string under 600 chars");
            }
            query = parsed.data.query;
        } catch {
            return errorResponse("INVALID_INPUT", "Invalid request body");
        }

        let llmAttemptStart: number | null = null;

        try {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return errorResponse("LLM_ERROR", "OPENAI_API_KEY is not configured", 500);
            }

            // Parallel: data fetch + predictive analysis (cached, non-blocking)
            const [data, predReport] = await Promise.all([
                fetchSystemData(),
                getPredictions().catch(() => null),
            ]);
            const anomalies       = detectAnomalies(data);
            const predictionBlock = predReport ? formatPredictionsForContext(predReport) : "";
            const context         = buildContext(data, anomalies, predictionBlock);

            logInfo("[assistant] anomalies detected", { count: anomalies.length, severities: anomalies.map((a) => a.severity) });

            const safeQuery = sanitizeUserInput(query);
            const client = new OpenAIClient(apiKey, "gpt-4.1-mini");
            llmAttemptStart = Date.now();
            const result = await client.completeChat({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user",   content: `System snapshot:\n${context}\n\nAdmin focus: ${safeQuery}` },
                ],
                model:       "gpt-4.1-mini",
                temperature: 0.3,
                maxTokens:   700,
                json:        true,
                timeoutMs:   25_000,
            });

            // Fire-and-forget usage log (never blocks the response)
            logLLMUsage(
                {
                    content:          result.content,
                    modelUsed:        result.modelUsed,
                    promptTokens:     result.promptTokens,
                    completionTokens: result.completionTokens,
                    totalTokens:      result.totalTokens,
                    latencyMs:        result.latencyMs,
                    provider:         "openai",
                },
                { requestId: getRequestId(), endpoint: "admin_assistant" },
            ).catch(() => {});

            // Parse and validate the structured output
            let parsed: AssistantResponse;
            try {
                parsed = OutputSchema.parse(JSON.parse(result.content));
            } catch {
                // Fallback: wrap raw text so the UI always gets a valid shape
                parsed = {
                    insight:        result.content.slice(0, 300),
                    reasoning:      "Could not structure the full response.",
                    recommendation: "Try rephrasing your question.",
                };
            }

            // Persist explainability row before responding so admin UI refresh sees the new decision.
            await logDecision({
                decisionType: "ASSISTANT_RESPONSE",
                source:       "admin_assistant",
                reasoning:    parsed.reasoning,
                inputSummary: `Anomalies: ${anomalies.length} (${anomalies.map((a) => a.severity).join(", ") || "none"}). Predictions: ${predReport?.predictions.length ?? 0}. Context: system snapshot ingested.`,
                confidence:   deriveAssistantConfidence(anomalies.map((a) => a.severity), predReport?.predictions.length ?? 0),
                outcome:      parsed.recommendation,
                requestId:    getRequestId() ?? undefined,
                triggeredBy:  `admin:${auth.auth.user.sub}`,
            });

            return Response.json({
                ...parsed,
                _meta: {
                    source:            "derived-from-logs",
                    anomalyCount:      anomalies.length,
                    anomalySeverities: anomalies.map((a) => ({ label: a.label, severity: a.severity })),
                    predictions:       predReport?.predictions ?? [],
                },
            });
        } catch (err) {
            logError("[POST /api/admin/assistant] failed", err);
            if (llmAttemptStart !== null) {
                void logLLMCallFailure({
                    provider:  "openai",
                    modelUsed: "gpt-4.1-mini",
                    latencyMs: Math.max(0, Date.now() - llmAttemptStart),
                    requestId: getRequestId(),
                    endpoint:  "admin_assistant",
                });
            }
            return internalErrorResponse("Assistant unavailable — please try again.");
        }
    });
}
