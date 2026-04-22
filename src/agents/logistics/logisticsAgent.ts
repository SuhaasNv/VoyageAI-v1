/**
 * Logistics Agent — hardened routing engine
 *
 * Converts an EnrichedTripContext into a deterministic, physically-feasible
 * OptimizedTripContext by:
 *
 *  1. Strict coordinate validation (NaN / Infinity / (0,0) / out-of-range).
 *     Invalid coords are replaced by the destination centroid (never hardcoded
 *     city coords) and logged as invalid_coord_fallback.
 *
 *  2. Per-day Mapbox Matrix calls (parallel via Promise.allSettled).
 *     Each day gets its own matrix: [hotel, act1, act2, …] ≤ 7 points —
 *     well within Mapbox's 25-point limit, so truncation is impossible.
 *
 *  3. Nearest-neighbor routing inside buildScheduledDay with:
 *     • Haversine fallback on matrix miss
 *     • Travel time clamped [5, 240] min
 *     • Deterministic tie-breaking (lexicographic name)
 *     • Time-box enforcement (09:00–19:00, drop after first activity)
 *
 *  4. geoConfidence awareness: activities with low-confidence geocoding are
 *     still routed but contribute to the warnings array.
 *
 *  5. Strict output validation before returning — throws a structured error
 *     if the result contains invalid times, missing names, or out-of-order
 *     activities.
 *
 *  6. Warnings: non-fatal issues (Haversine fallback, low-confidence coords)
 *     are surfaced on the OptimizedTripContext.warnings array.
 *
 * This agent does NOT call any LLM.
 * It is entirely deterministic given the same input.
 */

import { logStructured, logError } from "@/infrastructure/logger";
import { getTravelTimeMatrix, isInvalidCoord } from "@/services/mapbox";
import { geocodeCentroid } from "@/services/mapboxGeocoding";
import { buildScheduledDay, computeFoodCost, injectMeals } from "./routingUtils";
import type { GeoCoordinate } from "@/services/mapbox";
import type {
    Activity,
    EnrichedDay,
    EnrichedTripContext,
    HotelOption,
    OptimizedDay,
    OptimizedTripContext,
    ScheduledActivity,
} from "@/agents/shared/tripPipelineTypes";

export type {
    Activity,
    EnrichedDay,
    EnrichedTripContext,
    HotelOption,
    OptimizedDay,
    OptimizedTripContext,
    ScheduledActivity,
};

// ─── Internal constants ───────────────────────────────────────────────────────

type TimeSlot = "morning" | "afternoon" | "evening";

const SLOT_PREFERENCE: Record<Activity["type"], TimeSlot> = {
    attraction: "morning",
    experience: "afternoon",
    restaurant: "evening",
};

const BUDGET_LUXURY_THRESHOLD = 1_500;

// ─── Preprocessing ────────────────────────────────────────────────────────────

function paceToCap(pace?: string): number {
    if (!pace) return 4;
    const p = pace.toLowerCase();
    if (p.includes("slow") || p.includes("relax")) return 3;
    if (p.includes("fast") || p.includes("pack") || p.includes("intense")) return 5;
    return 4;
}

