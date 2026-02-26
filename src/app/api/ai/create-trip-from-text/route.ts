/**
 * POST /api/ai/create-trip-from-text
 *
 * Extracts trip details from natural language and creates a Trip.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { extractTripFromText } from "@/services/ai/create-trip-from-text.service";
import { CreateTripFromTextInputSchema } from "@/lib/ai/schemas";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const validation = await validateBody(req, CreateTripFromTextInputSchema);
        if (!validation.ok) return validation.response;

        const { text } = validation.data;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            const extracted = await extractTripFromText(text);

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(extracted.destination);
            } catch {
                imageUrl = null;
            }

            const trip = await prisma.trip.create({
                data: {
                    userId: auth.user.sub,
                    destination: extracted.destination,
                    startDate: new Date(extracted.startDate),
                    endDate: new Date(extracted.endDate),
                    budgetTotal: extracted.budget?.total ?? 0,
                    budgetCurrency: extracted.budget?.currency ?? "USD",
                    style: extracted.style ?? undefined,
                    imageUrl: imageUrl ?? undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip), 201);
        } catch (err) {
            logError("[POST /api/ai/create-trip-from-text] Error", err);
            return formatErrorResponse(err);
        }
    });
}
