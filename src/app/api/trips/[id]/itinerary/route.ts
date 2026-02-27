import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { ItinerarySchema } from "@/lib/ai/schemas";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const { id } = await params;
        const validation = await validateBody(req, ItinerarySchema);
        if (!validation.ok) return validation.response;

        const updatedItinerary = validation.data;

        try {
            const trip = await prisma.trip.findUnique({ where: { id } });
            if (!trip || trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            await prisma.$transaction([
                prisma.itinerary.deleteMany({ where: { tripId: id } }),
                prisma.itinerary.create({
                    data: {
                        tripId: id,
                        rawJson: updatedItinerary as any,
                    },
                }),
                prisma.trip.update({
                    where: { id },
                    data: {
                        budgetTotal: updatedItinerary.totalEstimatedCost.amount,
                        budgetCurrency: updatedItinerary.totalEstimatedCost.currency,
                    },
                }),
            ]);

            return successResponse({ success: true });
        } catch (err) {
            console.error("[itinerary] Update failed:", err);
            return errorResponse("INTERNAL_ERROR", "Failed to update itinerary", 500);
        }
    });
}
