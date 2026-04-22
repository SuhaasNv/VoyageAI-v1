/**
 * LLM / AI Prometheus metrics.
 *
 * Tracks token usage, latency, provider fallbacks, failure rates, and
 * cost estimates for every LLM call that goes through executeWithRetry().
 */

import { Counter, Histogram, Gauge } from "prom-client";
import { registry } from "./registry";

// ── Request latency ───────────────────────────────────────────────────────────

export const aiRequestDurationSeconds = new Histogram({
    name: "ai_request_duration_seconds",
    help: "LLM request latency in seconds",
    labelNames: ["provider", "model", "agent", "endpoint"] as const,
    buckets: [0.5, 1, 2, 3, 5, 10, 20, 30, 60],
    registers: [registry],
});

// ── Token usage ───────────────────────────────────────────────────────────────

export const aiTokensTotal = new Counter({
    name: "ai_tokens_total",
    help: "Cumulative LLM tokens (prompt + completion)",
    labelNames: ["provider", "model", "agent", "token_type"] as const,
    registers: [registry],
});

// ── Call count ────────────────────────────────────────────────────────────────

export const aiRequestsTotal = new Counter({
    name: "ai_requests_total",
    help: "Total LLM calls",
    labelNames: ["provider", "model", "agent", "status"] as const,
    registers: [registry],
});

// ── Fallback usage ────────────────────────────────────────────────────────────

export const aiFallbackTotal = new Counter({
    name: "ai_fallback_total",
    help: "Number of times the LLM provider fell back to a secondary model",
    labelNames: ["from_provider", "to_provider", "agent"] as const,
    registers: [registry],
});

// ── Failure / timeout tracking ────────────────────────────────────────────────

export const aiFailuresTotal = new Counter({
    name: "ai_failures_total",
    help: "LLM calls that ultimately failed after all retries",
    labelNames: ["provider", "model", "agent", "error_code"] as const,
    registers: [registry],
});

export const aiTimeoutsTotal = new Counter({
    name: "ai_timeouts_total",
    help: "LLM requests that timed out",
    labelNames: ["provider", "model", "agent"] as const,
    registers: [registry],
});

// ── Estimated cost (USD) ──────────────────────────────────────────────────────
// Rough per-token prices; update when pricing changes.

const TOKEN_COST_USD: Record<string, { prompt: number; completion: number }> = {
    "gpt-4.1":          { prompt: 0.000002,  completion: 0.000008  },
    "gpt-4.1-mini":     { prompt: 0.0000004, completion: 0.0000016 },
    "gemini-2.5-flash": { prompt: 0.00000015,completion: 0.0000006 },
    default:            { prompt: 0.000001,  completion: 0.000003  },
};

export const aiCostUsdTotal = new Counter({
    name: "ai_cost_usd_total",
    help: "Estimated cumulative LLM cost in USD",
    labelNames: ["provider", "model", "agent"] as const,
    registers: [registry],
});

// ── Active (in-flight) LLM calls ──────────────────────────────────────────────

export const aiActiveRequests = new Gauge({
    name: "ai_active_requests",
    help: "Number of LLM requests currently in-flight",
    labelNames: ["provider", "agent"] as const,
    registers: [registry],
});

// ── Helper: record a completed LLM call ──────────────────────────────────────

export function recordLLMCall(opts: {
    provider: string;
    model: string;
    agent?: string;
    endpoint?: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    status: "success" | "error" | "fallback";
    errorCode?: string;
    isFallback?: boolean;
    fromProvider?: string;
}): void {
    const {
        provider, model, agent = "default", endpoint = "unknown",
        promptTokens, completionTokens, latencyMs, status,
        errorCode, isFallback, fromProvider,
    } = opts;

    const baseLabels = { provider, model, agent };

    aiRequestDurationSeconds.observe({ ...baseLabels, endpoint }, latencyMs / 1000);
    aiRequestsTotal.inc({ ...baseLabels, status });

    aiTokensTotal.inc({ ...baseLabels, token_type: "prompt" },      promptTokens);
    aiTokensTotal.inc({ ...baseLabels, token_type: "completion" },   completionTokens);
    aiTokensTotal.inc({ ...baseLabels, token_type: "total" },        promptTokens + completionTokens);

    const prices = TOKEN_COST_USD[model] ?? TOKEN_COST_USD.default;
    const costUsd =
        promptTokens     * prices.prompt +
        completionTokens * prices.completion;
    aiCostUsdTotal.inc(baseLabels, costUsd);

    if (isFallback && fromProvider) {
        aiFallbackTotal.inc({ from_provider: fromProvider, to_provider: provider, agent });
    }

    if (status === "error" && errorCode) {
        aiFailuresTotal.inc({ ...baseLabels, error_code: errorCode });
    }
}
