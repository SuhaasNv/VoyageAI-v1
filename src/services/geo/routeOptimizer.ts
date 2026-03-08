/**
 * lib/geo/routeOptimizer.ts
 *
 * Deterministic route optimization for VoyageAI itineraries.
 *
 * Strategy: nearest-neighbor heuristic (O(n²) per day, n ≤ ~8 activities).
 * No external APIs, no LLM, no new dependencies — pure TypeScript math.
 */

import type { ItineraryDay, Itinerary } from "@/lib/ai/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GeoPoint {
    lat: number;
    lng: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Great-circle distance between two coordinates.
 * Returns kilometres.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
    const R = 6_371; // Earth mean radius in km
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLng = Math.sin(dLng / 2);

    const h =
        sinHalfLat * sinHalfLat +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfLng * sinHalfLng;

    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─────────────────────────────────────────────────────────────────────────────
// Route distance helpers
// ─────────────────────────────────────────────────────────────────────────────

function hasCoords(
    location: { lat?: number; lng?: number }
): location is { lat: number; lng: number } {
    return (
        typeof location.lat === "number" &&
        typeof location.lng === "number" &&
        isFinite(location.lat) &&
        isFinite(location.lng)
    );
}

/**
 * Sum of consecutive haversine distances for an ordered activity list.
 * Activities without coordinates contribute 0 km.
 */
export function routeDistanceKm(activities: ItineraryDay["activities"]): number {
    let total = 0;
    for (let i = 1; i < activities.length; i++) {
        const prev = activities[i - 1].location;
        const curr = activities[i].location;
        if (hasCoords(prev) && hasCoords(curr)) {
            total += haversineDistance(prev, curr);
        }
    }
    return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-day optimization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reorders the activities in a single day using the nearest-neighbor heuristic.
 *
 * Rules:
 * - Fewer than 3 activities → return unchanged (no benefit).
 * - Activities without valid lat/lng are excluded from routing and appended at
 *   the end in their original relative order.
 * - The first geo-tagged activity anchors the route (preserving the starting
 *   point chosen by the itinerary generator).
 * - All original activity objects are preserved; only their order changes.
 */
export function optimizeDayRoute(day: ItineraryDay): ItineraryDay {
    const { activities } = day;

    if (activities.length < 3) return day;

    const geoTagged = activities.filter((a) => hasCoords(a.location));
    const untagged = activities.filter((a) => !hasCoords(a.location));

    // Not enough georeferenced activities to meaningfully reorder.
    if (geoTagged.length < 3) return day;

    // Nearest-neighbor pass — anchor at the first geo-tagged activity.
    const visited = new Set<number>();
    const ordered: typeof activities = [geoTagged[0]];
    visited.add(0);

    while (ordered.length < geoTagged.length) {
        const last = ordered[ordered.length - 1].location as GeoPoint;
        let nearestIdx = -1;
        let nearestDist = Infinity;

        for (let i = 0; i < geoTagged.length; i++) {
            if (visited.has(i)) continue;
            const dist = haversineDistance(last, geoTagged[i].location as GeoPoint);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }

        visited.add(nearestIdx);
        ordered.push(geoTagged[nearestIdx]);
    }

    return { ...day, activities: [...ordered, ...untagged] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full itinerary optimization
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizeResult {
    itinerary: Itinerary;
    /** Total travel distance in the original ordering (km, geo-tagged legs only). */
    originalDistanceKm: number;
    /** Total travel distance after optimization (km, geo-tagged legs only). */
    optimizedDistanceKm: number;
    /** Positive value = distance saved; 0 if no improvement. */
    totalDistanceSavedKm: number;
}

/**
 * Applies nearest-neighbor route optimization to every day in the itinerary.
 * Returns a new `Itinerary` object (original is not mutated) alongside
 * before/after distance metrics.
 */
export function optimizeItineraryRoutes(itinerary: Itinerary): OptimizeResult {
    let originalDistanceKm = 0;
    let optimizedDistanceKm = 0;

    const optimizedDays = itinerary.days.map((day) => {
        originalDistanceKm += routeDistanceKm(day.activities);
        const optimized = optimizeDayRoute(day);
        optimizedDistanceKm += routeDistanceKm(optimized.activities);
        return optimized;
    });

    return {
        itinerary: { ...itinerary, days: optimizedDays },
        originalDistanceKm,
        optimizedDistanceKm,
        totalDistanceSavedKm: Math.max(0, originalDistanceKm - optimizedDistanceKm),
    };
}
