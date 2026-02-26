/*
 * Trip Simulation Engine
 * ----------------------
 * This module provides pure business‑logic functions for simulating a trip.
 * It is deliberately kept out of any API route so that it can be reused
 * both on the server and (if needed) on the client without pulling in
 * Next.js specifics.
 *
 * The implementation follows the approved implementation plan:
 *   • Calculate budget burn rate
 *   • Estimate daily walking distance
 *   • Derive a fatigue score
 *   • Compute time utilisation per day
 *   • Detect cost overruns
 *
 * The logic is intentionally simple but deterministic – suitable for a
 * dashboard that visualises the resulting metrics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Budget {
    total: number;
    spent: number;
    currency: string;
}

export interface Event {
    id: string;
    time: string; // "HH:MM" 24‑hour format
    title: string;
    type: string; // e.g. "transit", "hotel", "food", "exploration", ...
    location: string;
    cost: number;
}

export interface ItineraryDay {
    day: number;
    date: string;
    title: string;
    events: Event[];
}

export interface TripData {
    id: string;
    title: string;
    destination: string;
    dates: string;
    status: string;
    budget: Budget;
    fatigueLevel: 'low' | 'medium' | 'high';
    itinerary: ItineraryDay[];
}

export interface SimulationResult {
    tripId: string;
    budgetBurnRate: number; // percentage of total budget spent
    dailyWalkingDistance: Record<number, number>; // km per itinerary day
    fatigueScore: number; // numeric representation (1‑3) possibly adjusted
    timeUtilisation: Record<number, number>; // % of a 24h day used for events
    costOverrun: number; // amount over budget (0 if none)
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------
/**
 * Parse a "HH:MM" string into minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Convert minutes back to a decimal hour fraction (e.g. 90 min → 1.5).
 */
function minutesToHours(min: number): number {
    return min / 60;
}

/**
 * Map textual fatigue level to a base numeric score.
 */
function baseFatigueScore(level: 'low' | 'medium' | 'high'): number {
    const map = { low: 1, medium: 2, high: 3 } as const;
    return map[level];
}

/**
 * Estimate walking distance for a single event.
 *   • "exploration" or "sightseeing" → 2 km
 *   • "food", "hotel", "transit", "entertainment" → 0 km
 *   • Any other type defaults to 1 km (conservative estimate).
 */
function walkingDistanceForEvent(eventType: string): number {
    const lower = eventType.toLowerCase();
    if (lower === 'exploration' || lower === 'sightseeing') return 2;
    if (['food', 'hotel', 'transit', 'entertainment', 'transport'].includes(lower))
        return 0;
    return 1; // fallback for unknown types
}

// ---------------------------------------------------------------------------
// Core simulation function
// ---------------------------------------------------------------------------
/**
 * Simulate a trip and return a collection of metrics ready for dashboard graphs.
 */
export function simulateTrip(trip: TripData): SimulationResult {
    // ---- Budget burn rate ---------------------------------------------------
    const budgetBurnRate = (trip.budget.spent / trip.budget.total) * 100;

    // ---- Cost overrun ------------------------------------------------------
    const costOverrun = Math.max(0, trip.budget.spent - trip.budget.total);

    // ---- Daily walking distance --------------------------------------------
    const dailyWalkingDistance: Record<number, number> = {};
    for (const day of trip.itinerary) {
        const distance = day.events.reduce(
            (sum, ev) => sum + walkingDistanceForEvent(ev.type),
            0,
        );
        dailyWalkingDistance[day.day] = distance;
    }

    // ---- Fatigue score -----------------------------------------------------
    // Base score from the declared level, then add a small penalty for the
    // number of events (more events → higher perceived fatigue).
    const baseScore = baseFatigueScore(trip.fatigueLevel);
    const eventCount = trip.itinerary.reduce((c, d) => c + d.events.length, 0);
    const fatigueScore = Math.min(5, baseScore + eventCount / 20); // cap at 5 for sanity

    // ---- Time utilisation --------------------------------------------------
    // For each day we sum the duration between the earliest and latest event
    // times, then express it as a percentage of a 24‑hour day.
    const timeUtilisation: Record<number, number> = {};
    for (const day of trip.itinerary) {
        if (day.events.length === 0) {
            timeUtilisation[day.day] = 0;
            continue;
        }
        const minutes = day.events.map((e) => parseTimeToMinutes(e.time));
        const minTime = Math.min(...minutes);
        const maxTime = Math.max(...minutes);
        const usedMinutes = maxTime - minTime;
        timeUtilisation[day.day] = (usedMinutes / (24 * 60)) * 100;
    }

    return {
        tripId: trip.id,
        budgetBurnRate,
        dailyWalkingDistance,
        fatigueScore,
        timeUtilisation,
        costOverrun,
    };
}

// ---------------------------------------------------------------------------
// Export a ready‑to‑use helper for the mock data set (useful for quick
// prototyping in the dashboard).
// ---------------------------------------------------------------------------
export { simulateTrip as default };
