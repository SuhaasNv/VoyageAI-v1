/**
 * src/services/ai/healingStore.ts
 *
 * In-process singleton that holds the current auto-healing overrides.
 *
 * Why in-memory (not DB):
 *  - Healing actions need zero-latency application on every LLM call
 *  - The modelRouter.ts must stay synchronous — no await allowed there
 *  - Cold-start resets are acceptable; the engine re-evaluates in the next
 *    run cycle and can restore state from DB audit logs if needed
 *
 * Thread safety: Node.js is single-threaded; no mutex needed.
 *
 * External usage:
 *  - autoHealing.service.ts  — writes new healing overrides
 *  - modelRouter.ts           — reads overrides via applyHealingOverrides()
 *  - /api/admin/auto-heal     — reads status for admin visibility
 */

import { logInfo, logError } from "@/infrastructure/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Actions the LLM decision layer can prescribe. */
export type HealingAction =
    | "reduce_tokens_25pct"
    | "reduce_tokens_50pct"
    | "prefer_gemini"
    | "enable_timeout_reduction"
    | "clear_healing"
    | "no_action";

export interface HealingOverrides {
    /** Multiply maxTokens from modelRouter by this factor (0–1). 1 = no change. */
    maxTokensMultiplier:    number;
    /** If true, swap "openai" → "gemini" when GEMINI_API_KEY is present. */
    preferFallbackProvider: boolean;
    /** If true, reduce all timeoutMs values by 30 %. */
    reduceTimeouts:         boolean;
    /** Human-readable list of currently active remediations. */
    activeActions:          HealingAction[];
    /** ISO timestamp when the overrides were applied. */
    appliedAt:              string | null;
    /** ISO timestamp when overrides auto-expire. null = never (until cleared). */
    expiresAt:              string | null;
    /** Trigger: anomaly label(s) that caused this healing cycle. */
    triggers:               string[];
    /** LLM-generated reasoning for the current overrides. */
    reasoning:              string;
}

export type HealingAssessment = "OK" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Full status snapshot returned to the admin API. */
export interface HealingStatus {
    active:       boolean;
    assessment:   HealingAssessment;
    overrides:    HealingOverrides;
    lastRunAt:    string | null;
    nextRunAt:    string | null;
    runCount:     number;
}

// ─── Default / cleared state ──────────────────────────────────────────────────

const NEUTRAL_OVERRIDES: HealingOverrides = {
    maxTokensMultiplier:    1.0,
    preferFallbackProvider: false,
    reduceTimeouts:         false,
    activeActions:          [],
    appliedAt:              null,
    expiresAt:              null,
    triggers:               [],
    reasoning:              "System is within normal operating parameters.",
};

// ─── Singleton state ──────────────────────────────────────────────────────────

let _overrides: HealingOverrides = { ...NEUTRAL_OVERRIDES };
let _assessment: HealingAssessment = "OK";
let _lastRunAt: string | null = null;
let _nextRunAt: string | null = null;
let _runCount = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

export function getHealingStatus(): HealingStatus {
    // Auto-expire: if expiresAt is in the past, clear overrides before returning
    if (_overrides.expiresAt && new Date(_overrides.expiresAt) < new Date()) {
        logInfo("[HealingStore] overrides expired — auto-clearing");
        clearHealingOverrides("auto-expiry");
    }

    return {
        active:    _overrides.activeActions.length > 0,
        assessment: _assessment,
        overrides: { ..._overrides },
        lastRunAt: _lastRunAt,
        nextRunAt: _nextRunAt,
        runCount:  _runCount,
    };
}

export function setHealingOverrides(
    actions:         HealingAction[],
    assessment:      HealingAssessment,
    triggers:        string[],
    reasoning:       string,
    durationMinutes: number,
): void {
    const now = new Date();

    _overrides = {
        maxTokensMultiplier:    computeTokenMultiplier(actions),
        preferFallbackProvider: actions.includes("prefer_gemini") && !!process.env.GEMINI_API_KEY,
        reduceTimeouts:         actions.includes("enable_timeout_reduction"),
        activeActions:          actions.filter((a) => a !== "no_action" && a !== "clear_healing"),
        appliedAt:              now.toISOString(),
        expiresAt:              durationMinutes > 0
            ? new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString()
            : null,
        triggers,
        reasoning,
    };

    _assessment = assessment;
    _lastRunAt  = now.toISOString();
    _runCount  += 1;

    logInfo("[HealingStore] overrides applied", {
        assessment,
        actions: _overrides.activeActions,
        maxTokensMultiplier: _overrides.maxTokensMultiplier,
        preferGemini: _overrides.preferFallbackProvider,
        expiresAt: _overrides.expiresAt,
    });
}

export function clearHealingOverrides(reason = "manual"): void {
    if (_overrides.activeActions.length === 0) return;
    logInfo("[HealingStore] overrides cleared", { reason, previous: _overrides.activeActions });
    _overrides  = { ...NEUTRAL_OVERRIDES };
    _assessment = "OK";
    _lastRunAt  = new Date().toISOString();
    _runCount  += 1;
}

export function recordRunTimestamps(lastRun: Date, intervalMinutes: number): void {
    _lastRunAt = lastRun.toISOString();
    _nextRunAt = new Date(lastRun.getTime() + intervalMinutes * 60 * 1000).toISOString();
}

// ─── Model router integration ─────────────────────────────────────────────────

export interface ModelConfigShape {
    provider:    "openai" | "gemini";
    model:       string;
    maxTokens:   number;
    timeoutMs:   number;
    temperature: number;
}

/**
 * Called by modelRouter.selectModelConfig() before returning.
 * Applies any active healing overrides to the resolved config.
 */
export function applyHealingOverrides<T extends ModelConfigShape>(config: T): T {
    // Check expiry inline (synchronous hot path, no I/O)
    if (_overrides.expiresAt && new Date(_overrides.expiresAt) < new Date()) {
        clearHealingOverrides("auto-expiry");
        return config;
    }

    if (_overrides.activeActions.length === 0) return config;

    const result = { ...config };

    // Token reduction
    if (_overrides.maxTokensMultiplier < 1.0) {
        result.maxTokens = Math.max(256, Math.floor(config.maxTokens * _overrides.maxTokensMultiplier));
    }

    // Provider switch (openai → gemini)
    if (_overrides.preferFallbackProvider && config.provider === "openai") {
        result.provider = "gemini";
        // Keep same model family tier — we don't rewrite the model string here;
        // the existing fallback chain in executeWithRetry handles provider routing.
    }

    // Timeout reduction (30%)
    if (_overrides.reduceTimeouts) {
        result.timeoutMs = Math.max(10_000, Math.floor(config.timeoutMs * 0.7));
    }

    return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTokenMultiplier(actions: HealingAction[]): number {
    if (actions.includes("reduce_tokens_50pct")) return 0.5;
    if (actions.includes("reduce_tokens_25pct")) return 0.75;
    return 1.0;
}
