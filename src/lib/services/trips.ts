/**
 * lib/services/trips.ts
 *
 * Serialization helpers that transform a Prisma Trip record into the
 * TripDTO shape consumed by the frontend.
 *
 * The DB Trip model carries only the authoritative fields (destination,
 * startDate, endDate). Derived display fields (title, dates, status) are
 * computed here so the UI never touches raw DB rows directly.
 */

import type { Trip, Itinerary as PrismaItinerary } from "@prisma/client";
import type { Itinerary as AIItinerary, Activity as AIActivity } from "@/lib/ai/schemas";
import type { SafeTripContext } from "@/agents/safety/safetyAgent";

// ─── Itinerary types (UI event format) ───────────────────────────────────────

export interface ItineraryEvent {
    id: string;
    time: string;
    title: string;
    type: string;
    location: string;
    cost: number;
    lat?: number;
    lng?: number;
}

export interface ItineraryDay {
    day: number;
    date: string;
    title: string;
    events: ItineraryEvent[];
}

// ─── TripDTO — the shape exposed to the frontend ─────────────────────────────

export interface TripDTO {
    id: string;
    title: string;
    destination: string;
    /** Human-readable date range, e.g. "Oct 15 – Oct 20, 2026" */
    dates: string;
    startDate: string; // ISO date string (YYYY-MM-DD)
    endDate: string;   // ISO date string (YYYY-MM-DD)
    status: "upcoming" | "planning" | "past";
    /** Pipeline completion status — draft means itinerary generation was not finished. */
    pipelineStatus: "draft" | "completed";
    style?: string;
    budget: {
        total: number;
        spent: number;
        currency: string;
    };
    fatigueLevel: "low" | "medium" | "high" | null;
    itinerary: ItineraryDay[];
    imageUrl: string | null;
    createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateRange(start: Date, end: Date): string {
    const startStr = `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCDate()}`;
    const endStr = `${MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
    return `${startStr} – ${endStr}`;
}

function deriveStatus(start: Date, end: Date): TripDTO["status"] {
    const now = new Date();
    if (now > end) return "past";
    if (now >= start) return "upcoming";
    return "planning";
}

function toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Sums activity.cost from itinerary events. Ignores missing/invalid cost safely.
 */
export function computeSpentFromItinerary(itinerary: ItineraryDay[]): number {
    let sum = 0;
    try {
        for (const day of itinerary) {
            if (!day?.events || !Array.isArray(day.events)) continue;
            for (const event of day.events) {
                const c = event?.cost;
                if (typeof c === "number" && !Number.isNaN(c) && c >= 0) sum += c;
            }
        }
    } catch {
        // no crash on malformed data
    }
    return sum;
}

/**
 * Sums activity cost from rawJson (AI itinerary schema). Returns 0 on malformed data.
 */
export function computeSpentFromRawJson(rawJson: unknown): number {
    try {
        const raw = rawJson as { days?: Array<{ activities?: Array<{ estimatedCost?: { amount?: number } }> }> };
        if (!raw?.days || !Array.isArray(raw.days)) return 0;
        let sum = 0;
        for (const day of raw.days) {
            if (!day?.activities || !Array.isArray(day.activities)) continue;
            for (const a of day.activities) {
                const amt = a?.estimatedCost?.amount;
                if (typeof amt === "number" && !Number.isNaN(amt) && amt >= 0) sum += amt;
            }
        }
        return sum;
    } catch {
        return 0;
    }
}

// ─── Trip serializer ──────────────────────────────────────────────────────────

export function serializeTrip(trip: Trip, itinerary: ItineraryDay[] = [], rawJson?: unknown): TripDTO {
    const spent = itinerary.length > 0
        ? computeSpentFromItinerary(itinerary)
        : (rawJson ? computeSpentFromRawJson(rawJson) : 0);
    return {
        id: trip.id,
        title: trip.destination,
        destination: trip.destination,
        dates: formatDateRange(trip.startDate, trip.endDate),
        startDate: toIsoDate(trip.startDate),
        endDate: toIsoDate(trip.endDate),
        status: deriveStatus(trip.startDate, trip.endDate),
        pipelineStatus: (trip.status === "completed" ? "completed" : "draft") as "draft" | "completed",
        style: trip.style ?? undefined,
        budget: {
            total: trip.budgetTotal,
            spent,
            currency: trip.budgetCurrency,
        },
        fatigueLevel: null,
        itinerary,
        imageUrl: trip.imageUrl ?? null,
        createdAt: trip.createdAt.toISOString(),
    };
}

// ─── AI Itinerary → UI format adapter ────────────────────────────────────────

/**
 * Maps an AI-generated Itinerary (using the AI schema) to the flat
 * ItineraryDay[] format the TimelineItinerary component renders.
 *
 * Activity fields mapped:
 *   activity.id            → event.id
 *   activity.startTime     → event.time
 *   activity.name          → event.title
 *   activity.type          → event.type
 *   activity.location.name → event.location
 *   activity.estimatedCost.amount → event.cost
 */
export function adaptAIItinerary(raw: AIItinerary): ItineraryDay[] {
    return raw.days.map((day) => ({
        day: day.day,
        date: day.date,
        title: day.theme,
        events: day.activities.map((activity) => ({
            id: activity.id,
            time: activity.startTime,
            title: activity.name,
            type: activity.type,
            location: activity.location.name,
            cost: activity.estimatedCost.amount,
            lat: activity.location.lat,
            lng: activity.location.lng,
        })),
    }));
}

/**
 * Parses a raw Prisma Itinerary row's rawJson field and adapts it to the
 * ItineraryDay[] format. Returns an empty array if parsing fails or the DB
 * row has no valid data.
 */
export function parseStoredItinerary(row: PrismaItinerary): ItineraryDay[] {
    try {
        const raw = row.rawJson as AIItinerary;
        if (!raw?.days || !Array.isArray(raw.days)) return [];
        return adaptAIItinerary(raw);
    } catch {
        return [];
    }
}

// ─── SafeTripContext → Itinerary adapter ──────────────────────────────────────

/**
 * Slot → time window mapping used when converting pipeline output to
 * ItinerarySchema format (which requires HH:MM start/end times).
 */
const SLOT_TIMES: Record<string, { start: string; end: string }> = {
    morning:   { start: "08:00", end: "10:30" },
    afternoon: { start: "12:00", end: "14:30" },
    evening:   { start: "17:00", end: "19:30" },
};

/**
 * Maps the agent-pipeline activity types to the ActivityTypeSchema enum values
 * used in ItinerarySchema.
 */
const PIPELINE_TYPE_MAP: Record<string, AIActivity["type"]> = {
    attraction: "sightseeing",
    experience: "cultural",
    restaurant: "dining",
};

/**
 * Converts a SavedTripContext (the shape persisted by /api/ai/itinerary-flow/save)
 * into the strict ItinerarySchema format expected by TripViewPage and TripMap.
 *
 * Fields that don't exist in the pipeline output are filled with safe defaults:
 *   - activity.id         → deterministic slug from day + index + name
 *   - startTime / endTime → derived from timeSlot
 *   - location            → { name: activity.name } (no lat/lng — geocoded on demand by TripMap)
 *   - estimatedCost       → { amount, currency: "USD" }
 *   - aiInsights          → safety.tips
 *   - pacingAnalysis      → safety.warnings mapped to warnings
 */
export function safeTripContextToItinerary(
    tripId: string,
    result: SafeTripContext,
): AIItinerary {
    const startDate = new Date(result.startDate + "T00:00:00Z");

    const days = result.days.map((day) => {
        const dayDate = new Date(startDate);
        dayDate.setUTCDate(dayDate.getUTCDate() + day.day - 1);
        const dateStr = dayDate.toISOString().slice(0, 10);

        const activities: AIActivity[] = day.activities.map((act, i) => {
            const slot = SLOT_TIMES[act.timeSlot] ?? SLOT_TIMES.morning;
            const type = PIPELINE_TYPE_MAP[act.type] ?? "sightseeing";
            const costAmt = typeof act.estimatedCost === "number" ? act.estimatedCost : 0;
            // Stable deterministic ID — no random UUID so re-saves are idempotent.
            const slug = act.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
            return {
                id: `d${day.day}-a${i}-${slug}`,
                name: act.name,
                type,
                startTime: act.startTime ?? slot.start,
                endTime: act.endTime ?? slot.end,
                duration_minutes: 90,
                location: {
                    name: act.name,
                    ...(typeof act.lat === "number" && typeof act.lng === "number"
                        ? { lat: act.lat, lng: act.lng }
                        : {}),
                },
                estimatedCost: { amount: costAmt, currency: "USD" },
                notes: act.description,
                aiGenerated: true,
                fatigueScore: 5,
                tags: [act.type],
            };
        });

        const totalCostAmount = activities.reduce(
            (s, a) => s + a.estimatedCost.amount,
            0,
        );

        return {
            day: day.day,
            date: dateStr,
            theme: day.theme,
            activities,
            totalCost: { amount: totalCostAmount, currency: "USD" },
            dailyFatigueScore: 5,
            tips: [],
        };
    });

    return {
        tripId,
        destination: result.destination,
        startDate: result.startDate,
        endDate: result.endDate,
        totalDays: result.durationDays,
        days,
        totalEstimatedCost: {
            amount: result.budget.totalEstimatedCost,
            currency: "USD",
            breakdown: {},
        },
        aiInsights: result.safety?.tips ?? [],
        pacingAnalysis: {
            overallScore: 5,
            warnings: result.safety?.warnings.map((w) => w.message) ?? [],
            suggestions: [],
        },
        generatedAt: new Date().toISOString(),
        modelVersion: "pipeline-v1",
    };
}

/**
 * Detects whether a raw DB value looks like a SafeTripContext (pipeline format)
 * rather than an ItinerarySchema (AI service format).
 * Heuristic: has `budget.totalEstimatedCost` and `safety.riskLevel` but no `totalDays`.
 */
export function looksLikeSafeTripContext(raw: unknown): raw is SafeTripContext {
    const obj = raw as Record<string, unknown> | null;
    return (
        !!obj &&
        typeof obj === "object" &&
        typeof obj.destination === "string" &&
        Array.isArray(obj.days) &&
        typeof (obj.budget as Record<string, unknown>)?.totalEstimatedCost === "number" &&
        !("totalDays" in obj)
    );
}
