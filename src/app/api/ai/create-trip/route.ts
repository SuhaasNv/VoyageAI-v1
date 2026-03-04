import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { extractTripFromText } from "@/services/ai/create-trip-from-text.service";
import { getTravelPreferenceContext } from "@/lib/ai/contextStore";

const CreateTripAISchema = z.object({
    text: z.string().min(5).max(1000)
});

function defaultTripDates(): { startDate: string; endDate: string } {
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { startDate: fmt(start), endDate: fmt(end) };
}

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, CreateTripAISchema);
        if (!body.ok) return body.response;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);

            const extracted = await extractTripFromText(body.data.text, dnaContext ?? undefined);

            const defaults = defaultTripDates();
            const startDate = extracted.startDate ?? defaults.startDate;
            const endDate   = extracted.endDate   ?? defaults.endDate;

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(extracted.destination);
            } catch {
                imageUrl = null;
            }

            const trip = await prisma.trip.create({
                data: {
                    userId:      auth.user.sub,
                    destination: extracted.destination,
                    startDate:   new Date(startDate),
                    endDate:     new Date(endDate),
                    budgetTotal: extracted.budget?.total ?? 0,
                    style:       extracted.style ?? undefined,
                    imageUrl:    imageUrl ?? undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip), 201);
        } catch (err) {
            logError("[POST /api/ai/create-trip] logic error", err);
            return formatErrorResponse(err);
        }
    });
}
