/**
 * src/services/ai/optimization.service.ts
 *
 * Self-Learning Optimization Engine for VoyageAI.
 *
 * PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * While autoHealing.service.ts is REACTIVE (responds to live anomaly spikes),
 * this service is PROACTIVE — it mines historical patterns over 7–30 day
 * windows to surface structural inefficiencies that spikes never reveal.
 *
 * ANALYSES (in order)
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Token waste        — endpoints where avg used tokens << provisioned max
 *   2. High-cost          — endpoints draining the most cumulative spend
 *   3. Cache opportunity  — high-volume endpoints that may benefit from caching
 *   4. Slow agents        — agents with consistently elevated latency
 *   5. Error-prone        — endpoints with sustained elevated error rates
 *   6. Model mismatch     — expensive model used for a task a cheaper one handles
 *
 * AUTO-APPLY (low risk only)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Token-waste + high-cost both spanning ≥ 2 endpoints → apply
 *   reduce_tokens_25pct to HealingStore for 4 hours.
 *   All other recommendations are advisory (stored, surfaced in admin panel).
 *   Nothing is auto-applied if HealingStore already has active overrides.
 *
 * INTEGRATION POINTS
 * ─────────────────────────────────────────────────────────────────────────────
 *   HealingStore.setHealingOverrides() — write approved global token reduction
 *   prisma.adminActionLog              — persist cycle summary (fire-and-forget)
 *   getOptimizationState()             — polled by /api/admin/model-insights
 *
 * NO CHANGES to:
 *   modelRouter.ts, modelSelector.ts, cache.ts, autoHealing.service.ts,
 *   any API route, or the Prisma schema.
 */

import { logInfo, logError, logStructured } from "@/infrastructure/logger";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";
import { getHealingStatus, setHealingOverrides } from "./healingStore";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Provisioned maxTokens per endpoint (mirrors modelRouter.ts CONFIGS). */
const ENDPOINT_MAX_TOKENS: Record<string, number> = {
    itinerary:    8192,
    reoptimize:   8192,
    chat:         2048,
    research:     4096,
    packing:      4096,
    simulation:   4096,
    suggestions:  512,
    "create-trip":512,
    ticket:       512,
    landing:      800,
    budget:       400,
};

const THRESHOLDS = {
    /** Flag an endpoint when avg used tokens / provisioned max < this ratio. */
    tokenWasteRatio:      0.40,
    /** Flag an endpoint whose 7d cumulative cost exceeds this (USD). */
    highCostUsdPer7d:     0.05,
    /** Flag an endpoint with this many avg calls/day — cache would help. */
    cacheOpportunityDaily: 20,
    /** Flag an agent whose avg latency exceeds this (ms). */
    slowAgentMs:          8_000,
    /** Flag an endpoint whose 7d error rate exceeds this (%). */
    errorRatePct:         10,
    /** Flag when 7d avg cost/call is > 2× the cheapest available model. */
    modelMismatchMultiplier: 2.0,
    /** Minimum call volume before an endpoint is eligible for any finding. */
    minCalls:             10,
    /** Auto-apply token reduction only when ≥ this many endpoints are wasteful. */
    autoApplyMinEndpoints: 2,
} as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export type FindingCategory = "token_waste" | "high_cost" | "cache_opportunity" | "slow_agent" | "error_prone" | "model_mismatch";

export interface OptimizationFinding {
    id:         string;
    category:   FindingCategory;
    severity:   "low" | "medium" | "high";
    endpoint?:  string;
    agentName?: string;
    label:      string;
    detail:     string;
    metric:     { observed: number; baseline: number; unit: string };
}

export type RecommendationType =
    | "REDUCE_MAX_TOKENS"
    | "ENABLE_CACHE"
    | "SWITCH_TO_CHEAPER_MODEL"
    | "INVESTIGATE_AGENT_LATENCY"
    | "INVESTIGATE_ERROR_RATE";

export interface OptimizationRecommendation {
    id:              string;
    findingId:       string;
    type:            RecommendationType;
    label:           string;
    detail:          string;
    safetyLevel:     "low_risk" | "medium_risk";
    /** Estimated 7d savings if recommendation is applied (USD). */
    estimatedSavingUsd: number;
    /** Whether the engine can apply this automatically without human approval. */
    autoApplicable:  boolean;
    applied:         boolean;
}

