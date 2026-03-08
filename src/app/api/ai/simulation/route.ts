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

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, SimulationRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:simulation`);
        const result = await simulateTrip(validation.data);
        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (err) {
        logError("[API] Simulation error", err);
        return formatErrorResponse(err);
    }
    });
}
