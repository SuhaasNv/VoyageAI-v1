/**
 * lib/analysis/simulateScenario.ts
 *
 * Deterministic scenario simulation engine.
 *
 * Applies virtual parameter changes (budget / pace / days) to an existing
 * itinerary in memory and computes how the Travel Intelligence Score and
 * risk profile would change — with zero LLM calls and zero DB writes.
 *
 * The engine never invents new activities; it only slices existing ones.
 */

import { calculateTravelScore, type TravelScoreResult } from "./travelScore";
import { analyzeTripRisks, flattenAlerts, type RiskAnalysisResult } from "./tripRiskEngine";
import type { Itinerary, ItineraryDay } from "@/lib/ai/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScenarioParams {
    /** Absolute budget in the itinerary's currency. */
    simulatedBudget:        number;
    /** Desired activities per day (fractional → floored). */
    targetActivitiesPerDay: number;
    /** Desired trip duration in days (≤ original days). */
    targetDays:             number;
}

export interface ScenarioSnapshot {
    score:               TravelScoreResult;
    risks:               RiskAnalysisResult;
    totalCost:           number;
    days:                number;
    avgActivitiesPerDay: number;
}

export interface ScenarioDiff {
    original:           ScenarioSnapshot;
    simulated:          ScenarioSnapshot;
    /** positive = simulated is better */
    scoreDelta:         number;
    /** Alert types that disappeared in the simulation. */
    resolvedAlertTypes: string[];
    /** Alert types that newly appeared in the simulation. */
    newAlertTypes:      string[];
    /** Human-readable bullet list of what would change. */
    projectedChanges:   string[];
    /** True when all sliders are at their baseline (no changes). */
    isUnchanged:        boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_LABELS: Record<string, string> = {
    OVERPACKED_DAY:  "Overpacked Day",
    DISTANCE_HEAVY:  "Heavy Travel Distance",
    BUDGET_OVERFLOW: "Budget Overflow",
    FATIGUE_RISK:    "Fatigue Risk",
    WEATHER_RISK:    "Weather Risk",
};

function labelAlert(type: string): string {
    return ALERT_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function avgActs(itinerary: Itinerary): number {
    if (!itinerary.days.length) return 0;
    return itinerary.days.reduce((s, d) => s + d.activities.length, 0) / itinerary.days.length;
}

/**
 * Applies pace + day constraints to produce a virtual itinerary.
 * Only slices existing activities — never invents new ones.
 */
function buildSimulatedItinerary(itinerary: Itinerary, params: ScenarioParams): Itinerary {
    const targetDays    = Math.max(1, Math.min(Math.floor(params.targetDays), itinerary.days.length));
    const targetPerDay  = Math.max(1, Math.floor(params.targetActivitiesPerDay));

    const days: ItineraryDay[] = itinerary.days.slice(0, targetDays).map(day => {
        if (day.activities.length <= targetPerDay) return day;

        const activities = day.activities.slice(0, targetPerDay);
        const totalAmt   = activities.reduce((s, a) => s + a.estimatedCost.amount, 0);
        const avgFatigue = activities.reduce((s, a) => s + (a.fatigueScore ?? 5), 0) / activities.length;

        return {
            ...day,
            activities,
            totalCost:         { ...day.totalCost, amount: totalAmt },
            dailyFatigueScore: Math.round(avgFatigue * 10) / 10,
        };
    });

    const totalAmt = days.reduce((s, d) => s + d.totalCost.amount, 0);

    // Scale cost breakdown proportionally.
    const scale      = itinerary.totalEstimatedCost.amount > 0
        ? totalAmt / itinerary.totalEstimatedCost.amount : 1;
    const breakdown  = Object.fromEntries(
        Object.entries(itinerary.totalEstimatedCost.breakdown).map(([k, v]) => [k, Math.round(v * scale)])
    );

    return {
        ...itinerary,
        days,
        totalDays:          days.length,
        totalEstimatedCost: { ...itinerary.totalEstimatedCost, amount: totalAmt, breakdown },
    };
}

function buildProjectedChanges(
    original:       Itinerary,
    simulated:      Itinerary,
    params:         ScenarioParams,
    originalBudget: number,
): string[] {
    const changes: string[] = [];
    const ccy = original.totalEstimatedCost.currency;

    // Budget delta
    const budgetDelta = params.simulatedBudget - originalBudget;
    if (originalBudget > 0 && Math.abs(budgetDelta / originalBudget) > 0.04) {
        changes.push(
            budgetDelta > 0
                ? `Budget up ${ccy} ${budgetDelta.toFixed(0)} — more headroom for upgrades`
                : `Budget cut by ${ccy} ${Math.abs(budgetDelta).toFixed(0)} — tighter spending constraint`
        );
    }

    // Estimated cost delta
    const costDelta = simulated.totalEstimatedCost.amount - original.totalEstimatedCost.amount;
    if (Math.abs(costDelta) > 50) {
        changes.push(
            costDelta < 0
                ? `Estimated spend drops to ~${ccy} ${simulated.totalEstimatedCost.amount.toFixed(0)} (save ~${ccy} ${Math.abs(costDelta).toFixed(0)})`
                : `Estimated spend rises to ~${ccy} ${simulated.totalEstimatedCost.amount.toFixed(0)}`
        );
    }

    // Days removed
    const daysDiff = simulated.totalDays - original.totalDays;
    if (daysDiff < 0) {
        const dropped = original.days.slice(simulated.totalDays).reduce((s, d) => s + d.activities.length, 0);
        changes.push(`${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? "s" : ""} removed — ${dropped} activities dropped`);
    }

    // Pace change
    const origAvg = avgActs(original);
    const simAvg  = avgActs(simulated);
    if (simAvg < origAvg - 0.3) {
        const totalTrimmed = original.days.slice(0, simulated.totalDays).reduce(
            (s, d) => s + Math.max(0, d.activities.length - Math.floor(params.targetActivitiesPerDay)), 0
        );
        changes.push(
            `Pace eased to ~${simAvg.toFixed(1)} acts/day — ${totalTrimmed} activit${totalTrimmed === 1 ? "y" : "ies"} trimmed for a more relaxed schedule`
        );
    }

    return changes.length ? changes : ["No significant changes from current scenario"];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function simulateScenario(
    itinerary:      Itinerary,
    params:         ScenarioParams,
    originalBudget: number,
): ScenarioDiff {
    // ── Baseline ──────────────────────────────────────────────────────────────
    const originalScore = calculateTravelScore(itinerary, originalBudget);
    const originalRisks = analyzeTripRisks(itinerary, originalBudget);
    const origAvg       = avgActs(itinerary);

    // ── Virtual itinerary ─────────────────────────────────────────────────────
    const simItinerary = buildSimulatedItinerary(itinerary, params);
    const simScore     = calculateTravelScore(simItinerary, params.simulatedBudget);
    const simRisks     = analyzeTripRisks(simItinerary, params.simulatedBudget);
    const simAvg       = avgActs(simItinerary);

    // ── Alert diff ────────────────────────────────────────────────────────────
    const origTypes         = new Set(flattenAlerts(originalRisks).map(a => a.type));
    const simTypes          = new Set(flattenAlerts(simRisks).map(a => a.type));
    const resolvedAlertTypes = [...origTypes].filter(t => !simTypes.has(t)).map(labelAlert);
    const newAlertTypes      = [...simTypes].filter(t => !origTypes.has(t)).map(labelAlert);

    // ── Unchanged check ───────────────────────────────────────────────────────
    const isUnchanged = (
        Math.abs(params.simulatedBudget - originalBudget) < 1 &&
        Math.floor(params.targetActivitiesPerDay) >= Math.ceil(origAvg) &&
        params.targetDays >= itinerary.totalDays
    );

    return {
        original:  { score: originalScore, risks: originalRisks, totalCost: itinerary.totalEstimatedCost.amount, days: itinerary.totalDays, avgActivitiesPerDay: origAvg },
        simulated: { score: simScore,      risks: simRisks,      totalCost: simItinerary.totalEstimatedCost.amount, days: simItinerary.totalDays, avgActivitiesPerDay: simAvg },
        scoreDelta:         simScore.score - originalScore.score,
        resolvedAlertTypes,
        newAlertTypes,
        projectedChanges:   buildProjectedChanges(itinerary, simItinerary, params, originalBudget),
        isUnchanged,
    };
}