export interface OptimizationReport {
    generatedAt:       string;
    windowDays:        number;
    totalCost7d:       number;
    totalCalls7d:      number;
    findings:          OptimizationFinding[];
    recommendations:   OptimizationRecommendation[];
    appliedCount:      number;
    summary:           string;
    durationMs:        number;
}

// ─── In-process state (OptimizationStore) ────────────────────────────────────

let _lastReport:  OptimizationReport | null = null;
let _runCount    = 0;
let _lastRunAt:  string | null = null;
let _isRunning   = false;

export function getOptimizationState() {
    return {
        lastRunAt:  _lastRunAt,
        runCount:   _runCount,
        isRunning:  _isRunning,
        lastReport: _lastReport,
    };
}

// ─── Data collection ──────────────────────────────────────────────────────────

interface EndpointStats {
    endpoint:     string;
    calls:        number;
    avgTokens:    number;
    totalCost:    number;
    avgCostUsd:   number;
    avgLatencyMs: number;
    errorRate:    number;
    models:       string[];
    dailyAvgCalls: number;
}

interface AgentStats {
    agentName:    string;
    calls:        number;
    avgLatencyMs: number;
    errorRate:    number;
}

async function collectEndpointStats(sevenDaysAgo: Date): Promise<EndpointStats[]> {
    const { prisma } = await import("@/lib/prisma");

    const raw = await prisma.aiUsageLog.findMany({
        where:  { createdAt: { gte: sevenDaysAgo } },
        select: {
            endpoint:        true,
            totalTokens:     true,
            callSucceeded:   true,
            costEstimateUsd: true,
            latencyMs:       true,
            modelUsed:       true,
        },
    });

    // Aggregate by endpoint
    type Bucket = {
        tokens: number[]; cost: number[]; latency: number[];
        errors: number; models: Set<string>;
    };
    const buckets = new Map<string, Bucket>();

    for (const row of raw) {
        const ep = row.endpoint ?? "unknown";
        if (!buckets.has(ep)) {
            buckets.set(ep, { tokens: [], cost: [], latency: [], errors: 0, models: new Set() });
        }
        const b = buckets.get(ep)!;
        b.tokens.push(row.totalTokens);
        b.cost.push(row.costEstimateUsd);
        b.latency.push(row.latencyMs);
        if (isAiUsageLogFailure(row)) b.errors++;
        b.models.add(row.modelUsed);
    }

    const stats: EndpointStats[] = [];
    for (const [endpoint, b] of buckets) {
        const n = b.tokens.length;
        if (n < THRESHOLDS.minCalls) continue;
        stats.push({
            endpoint,
            calls:         n,
            avgTokens:     b.tokens.reduce((s, v) => s + v, 0) / n,
            totalCost:     b.cost.reduce((s, v) => s + v, 0),
            avgCostUsd:    b.cost.reduce((s, v) => s + v, 0) / n,
            avgLatencyMs:  b.latency.reduce((s, v) => s + v, 0) / n,
            errorRate:     (b.errors / n) * 100,
            models:        [...b.models],
            dailyAvgCalls: n / 7,
        });
    }

    return stats;
}

async function collectAgentStats(sevenDaysAgo: Date): Promise<AgentStats[]> {
    try {
        const { prisma } = await import("@/lib/prisma");
        // Type-safe delegate check (same pattern as agentReplayLogger)
        const delegate = (prisma as unknown as {
            agentExecutionLog?: {
                findMany: (args: object) => Promise<{ agentName: string; latencyMs: number; success: boolean }[]>
            }
        }).agentExecutionLog;

        if (!delegate?.findMany) return [];

        const raw = await delegate.findMany({
            where:  { createdAt: { gte: sevenDaysAgo } },
        });

        type AgentBucket = { latency: number[]; errors: number };
        const buckets = new Map<string, AgentBucket>();

        for (const row of raw) {
            if (!buckets.has(row.agentName)) {
                buckets.set(row.agentName, { latency: [], errors: 0 });
            }
            const b = buckets.get(row.agentName)!;
            b.latency.push(row.latencyMs);
            if (!row.success) b.errors++;
        }

        return [...buckets.entries()]
            .filter(([, b]) => b.latency.length >= THRESHOLDS.minCalls)
            .map(([agentName, b]) => {
                const n = b.latency.length;
                return {
                    agentName,
                    calls:        n,
                    avgLatencyMs: b.latency.reduce((s, v) => s + v, 0) / n,
                    errorRate:    (b.errors / n) * 100,
                };
            });
    } catch (err) {
        logError("[OptimizationService] Agent stats fetch failed", { error: (err as Error).message });
        return [];
    }
}

