export interface PlannerDayTheme {
    day: number;
    theme: string;
}

export interface PlannerPreferences {
    budget?: number;
    style?: "luxury" | "budget" | "balanced" | "adventure" | "relaxed";
    pace?: "slow" | "moderate" | "fast";
}

export interface TripContext {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    preferences: PlannerPreferences;
    days: PlannerDayTheme[];
}
