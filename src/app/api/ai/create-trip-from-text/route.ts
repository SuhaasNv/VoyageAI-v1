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
import { logError } from "@/infrastructure/logger";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { extractTripFromText } from "@/services/ai/create-trip-from-text.service";
import { CreateTripFromTextInputSchema } from "@/lib/ai/schemas";
import { getTravelPreferenceContext } from "@/memory/contextStore";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const validation = await validateBody(req, CreateTripFromTextInputSchema);
        if (!validation.ok) return validation.response;

        const { text } = validation.data;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);
            const extracted = await extractTripFromText(text, dnaContext || undefined);

            const defaultStart = new Date();
            defaultStart.setDate(defaultStart.getDate() + 30);
            const defaultEnd = new Date(defaultStart);
            defaultEnd.setDate(defaultEnd.getDate() + 7);
            const startDate = extracted.startDate ?? defaultStart.toISOString().slice(0, 10);
            const endDate   = extracted.endDate   ?? defaultEnd.toISOString().slice(0, 10);

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
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
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
