/**
 * src/lib/ai/modelSelector.ts
 *
 * Dynamic AI Cost Optimization Engine.
 *
 * Complements modelRouter.ts (which routes by endpoint) with a semantic
 * routing layer that routes by { task, priority } using historical performance
 * data from AiUsageLog.
 *
 * HOW IT WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Each (task × priority) has a ranked candidate list — models ordered by
 *    their default preference (cheapest-first for "cost", most-capable-first
 *    for "quality").
 *
 * 2. A stats cache holds 7-day aggregate performance per (task × model):
 *    avgCost, avgLatency, errorRate, sampleCount.  The cache refreshes
 *    lazily (stale-while-revalidate, 5-minute TTL). selectModel() is always
 *    synchronous — it uses whatever stats are cached at call time and fires an
 *    async refresh if the cache is stale.
 *
 * 3. Once a model has ≥ MIN_SAMPLES calls for a task, the static candidate
 *    order is replaced by a scored ranking:
 *
 *      score = costWeight   × (1 − normCost)
 *            + speedWeight  × (1 − normLatency)
 *            + qualityWeight × (1 − errorRate)
 *
 *    Weights are derived from priority.  The highest-scoring available model
 *    (key present, API key set) wins.
 *
 * 4. The result is piped through applyHealingOverrides() so auto-healing
 *    token reduction / provider switching is always respected.
 *
 * INTEGRATION POINTS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - selectModel()         → call in any new service / API route
 *  - refreshStatsCache()   → call once on server warm-up (optional)
 *  - getModelInsights()    → admin API /api/admin/model-insights
 *  - applyHealingOverrides() from healingStore.ts is called internally
 */

import { logInfo, logError } from "@/infrastructure/logger";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";
import { applyHealingOverrides }  from "@/services/ai/healingStore";
import type { ModelConfig } from "./modelRouter";

// ─── Public types ─────────────────────────────────────────────────────────────

export type Task     = "chat" | "itinerary" | "analysis";
export type Priority = "cost" | "quality" | "speed";

export interface SelectModelOptions {
    task:      Task;
    priority:  Priority;
    /** Caller-supplied upper bound on acceptable cost per call (USD). */
    maxCostUsd?: number;
    /** Caller-supplied upper bound on acceptable latency (ms). */
    maxLatencyMs?: number;
}

export interface ModelInsight {
    task:          Task;
    model:         string;
    provider:      "openai" | "gemini";
    sampleCount:   number;
    avgCostUsd:    number;
    avgLatencyMs:  number;
    errorRatePct:  number;
    /** Computed composite score for this model under each priority. */
    scores:        Record<Priority, number>;
    /** Whether this model is currently selected for each priority. */
    selected:      Record<Priority, boolean>;
    lastUpdatedAt: string;
}

export interface SelectionResult {
    config:    ModelConfig;
    model:     string;
    task:      Task;
    priority:  Priority;
    /** true = data-driven selection; false = fell back to static default */
    dataDriven:   boolean;
    sampleCount:  number;
    estimatedCostUsd: number;
}

// ─── Pricing table ($ per 1M tokens, input+output blended) ───────────────────
// Used for scoring candidates before any real call is made.

const PRICE_PER_1M_TOKENS: Record<string, number> = {
    "gpt-4.1":           (2.0 + 8.0)   / 2,   // $5.00
    "gpt-4.1-mini":      (0.4 + 1.6)   / 2,   // $1.00
    "gpt-4o":            (2.5 + 10.0)  / 2,   // $6.25
    "gpt-4o-mini":       (0.15 + 0.60) / 2,   // $0.375
    "gemini-2.5-flash":  (0.15 + 0.60) / 2,   // $0.375
    "gemini-2.5-pro":    (1.25 + 10.0) / 2,   // $5.625
    "gemini-1.5-flash":  (0.075 + 0.30)/ 2,   // $0.1875
    "mock":              0,
};

function staticCostPerCall(model: string, avgTokens = 1500): number {
    const key = Object.keys(PRICE_PER_1M_TOKENS).find((k) => model.toLowerCase().includes(k));
    const rate = key !== undefined ? PRICE_PER_1M_TOKENS[key] : 1.0;
    return (avgTokens / 1_000_000) * rate;
}

// ─── Candidate definitions ────────────────────────────────────────────────────
// Ordered from "most preferred default" to "least preferred default" for each
// (task, priority) pair.  The scoring engine may reorder this at runtime.

interface Candidate {
    model:    string;
    provider: "openai" | "gemini";
    /** Expected avg token usage for this task (used for static cost estimate). */
    avgTokens: number;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
}

