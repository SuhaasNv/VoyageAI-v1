/**
 * AI Service — Trip Reoptimization
 *
 * Generates a reoptimized itinerary based on user feedback, constraints, or external events.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    ReoptimizeRequest,
    ReoptimizeResponse,
    ReoptimizeRequestSchema,
} from "../../lib/ai/schemas";

/**
 * Reoptimizes a trip itinerary.
 */
export async function reoptimizeTrip(
    request: ReoptimizeRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<ReoptimizeResponse> {
    const parsedReq = ReoptimizeRequestSchema.parse(request);

    const system = SYSTEM_PROMPTS.REOPTIMIZER;
    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.REOPTIMIZE;
    const task = `
## Task
Given the current itinerary (ID: ${parsedReq.tripId}) and the following reoptimization reasons: ${parsedReq.reoptimizationReasons.join(", ")}, generate a new itinerary that respects any locked days and stays within the remaining budget of ${parsedReq.remainingBudget}.
- Preserve activities on locked days.
- Provide a concise changesSummary.
- Return ONLY the JSON object matching the schema.
`;

    const fullPrompt = buildFullPrompt({ system, context, schema, task });

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
        const response = parseJSONResponse<ReoptimizeResponse>(llmResponse.content);
        const final = (await import("../../lib/ai/schemas")).ReoptimizeResponseSchema.parse(response);
        return final;
    } catch (err) {
        console.error("[Reoptimize Service] LLM error – fallback", err);
        // Simple fallback: return original itinerary unchanged with empty changes
        return {
            tripId: parsedReq.tripId,
            originalItinerary: parsedReq.currentItinerary,
            reoptimizedItinerary: parsedReq.currentItinerary,
            changesSummary: [],
            budgetDelta: 0,
            aiReasoning: "Fallback: no changes applied due to LLM failure.",
            reoptimizedAt: new Date().toISOString(),
        };
    }
}
