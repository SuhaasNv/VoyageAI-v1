/**
 * Shared pipeline DTOs for Planner → Research → Logistics → Budget → Safety.
 * Single module to avoid duplicate interface definitions across agents.
 */

// ─── Planner output ───────────────────────────────────────────────────────────

export interface PlannerDayTheme {
    day: number;
    theme: string;
}

export interface PlannerPreferences {
    budget?: number;
    style?: string;
    /** Wire format allows any string; PlannerAgent normalizes to known paces when valid. */
    pace?: string;
}

export interface TripContext {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    /** Omitted in some JSON payloads; PlannerAgent always normalizes to an object (possibly {}). */
    preferences?: PlannerPreferences;
    days: PlannerDayTheme[];
}

// ─── Research output ───────────────────────────────────────────────────────────

export type ActivityType = "attraction" | "experience" | "restaurant";

/**
 * Geocoding precision level attached by the Research Agent after Mapbox lookup.
 *   high   — result within 5 km of city centroid AND not a city-centroid-level match.
 *   medium — within distance threshold AND not city-centroid-level.
 *   low    — Mapbox returned city center rather than a specific POI, or this is a
 *            centroid fallback (geocoding failed / no token).
 */
export type GeoConfidence = "high" | "medium" | "low";

export interface Activity {
    name: string;
    type: ActivityType;
    description: string;
    estimatedCost?: number;
    lat?: number;
    lng?: number;
    /** Geocoding precision — set after attachCoordinates; absent on Logistics input. */
    geoConfidence?: GeoConfidence;
    /** Restaurant-only fields — populated by enrichRestaurantMetadata(); absent on other activity types. */
    cuisine?: string;
    shortDescription?: string;
    priceLevel?: "$" | "$$" | "$$$";
}

export type PriceRange = "$" | "$$" | "$$$" | "$$$$";

export interface HotelOption {
    name: string;
    priceRange: PriceRange;
    area: string;
    tags: string[];
    rating?: number;
    lat?: number;
    lng?: number;
    /** Geocoding precision — set after attachCoordinates; absent on Logistics input. */
    geoConfidence?: GeoConfidence;
}

export interface EnrichedDay {
    day: number;
    theme: string;
    activities: Activity[];
}

export type EnrichedTripContext = Omit<TripContext, "days"> & {
    days: EnrichedDay[];
    hotels: HotelOption[];
    warnings?: string[];
};

// ─── Logistics output ─────────────────────────────────────────────────────────

export type ScheduledActivity = Activity & {
    /**
     * Stable, deterministic activity identifier.
     * Computed by the Budget Agent as hash(name | type | startTime | day).
     * Present on activities that have passed through the budget layer.
     * Use for UI action payloads and applyAdjustment matching.
     */
    id?: string;
    timeSlot: "morning" | "afternoon" | "evening";
    startTime?: string;
    endTime?: string;
    travelTimeFromPrevMs?: number;
    /** True when this activity was auto-injected as a meal stop by injectMeals(). */
    isMeal?: boolean;
    /** Set on auto-injected meal activities only. */
    mealType?: "lunch" | "dinner";
};

export interface OptimizedDay {
    day: number;
    theme: string;
    activities: ScheduledActivity[];
}

export interface FoodCostSummary {
    /** Estimated food spend per day (index 0 = day 1), in USD. */
    perDay: number[];
    /** Sum of all perDay values — total food cost for the trip. */
    total: number;
    /** Average food cost per day across the trip. */
    avgPerDay: number;
}

export type OptimizedTripContext = Omit<EnrichedTripContext, "days"> & {
    days: OptimizedDay[];
    selectedHotel: HotelOption;
    /**
     * Non-fatal warnings emitted by the Logistics Agent.
     * Examples: "Using fallback routing", "Low-confidence coordinates detected".
     * Downstream agents and API routes should surface these to the UI.
     */
    warnings?: string[];
    /**
     * Food cost breakdown computed from injected meal activities.
     * Absent only when no meal activities were produced.
     */
    foodCostSummary?: FoodCostSummary;
};
