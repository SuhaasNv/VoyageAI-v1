/**
 * AI Service — Trip Reoptimization
 *
 * Applies a structured diff edit to an existing itinerary driven by a user's
 * modificationInstruction. The LLM is instructed to change only what is
 * necessary, preserving structure, dates, coordinates and schema fidelity.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse, AIServiceError } from "../lib/ai/llm";
import { selectModelConfig } from "../lib/ai/modelRouter";
import { buildFullPrompt } from "../lib/ai/prompts/index";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../lib/ai/prompts/index";
import { assembleContext } from "../lib/ai/context";
import {
    ReoptimizeRequest,
    ReoptimizeResponse,
    ReoptimizeRequestSchema,
    ReoptimizeResponseSchema,
} from "../lib/ai/schemas/index";
import { validateItineraryStructure, ItineraryValidationError } from "../lib/ai/itineraryValidation";
import {
    reoptimizeCacheKey,
    getReoptimizeCached,
    setReoptimizeCached,
} from "../lib/ai/cache";
import { logError } from "@/infrastructure/logger";

/**
 * Reoptimizes a trip itinerary via structured diff editing.
 *
 * The LLM receives the full current itinerary plus a free-text
 * modificationInstruction and returns a modified itinerary that changes only
 * what is necessary to satisfy the instruction.
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

    const lockedDaysStr =
        parsedReq.lockedDays.length > 0
            ? `Days ${parsedReq.lockedDays.join(", ")} are locked and must be returned unchanged.`
            : "No days are locked.";

    const budgetInstruction = /increase budget|upgrade/i.test(parsedReq.modificationInstruction)
        ? `Budget may be increased beyond ${parsedReq.remainingBudget} to fulfil the upgrade request.`
        : `Keep totalEstimatedCost.amount ≤ ${parsedReq.remainingBudget}. Do not exceed this budget.`;

    const task = `
## Modification Task

User instruction: "${parsedReq.modificationInstruction}"

${parsedReq.userFeedback ? `Additional feedback: "${parsedReq.userFeedback}"\n` : ""}
Budget rule: ${budgetInstruction}
${lockedDaysStr}

Current itinerary to diff-edit (apply only the minimal changes needed):
${JSON.stringify(parsedReq.currentItinerary)}

Constraints:
- Preserve the exact same number of days (${parsedReq.currentItinerary.totalDays}).
- Preserve all date values, tripId, destination, startDate, endDate, modelVersion.
- Copy all unaffected days verbatim (same ids, times, locations, costs).
- For changed activities keep existing location.lat/lng unless the activity is replaced.
- Recalculate each affected day's totalCost.amount as the sum of its activities' estimatedCost.amount.
- Recalculate totalEstimatedCost.amount as the sum of all days' totalCost.amount.
- In summaryOfChanges write 2–5 bullet points (each line: "• <what changed>") so the
  traveller immediately understands the edit.
`;

    const fullPrompt = buildFullPrompt({ system, context, schema, task });

    const client = getLLMClient();
    const llmOptions = {
        ...selectModelConfig({ endpoint: "reoptimize" }),
        responseFormat: "json" as const,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(
            client,
            [{ role: "user", content: fullPrompt }],
            llmOptions
        );
        const parsed = parseJSONResponse<ReoptimizeResponse>(llmResponse.content);
        const final = ReoptimizeResponseSchema.parse(parsed);

        // Validate the reoptimized itinerary structure.
        try {
            validateItineraryStructure(final.reoptimizedItinerary, {
                maxBudget: /increase budget|upgrade/i.test(parsedReq.modificationInstruction)
                    ? Infinity
                    : parsedReq.remainingBudget * 1.05,
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

        // Recalculate totalEstimatedCost from day costs to ensure accuracy.
        const currency =
            final.reoptimizedItinerary.days[0]?.totalCost.currency ??
            final.reoptimizedItinerary.totalEstimatedCost.currency;
        const recalcAmount = final.reoptimizedItinerary.days.reduce(
            (sum, d) => sum + d.totalCost.amount,
            0
        );
        const withRecalc: ReoptimizeResponse = {
            ...final,
            reoptimizedItinerary: {
                ...final.reoptimizedItinerary,
                totalEstimatedCost: {
                    ...final.reoptimizedItinerary.totalEstimatedCost,
                    amount: recalcAmount,
                    currency,
                },
            },
            budgetDelta: recalcAmount - final.originalItinerary.totalEstimatedCost.amount,
        };

        await setReoptimizeCached(cacheKey, withRecalc);
        return withRecalc;
    } catch (err) {
        if (err instanceof AIServiceError) throw err;
        logError("[Reoptimize Service] LLM error", err);
        throw err;
    }
}