// ─── Finding generators ───────────────────────────────────────────────────────

function detectTokenWaste(stats: EndpointStats[]): OptimizationFinding[] {
    const findings: OptimizationFinding[] = [];

    for (const ep of stats) {
        const max = ENDPOINT_MAX_TOKENS[ep.endpoint];
        if (!max) continue;

        const ratio = ep.avgTokens / max;
        if (ratio < THRESHOLDS.tokenWasteRatio) {
            const wasted = max - Math.round(ep.avgTokens);
            findings.push({
                id:       `token_waste:${ep.endpoint}`,
                category: "token_waste",
                severity: ratio < 0.20 ? "high" : ratio < 0.30 ? "medium" : "low",
                endpoint: ep.endpoint,
                label:    `Token over-provisioning: ${ep.endpoint}`,
                detail:   `Avg usage ${Math.round(ep.avgTokens)} tokens (${(ratio * 100).toFixed(0)}% of ${max} max). ~${wasted} tokens wasted per call across ${ep.calls} calls/7d.`,
                metric:   { observed: ratio * 100, baseline: THRESHOLDS.tokenWasteRatio * 100, unit: "% utilisation" },
            });
        }
    }

    return findings;
}

function detectHighCost(stats: EndpointStats[]): OptimizationFinding[] {
    const sorted = [...stats].sort((a, b) => b.totalCost - a.totalCost);

    return sorted
        .filter((ep) => ep.totalCost > THRESHOLDS.highCostUsdPer7d)
        .map((ep) => ({
            id:       `high_cost:${ep.endpoint}`,
            category: "high_cost" as FindingCategory,
            severity: ep.totalCost > THRESHOLDS.highCostUsdPer7d * 10 ? "high"
                    : ep.totalCost > THRESHOLDS.highCostUsdPer7d * 3  ? "medium"
                    : "low" as "low" | "medium" | "high",
            endpoint: ep.endpoint,
            label:    `High cost endpoint: ${ep.endpoint}`,
            detail:   `$${ep.totalCost.toFixed(4)} in 7d (${ep.calls} calls × $${ep.avgCostUsd.toFixed(5)}/call). Top cost driver.`,
            metric:   { observed: ep.totalCost, baseline: THRESHOLDS.highCostUsdPer7d, unit: "USD/7d" },
        }));
}

function detectCacheOpportunity(stats: EndpointStats[]): OptimizationFinding[] {
    // Endpoints that already have Redis caching configured in cache.ts
    const ALREADY_CACHED = new Set(["itinerary", "reoptimize", "chat", "suggestions"]);

    return stats
        .filter((ep) => !ALREADY_CACHED.has(ep.endpoint) && ep.dailyAvgCalls > THRESHOLDS.cacheOpportunityDaily)
        .map((ep) => ({
            id:       `cache_opportunity:${ep.endpoint}`,
            category: "cache_opportunity" as FindingCategory,
            severity: ep.dailyAvgCalls > THRESHOLDS.cacheOpportunityDaily * 3 ? "medium" : "low" as "low" | "medium",
            endpoint: ep.endpoint,
            label:    `Cache opportunity: ${ep.endpoint}`,
            detail:   `${ep.dailyAvgCalls.toFixed(0)} avg calls/day with no response caching. Deduplication could reduce LLM calls significantly.`,
            metric:   { observed: ep.dailyAvgCalls, baseline: THRESHOLDS.cacheOpportunityDaily, unit: "calls/day" },
        }));
}

function detectSlowAgents(agents: AgentStats[]): OptimizationFinding[] {
    return agents
        .filter((a) => a.avgLatencyMs > THRESHOLDS.slowAgentMs)
        .map((a) => ({
            id:        `slow_agent:${a.agentName}`,
            category:  "slow_agent" as FindingCategory,
            severity:  a.avgLatencyMs > THRESHOLDS.slowAgentMs * 2 ? "high" : "medium" as "medium" | "high",
            agentName: a.agentName,
            label:     `Slow agent: ${a.agentName}`,
            detail:    `Avg latency ${Math.round(a.avgLatencyMs)}ms over ${a.calls} executions/7d. Exceeds ${THRESHOLDS.slowAgentMs}ms threshold.`,
            metric:    { observed: a.avgLatencyMs, baseline: THRESHOLDS.slowAgentMs, unit: "ms" },
        }));
}