const GEMINI_FLASH = process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash";

const CANDIDATES: Record<Task, Record<Priority, Candidate[]>> = {
    chat: {
        cost: [
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 600,  maxTokens: 2048,  temperature: 0.7, timeoutMs: 25_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 600,  maxTokens: 2048,  temperature: 0.7, timeoutMs: 25_000 },
        ],
        speed: [
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 600,  maxTokens: 1024,  temperature: 0.7, timeoutMs: 15_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 600,  maxTokens: 1024,  temperature: 0.7, timeoutMs: 15_000 },
        ],
        quality: [
            { model: "gpt-4.1",       provider: "openai", avgTokens: 800,  maxTokens: 2048,  temperature: 0.7, timeoutMs: 30_000 },
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 600,  maxTokens: 2048,  temperature: 0.7, timeoutMs: 25_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 600,  maxTokens: 2048,  temperature: 0.7, timeoutMs: 25_000 },
        ],
    },

    itinerary: {
        cost: [
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 4000, maxTokens: 8192,  temperature: 0.7, timeoutMs: 60_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 4000, maxTokens: 8192,  temperature: 0.7, timeoutMs: 60_000 },
        ],
        speed: [
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 3500, maxTokens: 6144,  temperature: 0.7, timeoutMs: 45_000 },
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 4000, maxTokens: 6144,  temperature: 0.7, timeoutMs: 45_000 },
        ],
        quality: [
            { model: "gpt-4.1",       provider: "openai", avgTokens: 5000, maxTokens: 8192,  temperature: 0.7, timeoutMs: 90_000 },
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 4000, maxTokens: 8192,  temperature: 0.7, timeoutMs: 60_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 4000, maxTokens: 8192,  temperature: 0.7, timeoutMs: 60_000 },
        ],
    },

    analysis: {
        cost: [
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 1200, maxTokens: 4096,  temperature: 0.3, timeoutMs: 30_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 1200, maxTokens: 4096,  temperature: 0.3, timeoutMs: 30_000 },
        ],
        speed: [
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 1000, maxTokens: 2048,  temperature: 0.3, timeoutMs: 20_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 1000, maxTokens: 2048,  temperature: 0.3, timeoutMs: 20_000 },
        ],
        quality: [
            { model: "gpt-4.1",       provider: "openai", avgTokens: 2000, maxTokens: 4096,  temperature: 0.3, timeoutMs: 45_000 },
            { model: "gpt-4.1-mini",  provider: "openai", avgTokens: 1200, maxTokens: 4096,  temperature: 0.3, timeoutMs: 30_000 },
            { model: GEMINI_FLASH,    provider: "gemini", avgTokens: 1200, maxTokens: 4096,  temperature: 0.3, timeoutMs: 30_000 },
        ],
    },
};

// ─── Priority scoring weights ─────────────────────────────────────────────────

const PRIORITY_WEIGHTS: Record<Priority, { cost: number; speed: number; quality: number }> = {
    cost:    { cost: 0.65, speed: 0.20, quality: 0.15 },
    speed:   { cost: 0.15, speed: 0.65, quality: 0.20 },
    quality: { cost: 0.10, speed: 0.20, quality: 0.70 },
};

// Minimum DB samples needed before we trust historical data over static defaults
const MIN_SAMPLES = 20;

// ─── Stats cache ──────────────────────────────────────────────────────────────

interface ModelStats {
    avgCostUsd:   number;
    avgLatencyMs: number;
    errorRatePct: number;
    sampleCount:  number;
}

// task:model → stats
const _cache = new Map<string, ModelStats>();
let _cacheRefreshedAt: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(task: Task, model: string): string {
    return `${task}:${model}`;
}

function isCacheStale(): boolean {
    if (!_cacheRefreshedAt) return true;
    return Date.now() - _cacheRefreshedAt.getTime() > CACHE_TTL_MS;
}

// Endpoint substrings that identify each task in AiUsageLog.endpoint
const TASK_ENDPOINT_HINTS: Record<Task, string[]> = {
    chat:      ["chat"],
    itinerary: ["itinerary", "reoptimize"],
    analysis:  ["assistant", "admin", "analysis"],
};

/**
 * Refreshes the in-memory stats cache from AiUsageLog.
 * Asynchronous — called lazily in the background so selectModel() stays sync.
 */
