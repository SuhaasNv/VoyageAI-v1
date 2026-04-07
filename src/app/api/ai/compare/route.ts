/**
 * POST /api/ai/compare
 *
 * Generates two itineraries in parallel and returns a scored comparison.
 * No DB writes — purely ephemeral computation.
 *
 * Body: { destinationA, destinationB, startDate, endDate, budget, currency? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { compareTrips } from "@/lib/ai/compareTrips";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { sanitizeUserInput } from "@/security/safety";
import { compareCacheKey, getCompareCached, setCompareCached } from "@/lib/ai/cache";

const CompareSchema = z.object({
    destinationA: z.string().min(2).max(100),
    destinationB: z.string().min(2).max(100),
    startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    endDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    budget:       z.number().positive().max(1_000_000),
    currency:     z.string().length(3).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, CompareSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { destinationA, destinationB, ...rest } = validation.data;

        try {
            // Separate rate-limit bucket so compare doesn't eat the itinerary quota.
            await checkRateLimit(`ai:${auth.user.sub}:compare`);

            const cacheKey = compareCacheKey({
                destinationA,
                destinationB,
                startDate: rest.startDate,
                endDate: rest.endDate,
                budget: rest.budget,
                currency: rest.currency,
            });
            const cached = await getCompareCached(cacheKey);
            if (cached) {
                return NextResponse.json({ success: true, data: cached }, { status: 200 });
            }

            const result = await compareTrips(
                sanitizeUserInput(destinationA),
                sanitizeUserInput(destinationB),
                rest,
            );
            await setCompareCached(cacheKey, result);

            return NextResponse.json({ success: true, data: result }, { status: 200 });
        } catch (err) {
            logError("[API] Trip comparison error", err);
            return formatErrorResponse(err);
        }
    });
}
