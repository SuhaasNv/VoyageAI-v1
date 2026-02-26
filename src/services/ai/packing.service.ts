/**
 * AI Service — Packing List Generator
 *
 * Generates a detailed packing list based on destination, climate, activities,
 * and the traveler's DNA profile. Returns a structured JSON payload.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    PackingListRequest,
    PackingListResponse,
    PackingListRequestSchema,
} from "../../lib/ai/schemas";

/**
 * Generates a packing list.
 */
export async function generatePackingList(
    request: PackingListRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<PackingListResponse> {
    const parsedReq = PackingListRequestSchema.parse(request);

    const system = SYSTEM_PROMPTS.PACKING_ASSISTANT;
    const systemPrompt =
        system ??
        `You are VoyageAI's expert packing advisor. Provide concise, prioritized packing recommendations.`;

    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.PACKING;
    const task = `
## Task
Create a categorized packing list for a trip to **${parsedReq.destination}** from **${parsedReq.startDate}** to **${parsedReq.endDate}**.
- Consider the climate (${parsedReq.climate}) and listed activities.
- Incorporate any Travel DNA preferences.
- Return ONLY the JSON object matching the PackingListResponse schema.
`;

    const fullPrompt = buildFullPrompt({ system: systemPrompt, context, schema, task });

    const client = getLLMClient();
    const llmOptions = {
        temperature: 0.7,
        responseFormat: "json" as const,
        maxTokens: 4096,
        timeoutMs: 15000,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        const response = parseJSONResponse<PackingListResponse>(llmResponse.content);
        const final = (await import("../../lib/ai/schemas")).PackingListResponseSchema.parse(response);
        return final;
    } catch (err) {
        console.error("[Packing Service] LLM error – fallback", err);
        // Simple fallback: empty list with a tip
        return {
            tripId: parsedReq.tripId ?? undefined,
            destination: parsedReq.destination,
            totalItems: 0,
            essentialItems: 0,
            items: {
                clothing: [],
                toiletries: [],
                electronics: [],
                documents: [],
                medication: [],
                gear: [],
                entertainment: [],
                food: [],
                safety: [],
                miscellaneous: [],
            },
            aiTips: ["Fallback: unable to generate packing list at this time."],
            estimatedTotalWeightKg: 0,
            generatedAt: new Date().toISOString(),
            modelVersion: "fallback-mock",
        };
    }
}
