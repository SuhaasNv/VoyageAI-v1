/**
 * app/api/ai/simulation/route.ts
 *
 * POST /api/ai/simulation
 *
 * Runs a scenario simulation against a trip itinerary.
 * Request body is validated against SimulationRequestSchema before the service
 * layer is invoked; invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";

import { simulateTrip } from "@/tools/simulationTool";
import { SimulationRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { simulationCacheKey, getSimulationCached, setSimulationCached } from "@/lib/ai/cache";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";
import { validateLLMOutput } from "@/security/safety";

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, SimulationRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:simulation`);

        const { tripId, itinerary, scenarios, simulationDepth } = validation.data;
        const cacheKey = simulationCacheKey({ tripId, itinerary, scenarios, simulationDepth });

        const withMeta = (data: object) => formatAIResponse(data, {
            confidence: computeConfidence({ mode: "LLM_ONLY" }),
            reasoning:  `Scenario simulation run against ${scenarios.length} scenario(s) at depth "${simulationDepth}" via LLM reasoning.`,
            sources:    ["Trip itinerary", "User-defined scenarios", "LLM knowledge base (unverified)"],
        });

        const cached = await getSimulationCached(cacheKey);
        if (cached) {
            return NextResponse.json({ success: true, data: withMeta(cached as object) }, { status: 200 });
        }

        const result = await simulateTrip(validation.data);
        validateLLMOutput(JSON.stringify(result), "json");
        await setSimulationCached(cacheKey, result);
        return NextResponse.json({ success: true, data: withMeta(result as object) }, { status: 200 });
    } catch (err) {
        logError("[API] Simulation error", err);
        return formatErrorResponse(err);
    }
    });
}
