/**
 * POST /api/trips/from-ticket
 *
 * Phase 2 of the flight-ticket wizard.
 * Accepts the structured data returned by /api/ai/extract-ticket plus
 * budget/style preferences chosen by the user, creates a Trip record,
 * and returns the serialised TripDTO.
 *
 * The caller (wizard) is responsible for subsequently calling
 * POST /api/ai/itinerary to generate the day-by-day plan.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";

const FromTicketSchema = z.object({
    destination:    z.string().min(2).max(200),
    departureCity:  z.string().min(2).max(200),
    departureDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    returnDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    airline:        z.string().max(100).optional(),
    flightNumber:   z.string().max(20).optional(),
    budget:         z.number().positive().optional(),
    currency:       z.string().length(3).optional(),
    style:          z.enum(["relaxed", "creative", "exciting", "luxury", "budget"]).optional(),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const validation = await validateBody(req, FromTicketSchema);
        if (!validation.ok) return validation.response;

        const { destination, departureDate, returnDate, budget, currency, style } = validation.data;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(destination);
            } catch {
                imageUrl = null;
            }

            const trip = await prisma.trip.create({
                data: {
                    userId:         auth.user.sub,
                    destination,
                    startDate:      new Date(departureDate),
                    endDate:        new Date(returnDate),
                    budgetTotal:    budget ?? 0,
                    budgetCurrency: currency ?? "USD",
                    style:          style ?? undefined,
                    imageUrl:       imageUrl ?? undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip, [], null), 201);
        } catch (err) {
            logError("[POST /api/trips/from-ticket]", err);
            return formatErrorResponse(err);
        }
    });
}
