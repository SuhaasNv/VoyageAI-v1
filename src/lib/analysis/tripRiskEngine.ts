/**
 * lib/analysis/tripRiskEngine.ts
 *
 * Deterministic, LLM-free trip risk analysis for VoyageAI.
 *
 * Rules evaluated:
 *   1. OVERPACKED_DAY  — too many activities in a single day
 *   2. DISTANCE_HEAVY  — too much travel distance in a single day
 *   3. BUDGET_OVERFLOW — itinerary cost exceeds the trip budget
 *   4. FATIGUE_RISK    — consecutive heavy days without rest
 *   5. WEATHER_RISK    — static destination × month heuristic table
 *
 * No external APIs, no new dependencies.
 * Reuses routeDistanceKm from the existing geo layer.
 */

import { routeDistanceKm } from "@/lib/geo/routeOptimizer";
import type { Itinerary } from "@/lib/ai/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface Alert {
    type:     string;
    severity: "low" | "medium" | "high";
    message:  string;
}

export interface RiskAnalysisResult {
    /** Trip-level alerts (budget, fatigue streak, weather). */
    alerts:    Alert[];
    /** Day-level alerts keyed by ItineraryDay.day (1-based). */
    dayAlerts: Record<number, Alert[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const SEV: Record<Alert["severity"], number> = { low: 1, medium: 2, high: 3 };

const bySevDesc = (a: Alert, b: Alert) => SEV[b.severity] - SEV[a.severity];

// ─────────────────────────────────────────────────────────────────────────────
// Weather risk — static destination × month rule table
// ─────────────────────────────────────────────────────────────────────────────

interface WeatherRule {
    match:    RegExp;
    months:   number[];           // 0-indexed (0 = January)
    severity: Alert["severity"];
    message:  string;
}

const WEATHER_RULES: WeatherRule[] = [
    {
        match:    /bali/i,
        months:   [0, 1, 2],     // Jan–Mar: rainy season
        severity: "low",
        message:  "Bali's rainy season (Jan–Mar) brings heavy afternoon showers. Schedule outdoor activities in the morning.",
    },
    {
        match:    /tokyo|osaka|kyoto|japan/i,
        months:   [7],            // Aug: extreme heat & humidity
        severity: "medium",
        message:  "Japan in August reaches 35°C+ with high humidity. Avoid strenuous outdoor activity during midday.",
    },
    {
        match:    /mumbai|delhi|kolkata|india|goa/i,
        months:   [5, 6, 7, 8],  // Jun–Sep: monsoon
        severity: "medium",
        message:  "Indian monsoon season (Jun–Sep) brings heavy rain and transport delays. Check road conditions daily.",
    },
    {
        match:    /bangkok|phuket|thailand/i,
        months:   [8, 9, 10],    // Sep–Nov: wet season
        severity: "low",
        message:  "Thailand's wet season (Sep–Nov) brings intermittent heavy rain. Carry waterproof gear and monitor local flood alerts.",
    },
    {
        match:    /dubai|abu dhabi|doha|riyadh|qatar/i,
        months:   [5, 6, 7],     // Jun–Aug: extreme desert heat
        severity: "high",
        message:  "Gulf summer (Jun–Aug) regularly hits 45°C+. Limit outdoor activity to before 9am and after 7pm only.",
    },
    {
        match:    /new york|chicago|boston|toronto|montreal/i,
        months:   [11, 0, 1],    // Dec–Feb: winter storms
        severity: "low",
        message:  "Winter storm season (Dec–Feb). Monitor weather advisories and allow extra transit time.",
    },
    {
        match:    /london|paris|amsterdam|brussels/i,
        months:   [10, 11, 0, 1, 2], // Nov–Mar: grey, rainy, cold
        severity: "low",
        message:  "Northern Europe in winter is cold, grey and rainy. Pack layers and waterproofs.",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core analysis function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse an itinerary and return structured risk alerts.
 *
 * @param itinerary - The full itinerary object (ItinerarySchema).
 * @param tripBudget - Optional total budget in the same currency as the itinerary.
 */
export function analyzeTripRisks(
    itinerary: Itinerary,
    tripBudget?: number
): RiskAnalysisResult {
    const globalAlerts: Alert[] = [];
    const dayAlerts: Record<number, Alert[]> = {};

    const pushDay = (dayNum: number, alert: Alert) => {
        (dayAlerts[dayNum] ??= []).push(alert);
    };

    // ── Rule 1: OVERPACKED_DAY ────────────────────────────────────────────────
    for (const day of itinerary.days) {
        const n = day.activities.length;
        if (n >= 7) {
            pushDay(day.day, {
                type:     "OVERPACKED_DAY",
                severity: "high",
                message:  `Day ${day.day} has ${n} activities — very dense and likely to cause fatigue.`,
            });
        } else if (n === 6) {
            pushDay(day.day, {
                type:     "OVERPACKED_DAY",
                severity: "medium",
                message:  `Day ${day.day} has ${n} activities — consider removing one to allow breathing room.`,
            });
        }
    }

    // ── Rule 2: DISTANCE_HEAVY ────────────────────────────────────────────────
    for (const day of itinerary.days) {
        const km = routeDistanceKm(day.activities);
        if (km > 25) {
            pushDay(day.day, {
                type:     "DISTANCE_HEAVY",
                severity: "high",
                message:  `Day ${day.day} covers ~${km.toFixed(0)} km — exhausting transit. Cluster activities by neighbourhood.`,
            });
        } else if (km > 15) {
            pushDay(day.day, {
                type:     "DISTANCE_HEAVY",
                severity: "medium",
                message:  `Day ${day.day} covers ~${km.toFixed(0)} km — heavy transit. Build in extra buffer time.`,
            });
        }
    }

    // ── Rule 3: BUDGET_OVERFLOW ───────────────────────────────────────────────
    if (typeof tripBudget === "number" && tripBudget > 0) {
        const cost = itinerary.totalEstimatedCost.amount;
        if (cost > tripBudget) {
            const currency = itinerary.totalEstimatedCost.currency;
            const over     = (cost - tripBudget).toFixed(0);
            globalAlerts.push({
                type:     "BUDGET_OVERFLOW",
                severity: "high",
                message:  `Itinerary cost (${currency}\u00a0${cost.toLocaleString()}) exceeds your budget by ${currency}\u00a0${over}.`,
            });
        }
    }

    // ── Rule 4: FATIGUE_RISK — >3 consecutive heavy days ─────────────────────
    let streak    = 0;
    let maxStreak = 0;
    for (const day of itinerary.days) {
        streak    = day.activities.length > 5 ? streak + 1 : 0;
        maxStreak = Math.max(maxStreak, streak);
    }
    if (maxStreak > 3) {
        globalAlerts.push({
            type:     "FATIGUE_RISK",
            severity: "medium",
            message:  `${maxStreak} consecutive heavy days detected. Add a rest day or reduce activity count to avoid burnout.`,
        });
    }

    // ── Rule 5: WEATHER_RISK ──────────────────────────────────────────────────
    const startMonth = new Date(itinerary.startDate).getMonth();
    for (const rule of WEATHER_RULES) {
        if (rule.match.test(itinerary.destination) && rule.months.includes(startMonth)) {
            globalAlerts.push({
                type:     "WEATHER_RISK",
                severity: rule.severity,
                message:  rule.message,
            });
            break; // one weather alert per trip is sufficient
        }
    }

    globalAlerts.sort(bySevDesc);

    return { alerts: globalAlerts, dayAlerts };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities consumed by UI layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate global + all day-level alerts into a single sorted list.
 * Convenient for rendering a flat alert feed.
 */
export function flattenAlerts(result: RiskAnalysisResult): Alert[] {
    const dayLevel = Object.entries(result.dayAlerts)
        .sort(([a], [b]) => Number(a) - Number(b))   // ascending day order
        .flatMap(([, alerts]) => alerts);
    return [...result.alerts, ...dayLevel].sort(bySevDesc);
}

/**
 * Return the highest severity present in the list, or null if empty.
 */
export function topSeverity(alerts: Alert[]): Alert["severity"] | null {
    if (!alerts.length) return null;
    return alerts.reduce((top, a) =>
        SEV[a.severity] > SEV[top.severity] ? a : top
    ).severity;
}

/**
 * Return the count of alerts at each severity level.
 */
export function severityCounts(alerts: Alert[]): Record<Alert["severity"], number> {
    return alerts.reduce(
        (acc, a) => { acc[a.severity]++; return acc; },
        { low: 0, medium: 0, high: 0 } as Record<Alert["severity"], number>
    );
}
