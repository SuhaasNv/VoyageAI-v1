/**
 * app/api/ai/itinerary/route.ts
 *
 * POST /api/ai/itinerary
 *
 * Generates a full day-by-day itinerary using the AI service layer,
 * then persists the raw JSON into the Itinerary table (upsert).
 * If the trip already has an itinerary row it is replaced.
 *
 * Request body: GenerateItineraryRequestSchema fields + required `tripId`.
 * Invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateItinerary } from "@/services/ai/itinerary.service";
import { GenerateItineraryRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse, errorResponse } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { getTravelPreferenceContext } from "@/lib/ai/contextStore";

// Extend the base schema to require a tripId for persistence.
const ItineraryRouteSchema = GenerateItineraryRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, ItineraryRouteSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { tripId, ...aiPayload } = validation.data;

        // Verify the trip exists and belongs to the authenticated user.
        const trip = await prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            return errorResponse("NOT_FOUND", "Trip not found", 404);
        }
        if (trip.userId !== auth.user.sub) {
            return errorResponse("NOT_FOUND", "Trip not found", 404);
        }

        try {
            await checkRateLimit(`ai:${auth.user.sub}:itinerary`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);
            const result = await generateItinerary({ ...aiPayload, tripId }, dnaContext || undefined);

            // ── Persist: replace itinerary and update trip budget in one transaction ──
            await prisma.$transaction([
                prisma.itinerary.deleteMany({ where: { tripId } }),
                prisma.itinerary.create({
                    data: {
                        tripId,
                        rawJson: result as object,
                    },
                }),
                prisma.trip.update({
                    where: { id: tripId },
                    data: {
                        budgetTotal: result.totalEstimatedCost.amount,
                        budgetCurrency: result.totalEstimatedCost.currency,
                    },
                }),
            ]);

            return NextResponse.json({ success: true, data: result }, { status: 200 });
        } catch (err) {
            logError("[API] Itinerary generation error", err);
            return formatErrorResponse(err);
        }
    });
}