function detectErrorProne(stats: EndpointStats[]): OptimizationFinding[] {
    return stats
        .filter((ep) => ep.errorRate > THRESHOLDS.errorRatePct)
        .map((ep) => ({
            id:       `error_prone:${ep.endpoint}`,
            category: "error_prone" as FindingCategory,
            severity: ep.errorRate > 30 ? "high" : ep.errorRate > 15 ? "medium" : "low" as "low" | "medium" | "high",
            endpoint: ep.endpoint,
            label:    `Elevated error rate: ${ep.endpoint}`,
            detail:   `${ep.errorRate.toFixed(1)}% of ${ep.calls} calls returned 0 tokens in 7d. Investigate prompt / provider reliability.`,
            metric:   { observed: ep.errorRate, baseline: THRESHOLDS.errorRatePct, unit: "% error rate" },
        }));
}

function detectModelMismatch(stats: EndpointStats[]): OptimizationFinding[] {
    // gpt-4.1 avg cost per 1k tokens ≈ $0.005 vs gpt-4.1-mini ≈ $0.001
    // Flag endpoints using expensive models where cheaper ones handle the task
    const EXPENSIVE_MODEL_SUBSTRINGS = ["gpt-4.1\"", "gpt-4o\"", "gpt-4.1 ", "gpt-4o "];
    const SIMPLE_ENDPOINTS = new Set(["chat", "suggestions", "landing", "create-trip", "ticket", "budget"]);

    return stats
        .filter((ep) => {
            if (!SIMPLE_ENDPOINTS.has(ep.endpoint)) return false;
            return ep.models.some((m) => EXPENSIVE_MODEL_SUBSTRINGS.some((s) => m.includes(s.trim())));
        })
        .map((ep) => ({
            id:       `model_mismatch:${ep.endpoint}`,
            category: "model_mismatch" as FindingCategory,
            severity: "medium" as const,
            endpoint: ep.endpoint,
            label:    `Overqualified model: ${ep.endpoint}`,
            detail:   `Endpoint "${ep.endpoint}" uses ${ep.models.join("/")} but a cheaper model (gpt-4.1-mini) handles this task class well. Avg cost: $${ep.avgCostUsd.toFixed(5)}/call.`,
            metric:   { observed: ep.avgCostUsd, baseline: ep.avgCostUsd / THRESHOLDS.modelMismatchMultiplier, unit: "USD/call" },
        }));
}

// ─── Recommendation generator ─────────────────────────────────────────────────

