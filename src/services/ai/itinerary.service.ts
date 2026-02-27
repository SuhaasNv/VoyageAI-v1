/**
 * AI Service — Itinerary Generation
 *
 * This service orchestrates the prompt building, LLM call, JSON parsing,
 * and fallback handling for the itinerary generation endpoint.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
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
Generate a complete day‑by‑day travel itinerary for **${parsedReq.destination}** from **${parsedReq.startDate}** to **${parsedReq.endDate}**.
- Respect the total budget of ${parsedReq.budget.total} ${parsedReq.budget.currency} (flexibility: ${parsedReq.budget.flexibility}).
- Incorporate any provided Travel DNA profile.
- Include at least one "must‑see" attraction from the list if possible.
- Avoid any attractions listed in "avoidAttractions".
- Return ONLY the JSON object that matches the schema defined above.
`; // end task

    const fullPrompt = buildFullPrompt({ system, context, schema, task });

    const client = getLLMClient();

    // LLM request options – we request JSON format and a moderate temperature
    const llmOptions = {
        model: undefined, // let the client decide (env var or default mock)
        temperature: 0.7,
        responseFormat: "json" as const,
        maxTokens: 4096,
        timeoutMs: 60000,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        const itinerary = parseJSONResponse<Itinerary>(llmResponse.content);
        const finalItinerary = (await import("../../lib/ai/schemas")).ItinerarySchema.parse(itinerary);
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
