/**
 * Routing utilities for the Logistics Agent — hardened
 *
 * Design guarantees:
 *  • Matrix miss → Haversine fallback for that pair (logged as matrix_miss).
 *    The old 999 min penalty silently corrupted nearest-neighbor ordering.
 *  • Travel time clamped to [5, 240] min:
 *      – 5 min minimum: adjacent places with same centroid coordinates get a
 *        realistic non-zero travel buffer.
 *      – 240 min maximum: caps extreme outliers from bad coordinates.
 *  • Deterministic tie-breaking: when two candidates have equal travel time,
 *    the candidate whose name sorts lexicographically first wins.
 *    Guarantees same input → same output always.
 *  • Time overflow protection:
 *      – First activity: end time clamped to DAY_END (never dropped — a day
 *        must have at least one activity).
 *      – Subsequent activities: dropped with a logged count when they would
 *        push past DAY_END.
 *  • Safe HH:mm formatter: clamps minute values to 23:59 — never "28:09".
 *  • 15-min buffer between activities (unchanged).
 */

import type { Activity, FoodCostSummary, OptimizedDay, ScheduledActivity } from "@/agents/shared/tripPipelineTypes";
import { logStructured } from "@/infrastructure/logger";
import type { GeoCoordinate } from "@/services/mapbox";
import { haversineDistanceMins } from "@/services/mapbox";