function buildRecommendations(
    findings: OptimizationFinding[],
    stats:    EndpointStats[],
): OptimizationRecommendation[] {
    const recs: OptimizationRecommendation[] = [];

    // Cost map for savings estimates
    const costByEndpoint = new Map(stats.map((s) => [s.endpoint, s]));

    for (const f of findings) {
        switch (f.category) {
            case "token_waste": {
                const ep     = costByEndpoint.get(f.endpoint ?? "");
                const saving = ep ? ep.totalCost * 0.25 : 0; // 25% reduction estimated
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "REDUCE_MAX_TOKENS",
                    label:              `Reduce maxTokens for "${f.endpoint}"`,
                    detail:             `Endpoint consistently uses <${(f.metric.observed).toFixed(0)}% of its token budget. A 25–40% reduction would save ~$${saving.toFixed(5)}/7d with no quality impact.`,
                    safetyLevel:        "low_risk",
                    estimatedSavingUsd: saving,
                    autoApplicable:     f.severity !== "low", // only auto-apply medium/high waste
                    applied:            false,
                });
                break;
            }

            case "high_cost": {
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "SWITCH_TO_CHEAPER_MODEL",
                    label:              `Review model selection for "${f.endpoint}"`,
                    detail:             `${f.detail} Consider routing to gpt-4.1-mini or Gemini Flash for cost reduction. Validate output quality before applying.`,
                    safetyLevel:        "medium_risk",
                    estimatedSavingUsd: f.metric.observed * 0.30,
                    autoApplicable:     false, // model switching always needs human review
                    applied:            false,
                });
                break;
            }

            case "cache_opportunity": {
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "ENABLE_CACHE",
                    label:              `Add Redis caching to "${f.endpoint}"`,
                    detail:             `${f.detail} Implement cacheKey + getCached/setCached in src/lib/ai/cache.ts following the existing itinerary pattern.`,
                    safetyLevel:        "low_risk",
                    estimatedSavingUsd: 0, // can't estimate without cache hit rate data
                    autoApplicable:     false, // requires code change
                    applied:            false,
                });
                break;
            }

            case "slow_agent": {
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "INVESTIGATE_AGENT_LATENCY",
                    label:              `Investigate latency in agent "${f.agentName}"`,
                    detail:             `${f.detail} Check: prompt length, number of retry attempts, sequential vs parallel tool calls, and model timeout settings.`,
                    safetyLevel:        "low_risk",
                    estimatedSavingUsd: 0,
                    autoApplicable:     false,
                    applied:            false,
                });
                break;
            }

            case "error_prone": {
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "INVESTIGATE_ERROR_RATE",
                    label:              `Investigate elevated LLM error rate on "${f.endpoint}"`,
                    detail:             `${f.detail} Check: provider outage history, prompt schema validation, output parsing logic, and retry configuration.`,
                    safetyLevel:        "medium_risk",
                    estimatedSavingUsd: 0,
                    autoApplicable:     false,
                    applied:            false,
                });
                break;
            }

            case "model_mismatch": {
                recs.push({
                    id:                 `rec:${f.id}`,
                    findingId:          f.id,
                    type:               "SWITCH_TO_CHEAPER_MODEL",
                    label:              `Downgrade model for "${f.endpoint}"`,
                    detail:             `${f.detail} Run an A/B evaluation against gpt-4.1-mini before switching permanently in modelRouter.ts.`,
                    safetyLevel:        "medium_risk",
                    estimatedSavingUsd: f.metric.observed * f.metric.baseline, // rough estimate
                    autoApplicable:     false,
                    applied:            false,
                });
                break;
            }
        }
    }

    return recs;
}

// ─── Auto-apply (low risk only) ───────────────────────────────────────────────

/**
 * If systemic token waste is detected across multiple endpoints AND the
 * HealingStore has no active overrides, apply a gentle 25% token reduction.
 *
 * Duration: 4 hours (less aggressive than autoHealing's 30–90 min emergency mode).
 * Returns the number of recommendations marked as applied.
 */
function autoApplySafeOptimizations(
    recs:     OptimizationRecommendation[],
    findings: OptimizationFinding[],
): number {
    const healingActive = getHealingStatus().active;
    if (healingActive) {
        logInfo("[OptimizationService] HealingStore has active overrides — skipping auto-apply");
        return 0;
    }

    const autoApplicable = recs.filter((r) => r.autoApplicable && !r.applied);
    if (autoApplicable.length === 0) return 0;

    // Only apply a global token reduction when ≥ N endpoints show token waste
    const wasteFindings = findings.filter((f) => f.category === "token_waste" && f.severity !== "low");
    if (wasteFindings.length < THRESHOLDS.autoApplyMinEndpoints) return 0;

    const totalEstimatedSaving = autoApplicable.reduce((s, r) => s + r.estimatedSavingUsd, 0);

    setHealingOverrides(
        ["reduce_tokens_25pct"],
        "LOW",
        wasteFindings.map((f) => f.endpoint ?? "unknown"),
        `Optimization engine: systemic token over-provisioning on ${wasteFindings.length} endpoints (est. $${totalEstimatedSaving.toFixed(5)} saving/7d). Applied 25% reduction for 4h.`,
        240, // 4 hours
    );

    // Mark as applied
    let count = 0;
    for (const r of autoApplicable) {
        r.applied = true;
        count++;
    }

    logStructured({
        layer: "orchestrator",
        agent: "optimization-engine",
        step:  "output",
        data: {
            appliedAction:  "reduce_tokens_25pct",
            affectedEndpoints: wasteFindings.map((f) => f.endpoint),
            estimatedSavingUsd: totalEstimatedSaving,
        },
    });

    return count;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function persistCycleLog(report: OptimizationReport): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.adminActionLog.create({
            data: {
                actionType: "OPTIMIZATION_CYCLE",
                payload: JSON.parse(JSON.stringify({
                    windowDays:   report.windowDays,
                    findingCount: report.findings.length,
                    recCount:     report.recommendations.length,
                })) as object,
                result: JSON.parse(JSON.stringify({
                    summary:      report.summary,
                    appliedCount: report.appliedCount,
                    totalCost7d:  report.totalCost7d,
                    totalCalls7d: report.totalCalls7d,
                    findings:     report.findings.map((f) => ({ id: f.id, severity: f.severity })),
                })) as object,
                success:  true,
                userId:   "optimization-engine",
            },
        });
    } catch (err) {
        logError("[OptimizationService] Audit log write failed", { error: (err as Error).message });
    }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Run one full optimization analysis cycle.
 *
 * Safe to call repeatedly — idempotent; each run replaces the last report.
 * Wrapped in a 90-second hard timeout to prevent hung DB queries.
 *
 * @param windowDays  Analysis window in days (default: 7)
 */
