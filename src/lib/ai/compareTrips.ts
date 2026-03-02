/**
 * lib/ai/compareTrips.ts
 *
 * Generates and scores two itineraries in parallel.
 * No DB writes — purely ephemeral computation using the existing
 * itinerary service and travelScore engine.
 */

import { generateItinerary } from "@/services/ai/itinerary.service";
import { calculateTravelScore, type TravelScoreResult } from "@/lib/analysis/travelScore";
import type { Itinerary } from "@/lib/ai/schemas";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CompareTripsParams {
    startDate:  string;   // YYYY-MM-DD
    endDate:    string;   // YYYY-MM-DD
    budget:     number;   // positive number
    currency?:  string;   // ISO-4217, defaults to USD
}

export interface TripComparisonSide {
    destination: string;
    itinerary:   Itinerary;
    score:       TravelScoreResult;
}

export interface ComparisonResult {
    a:           TripComparisonSide;
    b:           TripComparisonSide;
    /** "tie" when the score difference is ≤ 2 pts. */
    winner:      "a" | "b" | "tie";
    generatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function compareTrips(
    destinationA: string,
    destinationB: string,
    params: CompareTripsParams,
): Promise<ComparisonResult> {
    const sharedBase = {
        startDate: params.startDate,
        endDate:   params.endDate,
        budget: {
            total:       params.budget,
            currency:    params.currency ?? "USD",
            flexibility: "flexible" as const,
        },
    };

    // Generate both itineraries concurrently — no tripId = no DB writes.
    const [itineraryA, itineraryB] = await Promise.all([
        generateItinerary({ ...sharedBase, destination: destinationA }),
        generateItinerary({ ...sharedBase, destination: destinationB }),
    ]);

    const scoreA = calculateTravelScore(itineraryA, params.budget);
    const scoreB = calculateTravelScore(itineraryB, params.budget);

    const diff = scoreA.score - scoreB.score;
    const winner: ComparisonResult["winner"] =
        diff >  2 ? "a" :
        diff < -2 ? "b" :
                    "tie";

    return {
        a: { destination: destinationA, itinerary: itineraryA, score: scoreA },
        b: { destination: destinationB, itinerary: itineraryB, score: scoreB },
        winner,
        generatedAt: new Date().toISOString(),
    };
}
