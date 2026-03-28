export interface PlannerDayTheme {
    day: number;
    theme: string;
}

export interface PlannerPreferences {
    budget?: number;
    style?: string;
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
