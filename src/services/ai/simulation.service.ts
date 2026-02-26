/**
 * AI Service — Trip Simulation
 *
 * Simulates potential disruptions and risk scenarios for a given itinerary.
 * Returns a structured JSON payload with risk scores, outcomes, and recommendations.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    SimulationRequest,
    SimulationResponse,
    SimulationRequestSchema,
} from "../../lib/ai/schemas";

/**
 * Runs a risk simulation for a trip.
 */
export async function simulateTrip(
    request: SimulationRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<SimulationResponse> {
    const parsedReq = SimulationRequestSchema.parse(request);

    const system = SYSTEM_PROMPTS.TRIP_SIMULATOR;
    const systemPrompt =
        system ??
        `You are VoyageAI's trip risk analyst. Simulate realistic disruption scenarios and provide actionable contingency plans.`;

    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.SIMULATION;
    const task = `
## Task
Given the itinerary for **${parsedReq.itinerary.destination}** (${parsedReq.itinerary.startDate} – ${parsedReq.itinerary.endDate}), simulate the listed scenarios (${parsedReq.scenarios.join(", ")}).
- Use the provided Travel DNA profile if available.
- Return ONLY a JSON object matching the SimulationResponse schema.
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
        const response = parseJSONResponse<SimulationResponse>(llmResponse.content);
        const final = (await import("../../lib/ai/schemas")).SimulationResponseSchema.parse(response);
        return final;
    } catch (err) {
        console.error("[Simulation Service] LLM error – fallback", err);
        // Minimal fallback: low risk, no outcomes
        return {
            tripId: parsedReq.tripId ?? undefined,
            destination: parsedReq.itinerary.destination,
            overallRiskScore: 1,
            riskLevel: "low",
            outcomes: [],
            topRecommendations: ["Fallback: unable to run simulation at this time."],
            insuranceRecommendation: "Consider basic travel insurance.",
            flexibilityScore: 9,
            simulatedAt: new Date().toISOString(),
            modelVersion: "fallback-mock",
        };
    }
}
