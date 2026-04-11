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

import type { Activity, ScheduledActivity } from "@/agents/shared/tripPipelineTypes";
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
