/**
 * AI Service — Trip Reoptimization
 *
 * Generates a reoptimized itinerary based on user feedback, constraints, or external events.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse, AIServiceError } from "../../lib/ai/llm";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    ReoptimizeRequest,
    ReoptimizeResponse,
    ReoptimizeRequestSchema,
} from "../../lib/ai/schemas";
import { validateItineraryStructure, ItineraryValidationError } from "../../lib/ai/itineraryValidation";
import {
    reoptimizeCacheKey,
    getReoptimizeCached,
    setReoptimizeCached,
} from "../../lib/ai/cache";
import { logError } from "@/lib/logger";

/**
 * Reoptimizes a trip itinerary.
 */
export async function reoptimizeTrip(
    request: ReoptimizeRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<ReoptimizeResponse> {
    const parsedReq = ReoptimizeRequestSchema.parse(request);

    const cacheKey = reoptimizeCacheKey({
        tripId: parsedReq.tripId,
        currentItinerary: parsedReq.currentItinerary,
        reoptimizationReasons: parsedReq.reoptimizationReasons,
        remainingBudget: parsedReq.remainingBudget,
        lockedDays: parsedReq.lockedDays,
    });
    const cached = await getReoptimizeCached(cacheKey);
    if (cached) return cached as ReoptimizeResponse;

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

        try {
            validateItineraryStructure(final.reoptimizedItinerary, {
                maxBudget: parsedReq.remainingBudget,
                flexibility: "flexible",
            });
        } catch (validationErr) {
            if (validationErr instanceof ItineraryValidationError) {
                throw new AIServiceError(
                    "SCHEMA_VALIDATION_FAILED",
                    validationErr.message,
                    { code: validationErr.code }
                );
            }
            throw validationErr;
        }

        await setReoptimizeCached(cacheKey, final);
        return final;
    } catch (err) {
        if (err instanceof AIServiceError) throw err;
        logError("[Reoptimize Service] LLM error", err);
        throw err;
    }
}
