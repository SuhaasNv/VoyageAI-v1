/**
 * Explainability Layer
 *
 * Provides a unified `_meta` envelope for every AI stage response so that
 * callers — UI, evaluators, auditors — can always answer:
 *   • How confident is the system in this output?       → confidence
 *   • Why was this output produced?                     → reasoning
 *   • What data was used?                               → sources
 *   • What decisions were taken step-by-step?           → decisionsLog
 *
 * Usage in an API route:
 *
 *   import { computeConfidence } from "@/lib/ai/confidence";
 *
 *   return successResponse(
 *     formatAIResponse(result, {
 *       // Always use computeConfidence() — never hardcode a raw number.
 *       confidence: computeConfidence({ mode: "LLM_GROUNDED", usedFallback: false }),
 *       reasoning:  "Parsed 5-day trip to Tokyo using LLM + deterministic normalization.",
 *       sources:    ["User input", "Date analysis"],
 *       durationMs,
 *       decisionsLog: [...],
 *     })
 *   );
 *
 * Backward-compatible: `dataSources` and `decisionsLog` fields already present
 * in the codebase are preserved. The new required fields are `confidence`,
 * `reasoning`, and `sources`.
 */

import { CONFIDENCE_TYPE, type ConfidenceType } from "@/lib/ai/confidence";

// ─── Core interface ────────────────────────────────────────────────────────────

/**
 * Standardised explainability envelope attached to every AI response `_meta`.
 *
 * Required fields (always present after `formatAIResponse`):
 *   confidence      — 0.0–1.0 heuristic indicator (NOT a calibrated probability)
 *   confidenceType  — always "heuristic"; clarifies the epistemological category
 *   reasoning       — one human-readable sentence explaining the output
 *   sources         — list of data sources consulted
 *
 * Optional fields (kept for backward-compatibility and debugging):
 *   durationMs    — wall-clock time for this stage
 *   decisionsLog  — ordered audit trail of decisions taken
 *   dataSources   — legacy alias of sources (kept for UI backward compat)
 */
export interface AIResponseMeta {
    /**
     * 0.0–1.0 heuristic score.
     *
     * ⚠  This is NOT a calibrated probability — it does not mean the output
     * will be correct `confidence × 100`% of the time.  It is a rule-derived
     * indicator: 1.0 = fully deterministic code path, <1.0 = LLM-dependent
     * or has observed quality penalties.  See lib/ai/confidence.ts for the
     * full penalty table.
     */
    confidence: number;
    /**
     * Always "heuristic" for pipeline-stage responses.
     * Exposed so UI labels can display the correct epistemological category
     * rather than implying a statistical success rate.
     */
    confidenceType: ConfidenceType;
    /** Plain-English explanation of what the agent did and why. */
    reasoning: string;
    /** Canonical list of data sources consulted to produce this output. */
    sources: string[];
    /** Wall-clock time in ms for this stage. */
    durationMs?: number;
    /** Ordered step-by-step audit trail for detailed debugging. */
    decisionsLog?: string[];
    /**
     * Legacy alias — mirrors `sources`. Kept so existing UI consumers that
     * read `_meta.dataSources` continue to work without changes.
     */
    dataSources?: string[];
}

/** Utility type: any object T with a standardised `_meta` appended. */
export type WithAIMeta<T> = T & { _meta: AIResponseMeta };

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Wraps an agent output with a standardised `_meta` block.
 *
 * - Clamps `confidence` to [0, 1].
 * - Mirrors `sources` into `dataSources` for backward compatibility.
 * - Spreads `data` so the return value is directly usable in `successResponse`.
 */
export function formatAIResponse<T extends object>(
    data: T,
    meta: {
        confidence: number;
        reasoning: string;
        sources: string[];
        durationMs?: number;
        decisionsLog?: string[];
    },
): WithAIMeta<T> {
    const confidence = Math.max(0, Math.min(1, meta.confidence));

    return {
        ...data,
        _meta: {
            confidence,
            confidenceType: CONFIDENCE_TYPE,     // always "heuristic" for pipeline stages
            reasoning:   meta.reasoning,
            sources:     meta.sources,
            dataSources: meta.sources,           // backward-compat mirror
            ...(meta.durationMs   !== undefined && { durationMs:   meta.durationMs }),
            ...(meta.decisionsLog !== undefined && { decisionsLog: meta.decisionsLog }),
        },
    };
}
