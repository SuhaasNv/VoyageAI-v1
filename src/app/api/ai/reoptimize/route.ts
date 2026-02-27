/**
 * app/api/ai/reoptimize/route.ts
 *
 * POST /api/ai/reoptimize
 *
 * Reoptimizes an existing itinerary based on real-time constraints.
 * Enforces trip ownership before processing.
 * Persists the reoptimized itinerary and updates the trip budget atomically.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reoptimizeTrip } from "@/services/ai/reoptimize.service";
import { ReoptimizeRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse, errorResponse } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { getTravelPreferenceContext } from "@/lib/ai/contextStore";

// Extend schema to require tripId at the route level for ownership check + persistence.
const ReoptimizeRouteSchema = ReoptimizeRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, ReoptimizeRouteSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { tripId } = validation.data;

        // ── Ownership check ────────────────────────────────────────────────────
        const trip = await prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) return errorResponse("NOT_FOUND", "Trip not found", 404);
        if (trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

        try {
            await checkRateLimit(`ai:${auth.user.sub}:reoptimize`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);
            const result = await reoptimizeTrip(validation.data, dnaContext || undefined);

            // ── Persist reoptimized itinerary + update budget ──────────────────
            const reoptimized = result.reoptimizedItinerary;
            await prisma.$transaction([
                prisma.itinerary.deleteMany({ where: { tripId } }),
                prisma.itinerary.create({
                    data: {
                        tripId,
                        rawJson: reoptimized as object,
                    },
                }),
                prisma.trip.update({
                    where: { id: tripId },
                    data: {
                        budgetTotal: reoptimized.totalEstimatedCost.amount,
                        budgetCurrency: reoptimized.totalEstimatedCost.currency,
                    },
                }),
            ]);

            return NextResponse.json({ success: true, data: result }, { status: 200 });
        } catch (err) {
            logError("[API] Reoptimize error", err);
            return formatErrorResponse(err);
        }
    });
}
