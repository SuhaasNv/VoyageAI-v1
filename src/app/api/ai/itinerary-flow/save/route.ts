import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { prisma } from "@/lib/prisma";
import { safeTripContextToItinerary } from "@/lib/services/trips";
import type { SafeTripContext } from "@/agents/safety/safetyAgent";

const Schema = z.object({
    tripId: z.string(),
    safetyResult: z.object({
        destination: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        durationDays: z.number(),
        days: z.array(z.any()),
        selectedHotel: z.any().optional(),
        budget: z.object({
            totalEstimatedCost: z.number(),
            costPerDay: z.array(z.number()).optional(),
            isOverBudget: z.boolean(),
        }),
        safety: z.object({
            riskLevel: z.enum(["low", "medium", "high"]),
            warnings: z.array(z.object({
                type:     z.enum(["fatigue", "travel", "schedule", "meal"]),
                day:      z.number(),
                severity: z.enum(["medium", "high"]),
                message:  z.string(),
            })),
            tips: z.array(z.string()),
        }),
    }),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "save", flowSessionId } });

        try {
            // Verify the trip belongs to the authenticated user
            const trip = await prisma.trip.findFirst({
                where: { id: body.data.tripId, userId: auth.user.sub },
            });
            if (!trip) {
                return formatErrorResponse(
                    new Error("Trip not found or access denied")
                );
            }

            // Transform SafeTripContext → ItinerarySchema format before persisting.
            // This ensures TripViewPage / TripMap can always parse rawJson correctly.
            const itineraryData = safeTripContextToItinerary(
                body.data.tripId,
                body.data.safetyResult as unknown as SafeTripContext,
            );

            const itinerary = await prisma.itinerary.create({
                data: {
                    tripId: body.data.tripId,
                    rawJson: itineraryData as object,
                },
            });

            // Update the trip's budget total
            await prisma.trip.update({
                where: { id: body.data.tripId },
                data: {
                    budgetTotal: body.data.safetyResult.budget.totalEstimatedCost,
                },
            });

            return successResponse({ tripId: body.data.tripId, itineraryId: itinerary.id });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