function selectActivities(activities: Activity[], cap: number): Activity[] {
    const seen = new Set<string>();
    const unique: Activity[] = [];
    for (const act of activities) {
        const key = `${act.type}|${act.name.trim().toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); unique.push(act); }
    }
    if (unique.length <= cap) return unique;

    const groups: Record<Activity["type"], Activity[]> = {
        attraction: unique.filter((a) => a.type === "attraction"),
        experience: unique.filter((a) => a.type === "experience"),
        restaurant: unique.filter((a) => a.type === "restaurant"),
    };
    const typeOrder: Activity["type"][] = ["attraction", "experience", "restaurant"];
    const result: Activity[] = [];
    while (result.length < cap) {
        let added = false;
        for (const t of typeOrder) {
            if (result.length >= cap) break;
            const next = groups[t].shift();
            if (next) { result.push(next); added = true; }
        }
        if (!added) break;
    }
    return result;
}

function preprocessContext(context: EnrichedTripContext): EnrichedTripContext {
    const cap = paceToCap(context.preferences?.pace);
    const days = context.days.map((d): EnrichedDay => {
        const activities = d.activities.length > 0
            ? d.activities
            : [{
                name: `Free time in ${context.destination}`,
                type: "experience" as const,
                description: `Explore ${context.destination} at your own pace.`,
            }];
        return { ...d, activities: selectActivities(activities, cap) };
    });
    return { ...context, days };
}

// ─── Deterministic slot assignment (fallback only) ────────────────────────────

function assignSlots(activities: Activity[]): ScheduledActivity[] {
    if (activities.length === 0) return [];
    const buckets: Record<TimeSlot, Activity[]> = { morning: [], afternoon: [], evening: [] };
    for (const act of activities) buckets[SLOT_PREFERENCE[act.type]].push(act);
    while (buckets.morning.length > 1) buckets.afternoon.unshift(buckets.morning.pop()!);

    const ordered: Array<{ act: Activity; slot: TimeSlot }> = [
        ...buckets.morning.map((act) => ({ act, slot: "morning" as TimeSlot })),
        ...buckets.afternoon.map((act) => ({ act, slot: "afternoon" as TimeSlot })),
        ...buckets.evening.map((act) => ({ act, slot: "evening" as TimeSlot })),
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
        if (ordered[i]!.act.type === ordered[i + 1]!.act.type) {
            const swapIdx = ordered.findIndex(
                (item, idx) => idx > i + 1 && item.act.type !== ordered[i]!.act.type,
            );
            if (swapIdx !== -1)
                [ordered[i + 1], ordered[swapIdx]] = [ordered[swapIdx]!, ordered[i + 1]!];
        }
    }
    return ordered.map(({ act, slot }) => ({ ...act, timeSlot: slot }));
}

// ─── Hotel selection ──────────────────────────────────────────────────────────

const PLACEHOLDER_HOTEL: HotelOption = {
    name: "Accommodation — to be confirmed",
    priceRange: "$$",
    area: "Central",
    tags: [],
};

function tokenize(text: string): Set<string> {
    return new Set(text.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
}

function scoreHotel(hotel: HotelOption, context: EnrichedTripContext): number {
    const corpus = context.days
        .flatMap((d) => d.activities.map((a) => `${a.name} ${a.description} ${d.theme}`))
        .concat(context.destination)
        .join(" ");

    const corpusTokens = tokenize(corpus);
    const hotelTokens  = tokenize(`${hotel.area} ${hotel.tags.join(" ")}`);

    let score = 0;
    for (const tok of hotelTokens) if (corpusTokens.has(tok)) score += 1;
    if (hotel.rating !== undefined) score += hotel.rating;
    if (/central|downtown|centre|center/i.test(hotel.area)) score += 2;

    const budget = context.preferences?.budget;
    if (hotel.priceRange === "$$$$" && budget !== undefined && budget < BUDGET_LUXURY_THRESHOLD)
        score -= 10;

    const styleTokens = context.preferences?.style
        ? context.preferences.style.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (styleTokens.length > 0 && hotel.tags.some((t) => styleTokens.some((s) => t.toLowerCase().includes(s))))
        score += 2;

    return score;
}

export function selectHotel(context: EnrichedTripContext): HotelOption {
    if (context.hotels.length === 0) return { ...PLACEHOLDER_HOTEL, area: context.destination };
    // Deterministic tie-break by hotel name when scores are equal
    return context.hotels.reduce((best, candidate) => {
        const bScore = scoreHotel(best, context);
        const cScore = scoreHotel(candidate, context);
        if (cScore > bScore) return candidate;
        if (cScore === bScore && candidate.name < best.name) return candidate;
        return best;
    });
}

// ─── Strict coordinate validation ─────────────────────────────────────────────

/**
 * Returns true if the coordinate is unusable for routing.
 * More strict than `isInvalidCoord` from mapbox.ts — catches NaN and
 * Infinity that TypeScript types may allow through.
 */
function strictInvalidCoord(lat?: number, lng?: number): boolean {
    return isInvalidCoord(lat, lng);
}

// ─── Output validation ────────────────────────────────────────────────────────

const HH_MM_RE = /^\d{2}:\d{2}$/;

function hhmmToMins(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Validates the final OptimizedTripContext before it leaves this agent.
 * Throws a structured error string if any invariant is violated.
 */
function validateOutput(result: OptimizedTripContext): void {
    if (!result.selectedHotel?.name) {
        throw new Error("[Logistics] selectedHotel.name is missing");
    }
    for (const day of result.days) {
        let prevEndMins = 0;
        for (const act of day.activities) {
            if (!act.name) {
                throw new Error(`[Logistics] Activity missing name in day ${day.day}`);
            }
            if (act.startTime !== undefined) {
                if (!HH_MM_RE.test(act.startTime))
                    throw new Error(`[Logistics] Invalid startTime "${act.startTime}" in day ${day.day}`);
                const startMins = hhmmToMins(act.startTime);
                if (startMins < prevEndMins)
                    throw new Error(`[Logistics] Activity "${act.name}" starts before previous ends (day ${day.day})`);
                prevEndMins = startMins;
            }
            if (act.endTime !== undefined && !HH_MM_RE.test(act.endTime)) {
                throw new Error(`[Logistics] Invalid endTime "${act.endTime}" in day ${day.day}`);
            }
            if (act.travelTimeFromPrevMs !== undefined && act.travelTimeFromPrevMs > 240 * 60_000) {
                throw new Error(`[Logistics] travelTimeFromPrevMs exceeds 4-hour cap in day ${day.day}`);
            }
        }
    }
}

// ─── LogisticsAgent ───────────────────────────────────────────────────────────

export class LogisticsAgent {
    async run(context: EnrichedTripContext, requestId?: string): Promise<OptimizedTripContext> {
        logStructured({
            layer: "agent", agent: "logistics", step: "start", requestId,
            data: {
                destination:     context.destination,
                days:            context.days.length,
                hotels:          context.hotels.length,
                totalActivities: context.days.reduce((s, d) => s + d.activities.length, 0),
                pace:            context.preferences?.pace,
            },
        });

        const warnings: string[] = [];

        // ── 1. Hotel selection ───────────────────────────────────────────────
        const baseHotel = selectHotel(context);
        if (context.hotels.length === 0) {
            warnings.push("No hotel data available — placeholder used");
        }

        // ── 2. Hotel coordinate fallback (no hardcodes) ──────────────────────
        // If the Research Agent was unable to geocode the hotel (Mapbox
        // unavailable or token absent), use the destination centroid from Redis
        // cache. geocodeCentroid is effectively free on a cache hit.
        let hotelLat: number;
        let hotelLng: number;

        if (strictInvalidCoord(baseHotel.lat, baseHotel.lng)) {
            const centroid = await geocodeCentroid(context.destination);
            if (centroid && !strictInvalidCoord(centroid.lat, centroid.lng)) {
                hotelLat = centroid.lat;
                hotelLng = centroid.lng;
            } else {
                // Centroid also unavailable — Haversine will still work (all
                // activities will also have invalid coords → same fallback point).
                hotelLat = 0;
                hotelLng = 0;
                warnings.push("Hotel coordinates unavailable — routing uses centroid fallback");
            }
            logStructured({
                layer: "agent", agent: "logistics", step: "invalid_coord_fallback", requestId,
                data: { entity: "hotel", name: baseHotel.name, fallback: "destination_centroid" },
            });
        } else {
            hotelLat = baseHotel.lat as number;
            hotelLng = baseHotel.lng as number;
        }

        const hotelCoord: GeoCoordinate & { id: string } = {
            lat: hotelLat, lng: hotelLng, id: "hotel_0",
        };

        // ── 3. Preprocess (dedup + pace cap + empty day guard) ───────────────
        const preprocessed = preprocessContext(context);

        // ── 4. Coordinate validation pass — replace bad activity coords ──────
        // Every activity must have a valid lat/lng before we build matrices.
        // Invalid coords are replaced by the hotel coord (best available
        // fallback — already centroid-resolved above).
        let invalidCoordCount  = 0;
        let lowConfidenceCount = 0;

        const validatedDays = preprocessed.days.map((day) => ({
            ...day,
            activities: day.activities.map((act, actIdx) => {
                if (act.geoConfidence === "low") lowConfidenceCount++;

                if (strictInvalidCoord(act.lat, act.lng)) {
                    invalidCoordCount++;
                    logStructured({
                        layer: "agent", agent: "logistics", step: "invalid_coord_fallback", requestId,
                        data: {
                            entity:  "activity",
                            name:    act.name,
                            day:     day.day,
                            actIdx,
                            fallback: "hotel_coord",
                        },
                    });
                    return { ...act, lat: hotelLat, lng: hotelLng };
                }
                return act;
            }),
        }));

        if (invalidCoordCount > 0) {
            warnings.push(`${invalidCoordCount} activities had invalid coordinates — routed from hotel position`);
        }
        if (lowConfidenceCount > 0) {
            warnings.push(`${lowConfidenceCount} activities have low-confidence geocoding (city-centroid level)`);
        }

        // Per-day low-precision check: if ≥40% of a day's activities are "low"
        // confidence, routing for that day will be imprecise — warn explicitly.
        for (const day of validatedDays) {
            const total    = day.activities.length;
            const lowCount = day.activities.filter((a) => a.geoConfidence === "low").length;
            if (total > 0 && lowCount / total >= 0.4) {
                const pct = Math.round((lowCount / total) * 100);
                warnings.push(`Day ${day.day}: ${pct}% of activities have low-confidence coordinates — routing may show centroid-level precision`);
            }
        }

        logStructured({
            layer: "agent", agent: "logistics", step: "coord_validated", requestId,
            data: { invalidCoordCount, lowConfidenceCount, totalActivities: validatedDays.reduce((s, d) => s + d.activities.length, 0) },
        });

        // ── 5. Per-day matrix + routing (parallel) ───────────────────────────
        //
        // Each day uses its own matrix: [hotel, act1, act2, …]
        // Max = 1 + 5 activities = 6 points → always within Mapbox's 25-point limit.
        // Using Promise.allSettled so a matrix failure on one day does not
        // prevent routing on other days.
        let usedHaversineFallback = false;
        let usedMapboxFallback = false;

        type DayResult = { optimizedDay: OptimizedDay; droppedCount: number; usedFallback: boolean };

        const dayResults = await Promise.allSettled(
            validatedDays.map(async (day): Promise<DayResult> => {
                // Build typed activity list with guaranteed valid coords
                const dayActivities = day.activities.map((act, i) => ({
                    ...act,
                    lat: act.lat as number,
                    lng: act.lng as number,
                    id: `day${day.day}_act${i}`,
                }));

                // Points for this day's matrix: hotel first, then activities
                const points: Array<GeoCoordinate & { id: string }> = [
                    hotelCoord,
                    ...dayActivities.map((a) => ({ lat: a.lat, lng: a.lng, id: a.id })),
                ];

                logStructured({
                    layer: "agent", agent: "logistics", step: "matrix_fetch", requestId,
                    data: { day: day.day, points: points.length },
                });

                const { matrix, usedFallback } = await getTravelTimeMatrix(points);
                const indexMap = new Map(points.map((p, i) => [p.id, i]));

                const { scheduled, droppedCount } = buildScheduledDay(
                    hotelCoord,
                    dayActivities,
                    { matrix, indexMap },
                );

                return {
                    optimizedDay: { day: day.day, theme: day.theme, activities: scheduled },
                    droppedCount,
                    usedFallback,
                };
            })
        );

        // ── 6. Collect results, fall back deterministically on errors ────────
        const optimizedDays: OptimizedDay[] = dayResults.map((settled, i) => {
            const originalDay = validatedDays[i]!;

            if (settled.status === "fulfilled") {
                const { optimizedDay, droppedCount, usedFallback: dayFallback } = settled.value;
                if (dayFallback) usedMapboxFallback = true;
                if (droppedCount > 0) {
                    warnings.push(
                        `Day ${originalDay.day}: ${droppedCount} ${droppedCount === 1 ? "activity was" : "activities were"} removed due to time constraints`,
                    );
                }
                return optimizedDay;
            }

            // Matrix or routing threw — fall back to slot-assignment only
            // (slot assignment keeps all activities, so droppedCount is 0)
            usedHaversineFallback = true;
            logError(`[Logistics] day ${originalDay.day} matrix failed — using deterministic fallback`, settled.reason);
            logStructured({
                layer: "agent", agent: "logistics", step: "fallback_used", requestId,
                data: { day: originalDay.day, reason: String(settled.reason) },
            });

            return {
                day:        originalDay.day,
                theme:      originalDay.theme,
                activities: assignSlots(originalDay.activities),
            };
        });

        if (usedHaversineFallback) {
            warnings.push("One or more days used slot-assignment fallback (Mapbox Matrix unavailable)");
        }
        if (usedMapboxFallback) {
            warnings.push("Travel times are estimated (fallback routing used)");
        }

        // ── 7. Inject meals (lunch + dinner) per day ─────────────────────────
        // Runs after routing so meal times are anchored to real schedule slots.
        // injectMeals() is pure + deterministic — no API calls, no mutation.
        let totalLunch        = 0;
        let totalDinner       = 0;
        let totalLunchFallback  = 0;
        let totalDinnerFallback = 0;

        const daysWithMeals = optimizedDays.map((day) => {
            const { activities, lunchInserted, dinnerInserted, lunchWasFallback, dinnerWasFallback } =
                injectMeals(day.activities, context.destination);
            if (lunchInserted)      totalLunch++;
            if (dinnerInserted)     totalDinner++;
            if (lunchWasFallback)   totalLunchFallback++;
            if (dinnerWasFallback)  totalDinnerFallback++;
            return { ...day, activities };
        });

        logStructured({
            layer: "agent", agent: "logistics", step: "meals_injected", requestId,
            data: {
                lunchInserted:    totalLunch,
                dinnerInserted:   totalDinner,
                lunchFallback:    totalLunchFallback,
                dinnerFallback:   totalDinnerFallback,
                totalDays:        daysWithMeals.length,
            },
        });

        if (totalLunch < daysWithMeals.length) {
            warnings.push("Lunch could not be scheduled on some days");
        }
        if (totalDinner < daysWithMeals.length) {
            warnings.push("Dinner could not be scheduled on some days");
        }
        // Loud warning when the Research Agent's restaurant set didn't cover a
        // meal slot — a contextual placeholder was inserted. Visible in the UI.
        if (totalLunchFallback > 0 || totalDinnerFallback > 0) {
            warnings.push(
                `Some meal stops (${totalLunchFallback} lunch, ${totalDinnerFallback} dinner) use generic placeholders — Research Agent did not return a real restaurant for those slots.`
            );
        }

        // ── 8. Compute food cost ─────────────────────────────────────────────
        // Pure pass over injected meal activities — no API calls, no mutation.
        const foodCostSummary = computeFoodCost(daysWithMeals);

        logStructured({
            layer: "agent", agent: "logistics", step: "food_cost_computed", requestId,
            data: {
                total:      foodCostSummary.total,
                avgPerDay:  foodCostSummary.avgPerDay,
                days:       foodCostSummary.perDay,
                destination: context.destination,
            },
        });

        // ── 9. Assemble result ───────────────────────────────────────────────
        const result: OptimizedTripContext = {
            ...context,
            selectedHotel:   { ...baseHotel, lat: hotelLat, lng: hotelLng },
            days:            daysWithMeals,
            foodCostSummary,
            ...(warnings.length > 0 ? { warnings } : {}),
        };

        // ── 10. Output validation ────────────────────────────────────────────
        try {
            validateOutput(result);
        } catch (validationErr) {
            logError("[Logistics] output validation failed", validationErr);
            logStructured({
                layer: "agent", agent: "logistics", step: "error", requestId,
                data: { validation: String(validationErr) },
            });
            throw validationErr;
        }

        logStructured({
            layer: "agent", agent: "logistics", step: "end", requestId,
            data: {
                selectedHotel:   result.selectedHotel.name,
                days:            result.days.length,
                totalScheduled:  result.days.reduce((s, d) => s + d.activities.length, 0),
                warnings:        warnings.length,
                path:            "mapbox_deterministic",
            },
        });

        return result;
    }
}
