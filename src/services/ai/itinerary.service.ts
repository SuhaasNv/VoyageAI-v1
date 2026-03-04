/**
 * AI Service — Itinerary Generation
 *
 * This service orchestrates the prompt building, LLM call, JSON parsing,
 * and fallback handling for the itinerary generation endpoint.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { selectModelConfig } from "../../lib/ai/modelRouter";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    GenerateItineraryRequest,
    Itinerary,
    GenerateItineraryRequestSchema,
} from "../../lib/ai/schemas";
import { validateItineraryStructure } from "../../lib/ai/itineraryValidation";
import {
    itineraryCacheKey,
    getItineraryCached,
    setItineraryCached,
} from "../../lib/ai/cache";
import { logError } from "@/lib/logger";

// ─────────────────────────────────────────
//  LLM Output Sanitizer
// ─────────────────────────────────────────

/** Valid activity types accepted by ActivityTypeSchema. */
const VALID_ACTIVITY_TYPES = new Set([
    "sightseeing", "dining", "adventure", "cultural",
    "shopping", "relaxation", "transport", "accommodation",
]);

/**
 * Maps common LLM activity-type aliases → the closest valid schema value.
 * LLMs frequently invent types like "entertainment", "leisure", "museum", etc.
 */
const ACTIVITY_TYPE_ALIASES: Record<string, string> = {
    entertainment: "cultural",
    event: "cultural",
    arts: "cultural",
    history: "cultural",
    museum: "cultural",
    gallery: "cultural",
    festival: "cultural",
    performance: "cultural",
    leisure: "relaxation",
    wellness: "relaxation",
    spa: "relaxation",
    beach: "relaxation",
    rest: "relaxation",
    nightlife: "dining",
    bar: "dining",
    cafe: "dining",
    coffee: "dining",
    breakfast: "dining",
    lunch: "dining",
    dinner: "dining",
    food: "dining",
    drinks: "dining",
    recreation: "adventure",
    fitness: "adventure",
    sports: "adventure",
    outdoor: "adventure",
    hiking: "adventure",
    nature: "sightseeing",
    landmark: "sightseeing",
    tour: "sightseeing",
    visit: "sightseeing",
    excursion: "sightseeing",
    experience: "sightseeing",
    market: "shopping",
    retail: "shopping",
    hotel: "accommodation",
    hostel: "accommodation",
    flight: "transport",
    train: "transport",
    bus: "transport",
    taxi: "transport",
    transfer: "transport",
    cruise: "transport",
};

function normalizeActivityType(raw: unknown): string {
    if (typeof raw !== "string") return "sightseeing";
    const lower = raw.toLowerCase().trim();
    if (VALID_ACTIVITY_TYPES.has(lower)) return lower;
    return ACTIVITY_TYPE_ALIASES[lower] ?? "sightseeing";
}

const clamp010 = (v: unknown): number =>
    typeof v === "number" ? Math.max(0, Math.min(10, v)) : 0;

/**
 * Sanitizes raw LLM itinerary JSON before Zod validation.
 *
 * Fixes the two most common LLM deviations:
 *  - Fatigue / pacing scores that exceed the 0-10 range
 *  - Activity type values that use aliases not in the strict enum
 *
 * Runs in-place on the parsed object; Zod still validates the final shape.
 */
function sanitizeLLMItinerary(raw: unknown): unknown {
    if (typeof raw !== "object" || raw === null) return raw;
    const obj = raw as Record<string, unknown>;

    if (Array.isArray(obj.days)) {
        obj.days = (obj.days as unknown[]).map((day) => {
            if (typeof day !== "object" || day === null) return day;
            const d = day as Record<string, unknown>;

            d.dailyFatigueScore = clamp010(d.dailyFatigueScore);

            if (Array.isArray(d.activities)) {
                d.activities = (d.activities as unknown[]).map((act) => {
                    if (typeof act !== "object" || act === null) return act;
                    const a = act as Record<string, unknown>;
                    a.type = normalizeActivityType(a.type);
                    a.fatigueScore = clamp010(a.fatigueScore);
                    return a;
                });
            }

            return d;
        });
    }

    if (typeof obj.pacingAnalysis === "object" && obj.pacingAnalysis !== null) {
        const p = obj.pacingAnalysis as Record<string, unknown>;
        p.overallScore = clamp010(p.overallScore);
    }

    return obj;
}

/**
 * Generates a full itinerary based on the request and optional context.
 *
 * @param request - validated request payload from the API route
 * @param contextBundle - optional additional context (travel DNA, existing itinerary, etc.)
 * @returns a fully typed Itinerary object
 */
export async function generateItinerary(
    request: GenerateItineraryRequest & { tripId?: string },
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<Itinerary> {
    const parsedReq = GenerateItineraryRequestSchema.parse(request);

    const start = new Date(parsedReq.startDate);
    const end = new Date(parsedReq.endDate);
    const computedTotalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

    const cacheKey = itineraryCacheKey({
        destination: parsedReq.destination,
        startDate: parsedReq.startDate,
        endDate: parsedReq.endDate,
        budget: parsedReq.budget,
        mustSeeAttractions: parsedReq.mustSeeAttractions,
        avoidAttractions: parsedReq.avoidAttractions,
    });
    const cached = await getItineraryCached(cacheKey);
    if (cached) {
        const asItinerary = cached as Itinerary;
        return { ...asItinerary, tripId: (parsedReq as { tripId?: string }).tripId ?? asItinerary.tripId };
    }

    // Build the layered prompt
    const system = SYSTEM_PROMPTS.ITINERARY_GENERATOR;
    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.ITINERARY;
    const task = `
## Task
Generate a complete day‑by‑day travel itinerary for exactly **${computedTotalDays} days** for **${parsedReq.destination}** from **${parsedReq.startDate}** to **${parsedReq.endDate}**.
- Your "days" array MUST contain exactly ${computedTotalDays} objects, one for each day.
- Respect the total budget of ${parsedReq.budget.total} ${parsedReq.budget.currency} (flexibility: ${parsedReq.budget.flexibility}).
- Incorporate any provided Travel DNA profile.
- Include at least one "must‑see" attraction from the list if possible.
- Avoid any attractions listed in "avoidAttractions".
- Return ONLY the JSON object that matches the schema defined above.
`; // end task

    const fullPrompt = buildFullPrompt({ system, context, schema, task });

    const client = getLLMClient();
    const llmOptions = {
        ...selectModelConfig({ endpoint: "itinerary" }),
        responseFormat: "json" as const,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        const rawItinerary = parseJSONResponse<unknown>(llmResponse.content);
        const sanitized = sanitizeLLMItinerary(rawItinerary);
        const finalItinerary = (await import("../../lib/ai/schemas")).ItinerarySchema.parse(sanitized);
        validateItineraryStructure(finalItinerary, {
            maxBudget: parsedReq.budget.total,
            flexibility: parsedReq.budget.flexibility,
        });
        const toCache = { ...finalItinerary, tripId: (parsedReq as { tripId?: string }).tripId ?? finalItinerary.tripId };
        await setItineraryCached(cacheKey, toCache);
        return finalItinerary;
    } catch (err) {
        logError("[Itinerary Service] LLM error", err);
        throw err;
    }
}

/**
 * Simple health‑check utility – useful for monitoring the service.
 */
export function healthCheck(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
}