export async function runOptimizationCycle(windowDays = 7): Promise<OptimizationReport> {
    if (_isRunning) {
        logInfo("[OptimizationService] Cycle already running — skipping");
        return _lastReport ?? buildEmptyReport(windowDays);
    }

    _isRunning = true;
    const startMs     = Date.now();
    const generatedAt = new Date().toISOString();

    logStructured({ layer: "orchestrator", agent: "optimization-engine", step: "start", data: { windowDays } });

    try {
        const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

        // ── Collect raw stats ──────────────────────────────────────────────────
        const [endpointStats, agentStats] = await Promise.all([
            collectEndpointStats(windowStart),
            collectAgentStats(windowStart),
        ]);

        const totalCost7d  = endpointStats.reduce((s, e) => s + e.totalCost, 0);
        const totalCalls7d = endpointStats.reduce((s, e) => s + e.calls, 0);

        // ── Run all finding detectors ──────────────────────────────────────────
        const findings: OptimizationFinding[] = [
            ...detectTokenWaste(endpointStats),
            ...detectHighCost(endpointStats),
            ...detectCacheOpportunity(endpointStats),
            ...detectSlowAgents(agentStats),
            ...detectErrorProne(endpointStats),
            ...detectModelMismatch(endpointStats),
        ];

        logInfo("[OptimizationService] analysis complete", {
            findings:  findings.length,
            endpoints: endpointStats.length,
            agents:    agentStats.length,
        });

        // ── Build recommendations ──────────────────────────────────────────────
        const recommendations = buildRecommendations(findings, endpointStats);

        // ── Auto-apply safe optimizations ────────────────────────────────────
        const appliedCount = autoApplySafeOptimizations(recommendations, findings);

        // ── Compose summary ────────────────────────────────────────────────────
        const highSeverity = findings.filter((f) => f.severity === "high").length;
        const summary = findings.length === 0
            ? "System is well-optimized — no structural inefficiencies detected."
            : `${findings.length} inefficiencie${findings.length > 1 ? "s" : ""} found (${highSeverity} high severity). ` +
              `Est. 7d cost: $${totalCost7d.toFixed(4)} across ${totalCalls7d} calls. ` +
              `${appliedCount > 0 ? `${appliedCount} optimization${appliedCount > 1 ? "s" : ""} auto-applied.` : "No auto-apply (manual review needed)."}`;

        const report: OptimizationReport = {
            generatedAt,
            windowDays,
            totalCost7d,
            totalCalls7d,
            findings,
            recommendations,
            appliedCount,
            summary,
            durationMs: Date.now() - startMs,
        };

        _lastReport = report;
        _runCount  += 1;
        _lastRunAt  = generatedAt;

        logStructured({
            layer: "orchestrator",
            agent: "optimization-engine",
            step:  "end",
            data: { durationMs: report.durationMs, findings: findings.length, applied: appliedCount },
        });

        persistCycleLog(report).catch(() => {});
        return report;

    } finally {
        _isRunning = false;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmptyReport(windowDays: number): OptimizationReport {
    return {
        generatedAt:     new Date().toISOString(),
        windowDays,
        totalCost7d:     0,
        totalCalls7d:    0,
        findings:        [],
        recommendations: [],
        appliedCount:    0,
        summary:         "No data available yet.",
        durationMs:      0,
    };
}
