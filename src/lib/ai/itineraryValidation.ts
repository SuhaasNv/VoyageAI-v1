/**
 * Post-parse structural sanity checks for AI-generated itineraries.
 * Runs after Zod schema validation. Enterprise-grade validation layer.
 */

import type { Itinerary } from "./schemas";

export class ItineraryValidationError extends Error {
    constructor(
        message: string,
        public readonly code: "BUDGET_EXCEEDED" | "EMPTY_DAY" | "INVALID_COORDINATES" | "STRUCTURE_INVALID"
    ) {
        super(message);
        this.name = "ItineraryValidationError";
    }
}

const BUDGET_TOLERANCE: Record<string, number> = {
    strict: 1.05,
    flexible: 1.2,
    "very-flexible": 1.35,
};

/**
 * Validates itinerary structure after Zod parse.
 * Throws ItineraryValidationError on failure.
 */
export function validateItineraryStructure(
    itinerary: Itinerary,
    options: { maxBudget: number; flexibility?: "strict" | "flexible" | "very-flexible" }
): void {
    const { maxBudget, flexibility = "flexible" } = options;

    // Reject 0-activity itinerary
    const totalActivities = itinerary.days.reduce((sum, d) => sum + d.activities.length, 0);
    if (totalActivities === 0) {
        throw new ItineraryValidationError(
            "Itinerary must contain at least one activity",
            "STRUCTURE_INVALID"
        );
    }

    // Reject empty days
    const emptyDays = itinerary.days.filter((d) => d.activities.length === 0);
    if (emptyDays.length > 0) {
        throw new ItineraryValidationError(
            `Day(s) ${emptyDays.map((d) => d.day).join(", ")} have no activities`,
            "EMPTY_DAY"
        );
    }

    // Budget upper bound
    const tolerance = BUDGET_TOLERANCE[flexibility] ?? 1.2;
    const ceiling = maxBudget * tolerance;
    if (itinerary.totalEstimatedCost.amount > ceiling) {
        throw new ItineraryValidationError(
            `Total cost ${itinerary.totalEstimatedCost.amount} exceeds budget ceiling ${ceiling} (${flexibility})`,
            "BUDGET_EXCEEDED"
        );
    }

    // Lat/lng validity for all activities with coordinates
    for (const day of itinerary.days) {
        for (const activity of day.activities) {
            const { lat, lng } = activity.location;
            if (lat !== undefined && (lat < -90 || lat > 90)) {
                throw new ItineraryValidationError(
                    `Activity "${activity.name}": lat must be -90 to 90, got ${lat}`,
                    "INVALID_COORDINATES"
                );
            }
            if (lng !== undefined && (lng < -180 || lng > 180)) {
                throw new ItineraryValidationError(
                    `Activity "${activity.name}": lng must be -180 to 180, got ${lng}`,
                    "INVALID_COORDINATES"
                );
            }
        }
    }
}
