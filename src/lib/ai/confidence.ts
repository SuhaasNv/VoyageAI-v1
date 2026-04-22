/**
 * lib/ai/confidence.ts
 *
 * Heuristic confidence scoring for the VoyageAI pipeline stages.
 *
 * ─── Design rationale ─────────────────────────────────────────────────────────
 *
 * Confidence reflects two orthogonal dimensions:
 *
 *   1. Execution mode — was the output produced deterministically (code),
 *      with grounded external data (LLM + Bright Data / Mapbox), or purely
 *      from LLM parametric knowledge (LLM-only fallback)?
 *
 *   2. Quality signals — penalties applied when observed signals suggest the
 *      output is less reliable than the base mode implies.
 *
 * The two-part formula is:
 *
 *   confidence = BASE_SCORE[mode] − Σ(applicable penalties)
 *
 * ─── Base scores ──────────────────────────────────────────────────────────────
 *
 *   DETERMINISTIC   = 1.00   — pure TypeScript, no LLM, no external data
 *   LLM_GROUNDED    = 0.82   — LLM output verified / enriched with external data
 *   LLM_ONLY        = 0.62   — LLM parametric knowledge; no external verification
 *
 * ─── Penalty table ────────────────────────────────────────────────────────────
 *
 *   FALLBACK_USED      = 0.08  — a subsystem fell back to a default/estimate
 *   LOW_GEO_CONFIDENCE = 0.05  — ≥ 50% of activities have low geocode confidence
 *   WARNINGS_PRESENT   = 0.05  — non-fatal warnings were emitted
 *   PARTIAL_DATA       = 0.05  — expected data was absent / partially resolved
 *
 * ─── One-sentence explainer (viva-ready) ──────────────────────────────────────
 *
 *   "Confidence starts from the execution mode (deterministic / grounded / LLM-only)
 *    and is reduced by observable quality signals such as fallback usage, low
 *    geocoding accuracy, or partial data — so every score is directly traceable
 *    to what the system actually did."
 */

// ─── Base scores ──────────────────────────────────────────────────────────────

/** Execution modes in increasing order of uncertainty. */
export type ConfidenceMode =
    | "DETERMINISTIC"   // pure code path — budget math, safety rules
    | "LLM_GROUNDED"    // LLM + verified external data (Bright Data, Mapbox)
    | "LLM_ONLY";       // LLM parametric knowledge — no external grounding

export const BASE_SCORE: Record<ConfidenceMode, number> = {
    DETERMINISTIC: 1.00,
    LLM_GROUNDED:  0.82,
    LLM_ONLY:      0.62,
} as const;

// ─── Penalty table ────────────────────────────────────────────────────────────

/** Modifiers applied on top of the base score. All values are negative deltas. */
export const PENALTY = {
    /** A subsystem used a default value / estimate instead of real data. */
    FALLBACK_USED:      0.08,
    /** ≥ 50% of geocoded locations have low confidence. */
    LOW_GEO_CONFIDENCE: 0.05,
    /** The stage emitted non-fatal warnings. */
    WARNINGS_PRESENT:   0.05,
    /** Expected data was absent or only partially resolved. */
    PARTIAL_DATA:       0.05,
} as const;

// ─── Input bag ────────────────────────────────────────────────────────────────

export interface ConfidenceInput {
    /** Execution mode — determines the base score. */
    mode: ConfidenceMode;

    /**
     * True when a subsystem fell back to an estimate (e.g. LLM-only research
     * because Bright Data was unavailable, or deterministic cost fallback).
     */
    usedFallback?: boolean;

    /**
     * Fraction of activities/hotels that have `geoConfidence === "low"`.
     * Pass a value in [0, 1]; penalty applied when ≥ 0.5.
     */
    lowGeoFraction?: number;

    /**
     * True when the stage emitted non-fatal warnings (logistics, safety, budget).
     */
    hasWarnings?: boolean;

    /**
     * True when expected data was absent (e.g. no foodCostSummary from logistics,
     * zero hotels returned).
     */
    hasPartialData?: boolean;
}

// ─── Score function ───────────────────────────────────────────────────────────

/**
 * Compute a defensible confidence score for a pipeline stage.
 *
 * Returns a value in [0.00, 1.00] rounded to 2 decimal places.
 *
 * Every returned value maps back to a documented base score and a documented
 * penalty table — no magic numbers anywhere in the pipeline.
 */
export function computeConfidence(input: ConfidenceInput): number {
    let score = BASE_SCORE[input.mode];

    if (input.usedFallback)                            score -= PENALTY.FALLBACK_USED;
    if ((input.lowGeoFraction ?? 0) >= 0.5)            score -= PENALTY.LOW_GEO_CONFIDENCE;
    if (input.hasWarnings)                             score -= PENALTY.WARNINGS_PRESENT;
    if (input.hasPartialData)                          score -= PENALTY.PARTIAL_DATA;

    // Clamp to [0, 1] and round to 2 d.p. so UI displays clean values.
    return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

// ─── Helpers used by individual route files ───────────────────────────────────

/**
 * Computes the fraction of items (activities or hotels) whose geocoding
 * confidence is "low".  Pass an empty array to get 0.
 */
export function lowGeoFraction(items: Array<{ geoConfidence?: string }>): number {
    if (items.length === 0) return 0;
    const lowCount = items.filter((i) => i.geoConfidence === "low").length;
    return lowCount / items.length;
}
