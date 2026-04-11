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

export interface Activity {
    name: string;
    type: ActivityType;
    description: string;
    estimatedCost?: number;
    lat?: number;
    lng?: number;
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
}

export interface EnrichedDay {
    day: number;
    theme: string;
    activities: Activity[];
}

export type EnrichedTripContext = Omit<TripContext, "days"> & {
    days: EnrichedDay[];
    hotels: HotelOption[];
};

// ─── Logistics output ─────────────────────────────────────────────────────────

export type ScheduledActivity = Activity & {
    timeSlot: "morning" | "afternoon" | "evening";
    startTime?: string;
    endTime?: string;
    travelTimeFromPrevMs?: number;
};

export interface OptimizedDay {
    day: number;
    theme: string;
    activities: ScheduledActivity[];
}

export type OptimizedTripContext = Omit<EnrichedTripContext, "days"> & {
    days: OptimizedDay[];
    selectedHotel: HotelOption;
};