export async function refreshStatsCache(): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Fetch all records from the last 7 days — one query, aggregate in memory
        const raw = await prisma.aiUsageLog.findMany({
            where:  { createdAt: { gte: sevenDaysAgo } },
            select: {
                modelUsed:       true,
                endpoint:        true,
                latencyMs:       true,
                costEstimateUsd: true,
                totalTokens:     true,
                callSucceeded:   true,
            },
        });

        // Bucket by task × model
        type Bucket = { cost: number[]; latency: number[]; errors: number };
        const buckets = new Map<string, Bucket>();

        for (const row of raw) {
            const task = classifyEndpointToTask(row.endpoint ?? "");
            if (!task) continue;

            const key = cacheKey(task, normalizeModelName(row.modelUsed));
            if (!buckets.has(key)) buckets.set(key, { cost: [], latency: [], errors: 0 });
            const b = buckets.get(key)!;
            b.cost.push(row.costEstimateUsd);
            b.latency.push(row.latencyMs);
            if (isAiUsageLogFailure(row)) b.errors++;
        }

        // Write aggregates into _cache
        for (const [key, b] of buckets) {
            const n = b.cost.length;
            _cache.set(key, {
                avgCostUsd:   n > 0 ? b.cost.reduce((a, c) => a + c, 0) / n : 0,
                avgLatencyMs: n > 0 ? b.latency.reduce((a, c) => a + c, 0) / n : 0,
                errorRatePct: n > 0 ? (b.errors / n) * 100 : 0,
                sampleCount:  n,
            });
        }

        _cacheRefreshedAt = new Date();
        logInfo("[ModelSelector] stats cache refreshed", { buckets: buckets.size, records: raw.length });
    } catch (err) {
        logError("[ModelSelector] stats cache refresh failed", { error: (err as Error).message });
    }
}

function classifyEndpointToTask(endpoint: string): Task | null {
    const lower = endpoint.toLowerCase();
    for (const [task, hints] of Object.entries(TASK_ENDPOINT_HINTS) as [Task, string[]][]) {
        if (hints.some((h) => lower.includes(h))) return task;
    }
    return null;
}

