/**
 * lib/analysis/travelScore.ts
 *
 * Deterministic Travel Intelligence Score (0–100).
 * No LLM, no external APIs, no new dependencies.
 * Reuses routeDistanceKm from the existing geo layer.
 *
 * Dimensions (weights must sum to 1.0):
 *   density   0.30 — activity load per day vs ideal range
 *   distance  0.25 — daily travel distance vs comfortable range
 *   budget    0.25 — spend efficiency relative to budget (or day-cost evenness)
 *   diversity 0.20 — variety of activity types across the trip
 */

import { routeDistanceKm } from "@/lib/geo/routeOptimizer";
import type { Itinerary } from "@/lib/ai/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelScoreBreakdown {
    density:   number; // 0–100
    distance:  number; // 0–100
    budget:    number; // 0–100
    diversity: number; // 0–100
}

export interface TravelScoreResult {
    /** Weighted composite score, 0–100. */
    score:     number;
    breakdown: TravelScoreBreakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = { density: 0.30, distance: 0.25, budget: 0.25, diversity: 0.20 } as const;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Ideal activity count per day: 3–5. Penalise below and above. */
function scoreDensity(avg: number): number {
    if (avg <= 1)  return 20;
    if (avg <= 2)  return 50;
    if (avg <= 3)  return 82;
    if (avg <= 4)  return 100;
    if (avg <= 5)  return 92;
    if (avg <= 6)  return 66;
    if (avg <= 7)  return 45;
    return 25;
}

/** Ideal daily travel: <12 km. >25 km penalised heavily. */
function scoreDistance(km: number): number {
    if (km <= 0)   return 55;
    if (km <= 4)   return 70;
    if (km <= 12)  return 100;
    if (km <= 20)  return 78;
    if (km <= 25)  return 58;
    if (km <= 35)  return 38;
    return 18;
}

/** Budget utilisation: 0.70–0.95 of budget = perfect. >1.0 penalised. */
function scoreBudgetWithRef(cost: number, budget: number): number {
    const r = cost / budget;
    if (r < 0.5)   return 60; // heavily under-utilised
    if (r < 0.70)  return 78;
    if (r <= 0.95) return 100;
    if (r <= 1.0)  return 88;
    if (r <= 1.10) return 58;
    if (r <= 1.30) return 38;
    return 18;
}

/** Without a budget reference, reward even distribution of spend across days. */
function scoreBudgetFromVariance(dayCosts: number[]): number {
    const mean = dayCosts.reduce((s, v) => s + v, 0) / dayCosts.length;
    if (mean === 0) return 70;
    const cv = Math.sqrt(
        dayCosts.reduce((s, v) => s + (v - mean) ** 2, 0) / dayCosts.length
    ) / mean;
    if (cv < 0.20) return 90;
    if (cv < 0.40) return 75;
    if (cv < 0.60) return 60;
    return 45;
}

/**
 * Activity type diversity: 6 distinct types → 100.
 * (transport and accommodation are excluded — they appear in almost every trip.)
 */
function scoreDiversity(types: string[]): number {
    const EXCLUDED = new Set(["transport", "accommodation"]);
    const unique = new Set(types.filter(t => !EXCLUDED.has(t))).size;
    return clamp((unique / 6) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function calculateTravelScore(
    itinerary: Itinerary,
    tripBudget?: number
): TravelScoreResult {
    const { days, totalEstimatedCost } = itinerary;

    if (!days.length) {
        return { score: 0, breakdown: { density: 0, distance: 0, budget: 0, diversity: 0 } };
    }

    // ── Density ───────────────────────────────────────────────────────────────
    const avgActivities =
        days.reduce((s, d) => s + d.activities.length, 0) / days.length;
    const density = clamp(scoreDensity(avgActivities));

    // ── Distance ──────────────────────────────────────────────────────────────
    const avgDistance =
        days.reduce((s, d) => s + routeDistanceKm(d.activities), 0) / days.length;
    const distance = clamp(scoreDistance(avgDistance));

    // ── Budget ────────────────────────────────────────────────────────────────
    const budget = clamp(
        typeof tripBudget === "number" && tripBudget > 0
            ? scoreBudgetWithRef(totalEstimatedCost.amount, tripBudget)
            : scoreBudgetFromVariance(days.map(d => d.totalCost.amount))
    );

    // ── Diversity ─────────────────────────────────────────────────────────────
    const allTypes = days.flatMap(d => d.activities.map(a => a.type));
    const diversity = clamp(scoreDiversity(allTypes));

    // ── Composite ─────────────────────────────────────────────────────────────
    const score = clamp(
        density   * WEIGHTS.density  +
        distance  * WEIGHTS.distance +
        budget    * WEIGHTS.budget   +
        diversity * WEIGHTS.diversity
    );

    return { score, breakdown: { density, distance, budget, diversity } };
}
