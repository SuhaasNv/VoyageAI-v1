/**
 * lib/analysis/explainTrip.ts
 *
 * Deterministic AI Explainability — no LLM calls.
 * Assembles human-readable bullet points that justify why the itinerary
 * was structured the way it was, using the same data already computed
 * client-side: itinerary fields, Travel DNA, score breakdown, and risks.
 */

import type { Itinerary, TravelDNA } from "@/lib/ai/schemas";
import type { TravelScoreBreakdown } from "./travelScore";
import type { RiskAnalysisResult } from "./tripRiskEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplainTripInput {
    itinerary:      Itinerary;
    travelDNA?:     TravelDNA;
    scoreBreakdown?: TravelScoreBreakdown;
    risks?:         RiskAnalysisResult;
}

export interface ExplainTripResult {
    bullets: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function listJoin(items: string[], max = 3): string {
    const slice = items.slice(0, max);
    if (slice.length <= 1) return slice[0] ?? "";
    return `${slice.slice(0, -1).join(", ")} and ${slice[slice.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

export function generateTripExplanation({
    itinerary,
    travelDNA,
    scoreBreakdown,
    risks,
}: ExplainTripInput): ExplainTripResult {
    const bullets: string[] = [];
    const { days, totalEstimatedCost, destination, totalDays, aiInsights, pacingAnalysis } = itinerary;

    const totalActivities = days.reduce((s, d) => s + d.activities.length, 0);
    const avgPerDay       = totalActivities / Math.max(days.length, 1);
    const currency        = totalEstimatedCost.currency;
    const cost            = totalEstimatedCost.amount;

    // ── 1. Trip context ───────────────────────────────────────────────────────
    bullets.push(
        `This ${totalDays}-day trip to ${destination} includes ${totalActivities} activities` +
        ` averaging ${avgPerDay.toFixed(1)} per day.`
    );

    // ── 2. Travel DNA ─────────────────────────────────────────────────────────
    if (travelDNA) {
        if (travelDNA.travelStyles.length > 0) {
            bullets.push(
                `Tailored for ${listJoin(travelDNA.travelStyles.map(cap))} travel` +
                ` based on your Travel DNA profile.`
            );
        }

        const pace = travelDNA.pacePreference;
        if (pace === "slow") {
            bullets.push("Paced for relaxed exploration with breathing room between each stop.");
        } else if (pace === "fast") {
            bullets.push("Optimised for high-energy coverage to match your fast-pace preference.");
        } else {
            bullets.push("Days follow a moderate rhythm — full without feeling rushed.");
        }

        if (travelDNA.interests.length > 0) {
            bullets.push(
                `Venues were chosen around your interests: ${listJoin(travelDNA.interests)}.`
            );
        }
    }

    // ── 3. Activity density ───────────────────────────────────────────────────
    if (avgPerDay <= 2.5) {
        bullets.push("Light schedule with 2–3 activities per day — ideal for slow travel or family trips.");
    } else if (avgPerDay <= 4.5) {
        bullets.push("Comfortable density of 3–4 activities each day balances sightseeing with downtime.");
    } else if (avgPerDay <= 5.5) {
        bullets.push("Full days of ~5 activities — ambitious but achievable with the planned transitions.");
    } else {
        bullets.push("High-density schedule; use the Refine Trip input to lighten any specific day.");
    }

    // ── 4. Budget usage ───────────────────────────────────────────────────────
    if (scoreBreakdown) {
        const b = scoreBreakdown.budget;
        const costStr = `${currency}\u00a0${cost.toLocaleString()}`;
        if (b >= 90) {
            bullets.push(`Total estimated spend (${costStr}) is well-calibrated within your budget.`);
        } else if (b >= 70) {
            bullets.push(`Spend sits just within budget at ${costStr} — a few high-cost days bring it close.`);
        } else if (b >= 50) {
            bullets.push(`Budget efficiency could improve; costs are unevenly spread across the ${totalDays} days.`);
        } else {
            bullets.push(
                `Estimated cost (${costStr}) strains the budget — consider using Refine Trip to reduce spend.`
            );
        }

        // ── 5. Route quality ─────────────────────────────────────────────────
        const d = scoreBreakdown.distance;
        if (d >= 85) {
            bullets.push("Activities within each day are geographically clustered to minimise transit time.");
        } else if (d >= 65) {
            bullets.push("Route follows a logical neighbourhood flow to limit unnecessary backtracking.");
        } else {
            bullets.push(
                "Some days involve longer transit — the Optimise Route Order button can tighten the path."
            );
        }

        // ── 6. Diversity ─────────────────────────────────────────────────────
        const v = scoreBreakdown.diversity;
        if (v >= 80) {
            bullets.push("Strong variety across dining, cultural, sightseeing, and leisure activities.");
        } else if (v >= 55) {
            bullets.push("Good activity mix; adding one more category (e.g. relaxation) would round it out.");
        } else {
            bullets.push(
                "Activity types are concentrated — mixing in dining or relaxation breaks adds variety."
            );
        }
    }

    // ── 7. Pacing analysis (from the itinerary itself) ────────────────────────
    if (pacingAnalysis.warnings.length > 0) {
        bullets.push(`Pacing note: ${pacingAnalysis.warnings[0]}`);
    } else if (pacingAnalysis.overallScore >= 7) {
        bullets.push("The pacing score is strong — no back-to-back exhausting segments detected.");
    }

    // ── 8. AI insight (first one from itinerary) ──────────────────────────────
    if (aiInsights.length > 0) {
        const insight = aiInsights[0].length > 120
            ? aiInsights[0].slice(0, 117) + "…"
            : aiInsights[0];
        bullets.push(insight);
    }

    // ── 9. Risk summary ───────────────────────────────────────────────────────
    if (risks) {
        const allAlerts = [
            ...risks.alerts,
            ...Object.values(risks.dayAlerts).flat(),
        ];
        const highCount   = allAlerts.filter(a => a.severity === "high").length;
        const medCount    = allAlerts.filter(a => a.severity === "medium").length;
        const weatherAlert = risks.alerts.find(a => a.type === "WEATHER_RISK");

        if (allAlerts.length === 0) {
            bullets.push("No significant risks detected — this itinerary is well-structured.");
        } else if (highCount > 0) {
            bullets.push(
                `${highCount} high-priority risk${highCount > 1 ? "s" : ""} flagged` +
                ` — review the Risk Analysis panel for day-specific guidance.`
            );
        } else {
            bullets.push(
                `${medCount} moderate alert${medCount > 1 ? "s" : ""} detected` +
                ` — see the Risk Analysis panel for details.`
            );
        }

        if (weatherAlert) {
            bullets.push(`Seasonal note: ${weatherAlert.message}`);
        }
    }

    return { bullets };
}