function normalizeModelName(raw: string): string {
    // Strip provider prefixes like "openai/gpt-4.1-mini" → "gpt-4.1-mini"
    const parts = raw.split("/");
    return parts[parts.length - 1].toLowerCase();
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

function scoreCandidate(
    stats: ModelStats,
    allStats: ModelStats[],
    priority: Priority,
): number {
    const weights = PRIORITY_WEIGHTS[priority];

    // Normalize each dimension across the candidate set (0 = worst, 1 = best)
    const costs    = allStats.map((s) => s.avgCostUsd).filter((v) => v > 0);
    const latencies = allStats.map((s) => s.avgLatencyMs).filter((v) => v > 0);

    const maxCost    = Math.max(...costs,    0.001);
    const maxLatency = Math.max(...latencies, 1);

    const normCost    = stats.avgCostUsd   / maxCost;
    const normLatency = stats.avgLatencyMs / maxLatency;
    const errorRate   = Math.min(stats.errorRatePct / 100, 1);

    return (
        weights.cost    * (1 - normCost)    +
        weights.speed   * (1 - normLatency) +
        weights.quality * (1 - errorRate)
    );
}

// ─── Provider availability ────────────────────────────────────────────────────

function isProviderAvailable(provider: "openai" | "gemini"): boolean {
    if (provider === "openai") return !!process.env.OPENAI_API_KEY;
    if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
    return false;
}

// ─── Core selection logic ─────────────────────────────────────────────────────

/**
 * Select the optimal model for a given task and priority.
 *
 * Always synchronous — uses cached stats (stale-while-revalidate).
 * Fires a background cache refresh if the cache is stale.
 */
export function selectModel(opts: SelectModelOptions): SelectionResult {
    const { task, priority, maxCostUsd, maxLatencyMs } = opts;

    // Trigger a background cache refresh if stale (don't await — stay sync)
    if (isCacheStale()) {
        refreshStatsCache().catch(() => {/* logged inside */});
    }

    const candidates = CANDIDATES[task][priority];

    // Filter by provider availability and caller constraints
    const available = candidates.filter((c) => {
        if (!isProviderAvailable(c.provider)) return false;
        if (maxCostUsd !== undefined && staticCostPerCall(c.model, c.avgTokens) > maxCostUsd) return false;
        if (maxLatencyMs !== undefined && c.timeoutMs > maxLatencyMs * 2) return false;
        return true;
    });

    // If no configured provider is available, fall back to the first candidate
    // (the LLM stack will use mock / whatever is configured)
    const pool = available.length > 0 ? available : candidates;

    // Attempt data-driven scoring
    const statsForPool = pool.map((c) => ({
        candidate: c,
        stats: _cache.get(cacheKey(task, normalizeModelName(c.model))),
    }));

    const scored = statsForPool.filter(
        (e) => e.stats && e.stats.sampleCount >= MIN_SAMPLES
    );

    let winner: Candidate;
    let dataDriven = false;
    let sampleCount = 0;

    if (scored.length >= 2) {
        // Enough data to score: pick highest scoring candidate
        const allStats = scored.map((e) => e.stats!);
        const ranked = scored
            .map((e) => ({ candidate: e.candidate, score: scoreCandidate(e.stats!, allStats, priority) }))
            .sort((a, b) => b.score - a.score);

        winner     = ranked[0].candidate;
        dataDriven = true;
        sampleCount = scored.find((e) => e.candidate === winner)?.stats?.sampleCount ?? 0;

        logInfo("[ModelSelector] data-driven selection", {
            task, priority, winner: winner.model,
            score: ranked[0].score.toFixed(3),
            runner_up: ranked[1]?.candidate.model,
        });
    } else {
        // Insufficient data: use static default (first in pool)
        winner      = pool[0];
        sampleCount = statsForPool[0]?.stats?.sampleCount ?? 0;
    }

    const base: ModelConfig = {
        provider:    winner.provider,
        model:       winner.model,
        temperature: winner.temperature,
        maxTokens:   winner.maxTokens,
        timeoutMs:   winner.timeoutMs,
    };

    // Apply any active auto-healing overrides
    const config = applyHealingOverrides(base);

    return {
        config,
        model:            winner.model,
        task,
        priority,
        dataDriven,
        sampleCount,
        estimatedCostUsd: staticCostPerCall(winner.model, winner.avgTokens),
    };
}

// ─── Admin insights ───────────────────────────────────────────────────────────

/**
 * Returns per-(task × model) performance insights for the admin panel.
 * Triggers a fresh cache refresh before building the response.
 */
export async function getModelInsights(task?: Task): Promise<ModelInsight[]> {
    await refreshStatsCache();

    const tasks: Task[] = task ? [task] : ["chat", "itinerary", "analysis"];
    const insights: ModelInsight[] = [];

    for (const t of tasks) {
        // Collect all unique models across all priorities for this task
        const allCandidates = new Map<string, Candidate>();
        for (const priority of (["cost", "speed", "quality"] as Priority[])) {
            for (const c of CANDIDATES[t][priority]) {
                allCandidates.set(c.model, c);
            }
        }

        for (const [, candidate] of allCandidates) {
            const key   = cacheKey(t, normalizeModelName(candidate.model));
            const stats = _cache.get(key) ?? {
                avgCostUsd: staticCostPerCall(candidate.model, candidate.avgTokens),
                avgLatencyMs: candidate.timeoutMs / 3,
                errorRatePct: 0,
                sampleCount:  0,
            };

            // Compute scores for all priorities
            const allStats = [...allCandidates.values()].map((c) => {
                const s = _cache.get(cacheKey(t, normalizeModelName(c.model)));
                return s ?? { avgCostUsd: staticCostPerCall(c.model, c.avgTokens), avgLatencyMs: c.timeoutMs / 3, errorRatePct: 0, sampleCount: 0 };
            });

            const scores = {
                cost:    scoreCandidate(stats, allStats, "cost"),
                speed:   scoreCandidate(stats, allStats, "speed"),
                quality: scoreCandidate(stats, allStats, "quality"),
            };

            // Is this the currently selected model for each priority?
            const selected: Record<Priority, boolean> = {
                cost:    selectModel({ task: t, priority: "cost"    }).model === candidate.model,
                speed:   selectModel({ task: t, priority: "speed"   }).model === candidate.model,
                quality: selectModel({ task: t, priority: "quality" }).model === candidate.model,
            };

            insights.push({
                task:          t,
                model:         candidate.model,
                provider:      candidate.provider,
                sampleCount:   stats.sampleCount,
                avgCostUsd:    stats.avgCostUsd,
                avgLatencyMs:  stats.avgLatencyMs,
                errorRatePct:  stats.errorRatePct,
                scores,
                selected,
                lastUpdatedAt: _cacheRefreshedAt?.toISOString() ?? new Date().toISOString(),
            });
        }
    }

    return insights;
}

/**
 * Returns a compact routing decision summary — useful for logging in API routes.
 *
 * Usage:
 *   const { config } = selectModel({ task: "itinerary", priority: "cost" });
 *   const llmOptions = { ...config, responseFormat: "json" as const, retries: 2 };
 */
export { type SelectModelOptions as ModelSelectorOptions };
