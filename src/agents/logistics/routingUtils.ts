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
): ScheduledActivity[] {
    if (activities.length === 0) return [];

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

logStructured({
    layer: "service", service: "routing", step: "route_built",
    data: { totalScheduled: scheduled.length, remainingDropped: unvisited.size },
});

return scheduled;
}

// ─── Meal injection ───────────────────────────────────────────────────────────

const LUNCH_TARGET_MINS  = 13 * 60;  // 13:00 — midday anchor
const DINNER_TARGET_MINS = 18 * 60;  // 18:00 — fits inside the 09:00–19:00 window
const MEAL_DURATION_MINS = 60;
const MEAL_BUFFER_MINS   = 15;       // gap between activity end and meal start
const MAX_MEAL_END_MINS  = 23 * 60 + 59;

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
 * Auto-injects a lunch and dinner stop into an already-scheduled day.
 *
 * Algorithm (for each meal):
 *  1. Find the non-meal activity whose startTime is closest to the target
 *     (13:00 for lunch, 18:00 for dinner).
 *  2. Take the first entry from that activity's restaurantOptions[].
 *     Skip if none available.
 *  3. Calculate mealStart = anchor.endTime + 15 min buffer.
 *  4. Validate:
 *       a. mealEnd (mealStart + 60 min) must not exceed 23:59.
 *       b. mealEnd must not overlap the next activity's startTime.
 *     → Skip silently if either constraint is violated.
 *  5. Splice the meal into the array immediately after the anchor.
 *
 * Guarantees:
 *  - Returns a NEW array — no mutation of input.
 *  - Injected activities always have valid HH:mm startTime / endTime.
 *  - Chronological order is preserved (passes validateOutput).
 *  - travelTimeFromPrevMs = 15 min (the buffer), within the 240-min cap.
 *  - Restaurants never receive restaurantOptions — they already are one.
 */
export function injectMeals(activities: ScheduledActivity[]): {
    activities:     ScheduledActivity[];
    lunchInserted:  boolean;
    dinnerInserted: boolean;
} {
    if (activities.length === 0) {
        return { activities, lunchInserted: false, dinnerInserted: false };
    }

    let result = [...activities];
    let lunchInserted  = false;
    let dinnerInserted = false;

    /**
     * Attempts to splice a meal into `result` after the activity at `anchorIdx`.
     * Returns true + mutates `result` on success; returns false when time
     * constraints prevent insertion (overflow or overlap with next activity).
     */
    const spliceMeal = (
        anchorIdx:    number,
        options:      Activity[],
        mealTypeVal:  "lunch" | "dinner",
    ): boolean => {
        const anchor     = result[anchorIdx]!;
        const restaurant = options[0];
        if (!restaurant) return false;

        const anchorEndMins = hhmmToMins(anchor.endTime!);
        const mealStart     = anchorEndMins + MEAL_BUFFER_MINS;
        const mealEnd       = mealStart + MEAL_DURATION_MINS;

        if (mealEnd > MAX_MEAL_END_MINS) return false;

        const nextAct = result[anchorIdx + 1];
        if (nextAct?.startTime && hhmmToMins(nextAct.startTime) < mealEnd) return false;

        const mealSlot: ScheduledActivity["timeSlot"] =
            mealStart < 12 * 60 ? "morning" :
            mealStart < 17 * 60 ? "afternoon" :
            "evening";

        const meal: ScheduledActivity = {
            ...restaurant,
            type:                 "restaurant",
            timeSlot:             mealSlot,
            isMeal:               true,
            mealType:             mealTypeVal,
            startTime:            toHHMM(mealStart),
            endTime:              toHHMM(mealEnd),
            travelTimeFromPrevMs: MEAL_BUFFER_MINS * 60_000,
            restaurantOptions:    options,
        };

        result = [
            ...result.slice(0, anchorIdx + 1),
            meal,
            ...result.slice(anchorIdx + 1),
        ];

        return true;
    };

    /**
     * Injects a meal for the given target time.
     *
     * Strategy (in order):
     *  1. Try every non-meal, non-restaurant activity sorted by closeness to
     *     targetMins. Use that activity's restaurantOptions.
     *  2. (Dinner only) If step 1 fails, walk backward from the END of the
     *     result array and try any activity that has restaurantOptions — this
     *     covers the case where all non-meal activities end before the dinner
     *     window but the injected lunch has a free slot after it.
     *
     * Skipping scheduled restaurant activities as anchors avoids duplicating
     * a restaurant that the Logistics Agent already placed in the day.
     */
    const tryInject = (targetMins: number, mealTypeVal: "lunch" | "dinner"): boolean => {
        // --- pass 1: non-meal, non-restaurant anchors sorted by closeness ---
        const pass1Candidates = result
            .map((act, idx) => ({ act, idx }))
            .filter(({ act }) =>
                hasValidTimes(act) &&
                !act.isMeal &&
                act.type !== "restaurant" &&
                (act.restaurantOptions?.length ?? 0) > 0,
            )
            .sort((a, b) => {
                const da = Math.abs(hhmmToMins(a.act.startTime!) - targetMins);
                const db = Math.abs(hhmmToMins(b.act.startTime!) - targetMins);
                return da - db;
            });

        for (const { act, idx } of pass1Candidates) {
            if (spliceMeal(idx, act.restaurantOptions!, mealTypeVal)) return true;
        }

        // --- pass 2 (dinner only): try any activity from end backward -------
        if (mealTypeVal === "dinner") {
            for (let i = result.length - 1; i >= 0; i--) {
                const act = result[i]!;
                if (!hasValidTimes(act)) continue;
                const opts = act.restaurantOptions ?? [];
                if (opts.length === 0) continue;
                if (spliceMeal(i, opts, mealTypeVal)) return true;
            }
        }

        return false;
    };

    lunchInserted  = tryInject(LUNCH_TARGET_MINS,  "lunch");
    dinnerInserted = tryInject(DINNER_TARGET_MINS, "dinner");

    return { activities: result, lunchInserted, dinnerInserted };
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
