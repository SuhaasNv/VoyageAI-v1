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

/**
 * Generates a full itinerary based on the request and optional context.
 *
 * @param request - validated request payload from the API route
 * @param contextBundle - optional additional context (travel DNA, existing itinerary, etc.)
 * @returns a fully typed Itinerary object
 */
export async function generateItinerary(
    request: GenerateItineraryRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<Itinerary> {
    // Validate request against Zod schema (defensive – API route should have already done this)
    const parsedReq = GenerateItineraryRequestSchema.parse(request);

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
        timeoutMs: 15000,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        // Parse JSON safely
        const itinerary = parseJSONResponse<Itinerary>(llmResponse.content);
        // Validate against the Itinerary Zod schema to guarantee structural integrity
        const finalItinerary = (await import("../../lib/ai/schemas")).ItinerarySchema.parse(itinerary);
        return finalItinerary;
    } catch (err) {
        // If any error occurs (LLM failure, JSON parse, schema validation), fall back to a minimal placeholder
        console.error("[Itinerary Service] LLM error – falling back to mock data", err);
        // Build a deterministic fallback using the request data (so callers still get something useful)
        const fallback: Itinerary = {
            tripId: `fallback_${Date.now()}`,
            destination: parsedReq.destination,
            startDate: parsedReq.startDate,
            endDate: parsedReq.endDate,
            totalDays: Math.max(
                1,
                Math.ceil(
                    (new Date(parsedReq.endDate).getTime() - new Date(parsedReq.startDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
            ),
            days: [],
            totalEstimatedCost: {
                amount: parsedReq.budget.total,
                currency: parsedReq.budget.currency,
                breakdown: {},
            },
            aiInsights: [
                "Fallback itinerary generated locally due to LLM service interruption.",
            ],
            pacingAnalysis: {
                overallScore: 5,
                warnings: [],
                suggestions: [],
            },
            generatedAt: new Date().toISOString(),
            modelVersion: "fallback-mock",
        };
        return fallback;
    }
}

/**
 * Simple health‑check utility – useful for monitoring the service.
 */
export function healthCheck(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
}
