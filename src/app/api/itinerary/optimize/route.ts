/**
 * POST /api/itinerary/optimize
 *
 * Pure compute endpoint — reorders activities within each day using the
 * nearest-neighbor heuristic. No LLM, no external API, no DB writes.
 *
 * The client receives the optimized itinerary and distance metrics, then
 * decides whether to save via POST /api/trips/[id]/itinerary.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ItinerarySchema } from "@/lib/ai/schemas";
import { optimizeItineraryRoutes } from "@/lib/geo/routeOptimizer";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";

const OptimizeRequestSchema = z.object({
    itinerary: ItinerarySchema,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const validation = await validateBody(req, OptimizeRequestSchema);
        if (!validation.ok) return validation.response;

        try {
            await checkRateLimit(`itinerary:optimize:${auth.user.sub}`);

            const result = optimizeItineraryRoutes(validation.data.itinerary);

            return NextResponse.json(
                {
                    success: true,
                    data: {
                        optimizedItinerary: result.itinerary,
                        originalDistanceKm: parseFloat(result.originalDistanceKm.toFixed(2)),
                        optimizedDistanceKm: parseFloat(result.optimizedDistanceKm.toFixed(2)),
                        totalDistanceSavedKm: parseFloat(result.totalDistanceSavedKm.toFixed(2)),
                    },
                },
                { status: 200 }
            );
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