export interface MatrixLookup {
    matrix:   number[][];
    indexMap: Map<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const START_OF_DAY_MINS = 9 * 60;   // 09:00
const DAY_END_MINS      = 19 * 60;  // 19:00
const BUFFER_MINS       = 15;       // between activities
const MIN_TRAVEL_MINS   = 5;        // floor — adjacent/same-coord places
const MAX_TRAVEL_MINS   = 240;      // ceiling — 4-hour hard cap

const DEFAULT_STAY_MINS: Record<Activity["type"], number> = {
    attraction: 120,
    experience: 150,
    restaurant:  90,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts total minutes since midnight to a safe HH:mm string (max 23:59). */
function toHHMM(mins: number): string {
    const safe = Math.min(Math.max(0, mins), 23 * 60 + 59);
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** Clamps travel minutes to the [MIN_TRAVEL, MAX_TRAVEL] bounds. */
function clampTravel(mins: number): number {
    return Math.max(MIN_TRAVEL_MINS, Math.min(MAX_TRAVEL_MINS, mins));
}

// ─── Core routing function ────────────────────────────────────────────────────

/**
 * Schedules a list of activities for a single day using a nearest-neighbor
 * heuristic with a time-box constraint (09:00–19:00).
 *
 * @param hotel          Base location for the day (used as starting/fallback point).
 * @param activities     Activities to schedule — must carry lat/lng.
 * @param matrixData     Pre-fetched Mapbox matrix for the day's points.
 * @returns              Ordered, time-stamped ScheduledActivity array.
 */
export function buildScheduledDay(
    hotel:      GeoCoordinate & { id: string },
    activities: Array<Activity & { id: string; lat: number; lng: number }>,
    matrixData: MatrixLookup,
): { scheduled: ScheduledActivity[]; droppedCount: number } {
    if (activities.length === 0) return { scheduled: [], droppedCount: 0 };

    const scheduled: ScheduledActivity[] = [];
    const unvisited = new Set(activities);

    let currentMins  = START_OF_DAY_MINS;
    let currentId    = hotel.id;
    let currentCoord: GeoCoordinate = hotel;

    while (unvisited.size > 0) {
        const fromIdx = matrixData.indexMap.get(currentId);

        // ── Nearest-neighbor selection ─────────────────────────────────────
        let nearestAct: (Activity & { id: string; lat: number; lng: number }) | null = null;
        let shortestMins = Infinity;
        let usedHaversineForNearest = false;

        for (const candidate of unvisited) {
            const toIdx = matrixData.indexMap.get(candidate.id);
            let raw: number;
            let usedHaversine = false;

            if (
                fromIdx !== undefined &&
                toIdx   !== undefined &&
                matrixData.matrix[fromIdx]?.[toIdx] !== undefined
            ) {
                raw = matrixData.matrix[fromIdx]![toIdx]!;
            } else {
                // Matrix miss — use haversine for this pair and log it
                raw = haversineDistanceMins(currentCoord, { lat: candidate.lat, lng: candidate.lng });
                usedHaversine = true;
                logStructured({
                    layer: "service", service: "routing", step: "matrix_miss",
                    data: { from: currentId, to: candidate.id, fallbackMins: raw },
                });
            }

            const clamped = clampTravel(raw);

            // Deterministic tie-break: lower name alphabetically wins
            const isBetter =
                clamped < shortestMins ||
                (clamped === shortestMins && candidate.name < (nearestAct?.name ?? "\uFFFF"));

            if (isBetter) {
                shortestMins           = clamped;
                nearestAct             = candidate;
                usedHaversineForNearest = usedHaversine;
            }
        }

        if (!nearestAct) break; // Defensive — unvisited is non-empty so this shouldn't trigger

        // ── Time bounds ────────────────────────────────────────────────────
        const arrivalMins  = currentMins + shortestMins;
        const stayMins     = DEFAULT_STAY_MINS[nearestAct.type] ?? 120;
        let   endBlockMins = arrivalMins + stayMins;

        if (endBlockMins > DAY_END_MINS) {
            if (scheduled.length === 0) {
                // First activity of the day: must schedule at least one —
                // clamp its end to DAY_END rather than dropping it entirely.
                endBlockMins = DAY_END_MINS;
            } else {
                logStructured({
                    layer: "service", service: "routing", step: "activities_dropped",
                    data: {
                        droppedCount: unvisited.size,
                        dayLimiter:   toHHMM(DAY_END_MINS),
                        nextActivity: nearestAct.name,
                    },
                });
                break;
            }
        }

        // ── Time slot derivation ───────────────────────────────────────────
        const timeSlot: ScheduledActivity["timeSlot"] =
            arrivalMins < 12 * 60 ? "morning" :
            arrivalMins < 17 * 60 ? "afternoon" :
            "evening";

        scheduled.push({
            ...nearestAct,
            timeSlot,
            startTime:           toHHMM(arrivalMins),
            endTime:             toHHMM(endBlockMins),
            travelTimeFromPrevMs: shortestMins * 60_000,
        });

        currentMins  = endBlockMins + BUFFER_MINS;
        currentId    = nearestAct.id;
        currentCoord = { lat: nearestAct.lat, lng: nearestAct.lng };
        unvisited.delete(nearestAct);

        void usedHaversineForNearest; // used only for logging above
    }

const droppedCount = unvisited.size;
logStructured({
    layer: "service", service: "routing", step: "route_built",
    data: { totalScheduled: scheduled.length, remainingDropped: droppedCount },
});

return { scheduled, droppedCount };
}

// ─── Meal injection ───────────────────────────────────────────────────────────

// Strict meal windows — restaurants outside these hours are reclassified as
// experiences so they never appear as restaurants at e.g. 09:05, and are never
// promoted to meal stops.
const MIN_BREAKFAST_START_MINS = 7  * 60; // 07:00
const MAX_BREAKFAST_START_MINS = 10 * 60; // 10:00 (exclusive)
const MIN_LUNCH_START_MINS     = 12 * 60; // 12:00
const MAX_LUNCH_START_MINS     = 15 * 60; // 15:00 (exclusive)
const MIN_DINNER_START_MINS    = 18 * 60; // 18:00
const MAX_DINNER_START_MINS    = 22 * 60; // 22:00 (exclusive)

/** True when `mins` falls within any of the three valid meal windows. */
function isInAnyMealWindow(mins: number): boolean {
    return (
        (mins >= MIN_BREAKFAST_START_MINS && mins < MAX_BREAKFAST_START_MINS) ||
        (mins >= MIN_LUNCH_START_MINS     && mins < MAX_LUNCH_START_MINS) ||
        (mins >= MIN_DINNER_START_MINS    && mins < MAX_DINNER_START_MINS)
    );
}

// Acceptable time windows for injected meals — prevents placing "dinner" at
// 11:40 AM when all viable anchor slots cluster in the morning.
const MIN_LUNCH_START_MINS  = 11 * 60;  // 11:00 — earliest acceptable lunch
const MAX_LUNCH_START_MINS  = 16 * 60;  // 16:00 — latest acceptable lunch start
const MIN_DINNER_START_MINS = 16 * 60;  // 16:00 — earliest acceptable dinner

/** Parses a valid HH:mm string into total minutes since midnight. */
function hhmmToMins(hhmm: string): number {
    const [hh, mm] = hhmm.split(":").map(Number);
    return (hh ?? 0) * 60 + (mm ?? 0);
}

const HHMM_RE = /^\d{2}:\d{2}$/;

/** Returns true when a ScheduledActivity has valid, parseable start + end times. */
function hasValidTimes(a: ScheduledActivity): boolean {
    return (
        typeof a.startTime === "string" && HHMM_RE.test(a.startTime) &&
        typeof a.endTime   === "string" && HHMM_RE.test(a.endTime)
    );
}

/**
 * Promotes scheduled restaurants at valid meal times to meal stops, and
 * reclassifies mistimed restaurants to experiences.
 *
 * Explicit NON-goals (per product direction, 2026-04):
 *  - Does NOT synthesize generic meal placeholders ("Local Restaurant",
 *    "<City> Dinner Stop", "Lunch near X"). Real named places only — or the
 *    day goes without an explicit meal stop.
 *
 * Algorithm:
 *  1. Promote: the earliest restaurant in the lunch window (12:00–15:00) and
 *     the latest restaurant in the dinner window (18:00–22:00) are marked
 *     isMeal=true. A breakfast-window (07:00–10:00) restaurant is promoted
 *     too.
 *  2. Reclassify: any remaining restaurant whose startTime falls outside ALL
 *     meal windows is converted to type="experience" so the UI never shows a
 *     restaurant card at e.g. 09:05.
 *
 * The `*WasFallback` fields always return false — the synthesis path is
 * removed. They are kept in the return shape for caller stability.
 *
 * Guarantees:
 *  - Returns a NEW array — no mutation of input.
 *  - Chronological order is preserved.
 */
export function injectMeals(activities: ScheduledActivity[], _destination = ""): {
    activities:        ScheduledActivity[];
    lunchInserted:     boolean;
    dinnerInserted:    boolean;
    lunchWasFallback:  boolean;
    dinnerWasFallback: boolean;
} {
    void _destination;

    if (activities.length === 0) {
        return {
            activities,
            lunchInserted:     false,
            dinnerInserted:    false,
            lunchWasFallback:  false,
            dinnerWasFallback: false,
        };
    }

    let result = [...activities];
    let lunchInserted     = false;
    let dinnerInserted    = false;

    // ── Step 1: Promote existing restaurant activities at meal times ─────────
    // Breakfast window (07:00–10:00) is recognized for reclassification below
    // but not promoted as a meal — downstream schemas only model lunch/dinner.

    // Lunch — earliest restaurant in 12:00–15:00
    for (let i = 0; i < result.length; i++) {
        const act = result[i]!;
        if (
            act.type === "restaurant" &&
            !act.isMeal &&
            hasValidTimes(act) &&
            hhmmToMins(act.startTime!) >= MIN_LUNCH_START_MINS &&
            hhmmToMins(act.startTime!) <  MAX_LUNCH_START_MINS
        ) {
            result = result.map((a, idx) =>
                idx === i ? { ...a, isMeal: true, mealType: "lunch" as const } : a,
            );
            lunchInserted = true;
            break;
        }
    }

    // Dinner — latest restaurant in 18:00–22:00
    for (let i = result.length - 1; i >= 0; i--) {
        const act = result[i]!;
        if (
            act.type === "restaurant" &&
            !act.isMeal &&
            hasValidTimes(act) &&
            hhmmToMins(act.startTime!) >= MIN_DINNER_START_MINS &&
            hhmmToMins(act.startTime!) <  MAX_DINNER_START_MINS
        ) {
            result = result.map((a, idx) =>
                idx === i ? { ...a, isMeal: true, mealType: "dinner" as const } : a,
            );
            dinnerInserted = true;
            break;
        }
    }

    // ── Step 2: Reclassify mistimed restaurants to experiences ──────────────
    // Any remaining type="restaurant" outside all three meal windows is a
    // mislabeled entry (e.g. a café tagged "restaurant" at 09:05). Convert it
    // to "experience" so the UI shows the correct icon and ordering.
    let reclassified = 0;
    result = result.map((act) => {
        if (act.type !== "restaurant" || act.isMeal) return act;
        if (!hasValidTimes(act)) return act;
        if (isInAnyMealWindow(hhmmToMins(act.startTime!))) return act;
        reclassified++;
        return { ...act, type: "experience" as const };
    });

    if (reclassified > 0) {
        logStructured({
            layer: "service", service: "routing", step: "restaurant_reclassified",
            data: { count: reclassified, reason: "outside_meal_windows" },
        });
    }

    return {
        activities:        result,
        lunchInserted,
        dinnerInserted,
        lunchWasFallback:  false,
        dinnerWasFallback: false,
    };
}

// ─── Food cost computation ─────────────────────────────────────────────────────

/**
 * Fallback cost (USD) when a meal activity lacks an explicit estimatedCost.
 * Mirrors PRICE_MIDPOINT in researchAgent.ts — same source of truth.
 */
const FALLBACK_COST: Record<NonNullable<Activity["priceLevel"]>, number> = {
    "$$$": 75,
    "$$":  30,
    "$":   12,
};

const DEFAULT_MEAL_COST = 20; // used when neither estimatedCost nor priceLevel is set

/**
 * Computes food cost from auto-injected meal activities across all days.
 *
 * Only activities where `isMeal === true` contribute — regular restaurant
 * activities that were scheduled by the routing engine are excluded so that
 * the budget reflects what the system explicitly recommended as meal stops.
 *
 * Cost resolution per meal (in priority order):
 *   1. `activity.estimatedCost`          — set by enrichRestaurantMetadata or LLM
 *   2. FALLBACK_COST[activity.priceLevel] — heuristic midpoint for the price band
 *   3. DEFAULT_MEAL_COST (20 USD)        — last-resort default
 *
 * Pure function — no side effects, no async.
 */
export function computeFoodCost(days: OptimizedDay[]): FoodCostSummary {
    const perDay = days.map((day) => {
        let dayTotal = 0;
        for (const act of day.activities) {
            if (!act.isMeal) continue;

            if (typeof act.estimatedCost === "number" && act.estimatedCost >= 0) {
                dayTotal += act.estimatedCost;
            } else if (act.priceLevel && FALLBACK_COST[act.priceLevel] !== undefined) {
                dayTotal += FALLBACK_COST[act.priceLevel]!;
            } else {
                dayTotal += DEFAULT_MEAL_COST;
            }
        }
        return dayTotal;
    });

    const total    = perDay.reduce((sum, d) => sum + d, 0);
    const avgPerDay = days.length > 0
        ? parseFloat((total / days.length).toFixed(2))
        : 0;

    return { perDay, total, avgPerDay };
}
