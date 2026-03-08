/**
 * app/api/trips/[id]/route.ts
 *
 * GET    /api/trips/[id] — Return a single trip owned by the authenticated user.
 * PATCH /api/trips/[id] — Update trip destination/dates.
 * DELETE /api/trips/[id] — Delete trip and cascade (itineraries, chat).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";
import { serializeTrip, parseStoredItinerary, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";

const UpdateTripSchema = z.object({
    destination: z.string().min(2).max(200).trim().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    refreshImage: z.boolean().optional(),
})
    .refine(
        (d) =>
            d.destination !== undefined ||
            d.startDate !== undefined ||
            d.endDate !== undefined ||
            d.refreshImage === true,
        { message: "At least one field (destination, startDate, endDate, refreshImage) is required" }
    )
    .refine(
        (d) => !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
        { message: "endDate must be on or after startDate", path: ["endDate"] }
    );

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const { id } = await params;

        try {
            const [trip, itineraryRow] = await Promise.all([
                prisma.trip.findUnique({ where: { id } }),
                prisma.itinerary.findFirst({
                    where: { tripId: id },
                    orderBy: { createdAt: "desc" },
                }),
            ]);

            if (!trip) return errorResponse("NOT_FOUND", "Trip not found", 404);
            if (trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            const itinerary = itineraryRow ? parseStoredItinerary(itineraryRow) : [];
            const tripDto = serializeTrip(trip, itinerary);
            return successResponse<TripDTO & { rawItinerary: unknown }>({
                ...tripDto,
                rawItinerary: itineraryRow?.rawJson ?? null,
            });
        } catch (err) {
            logError(`[GET /api/trips/${id}] DB error`, err);
            return internalErrorResponse();
        }
    });
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const { id } = await params;
        const body = await validateBody(req, UpdateTripSchema);
        if (!body.ok) return body.response;

        try {
            const trip = await prisma.trip.findUnique({ where: { id } });
            if (!trip || trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            const data: { destination?: string; startDate?: Date; endDate?: Date; imageUrl?: string | null } = {};
            if (body.data.destination !== undefined) data.destination = body.data.destination;
            if (body.data.startDate !== undefined) data.startDate = new Date(body.data.startDate);
            if (body.data.endDate !== undefined) data.endDate = new Date(body.data.endDate);
            if (body.data.refreshImage === true) {
                try {
                    const imageUrl = await getDestinationImage(trip.destination);
                    data.imageUrl = imageUrl ?? null;
                } catch {
                    data.imageUrl = null;
                }
            }

            const updated = await prisma.trip.update({ where: { id }, data });
            const [itineraryRow] = await Promise.all([
                prisma.itinerary.findFirst({ where: { tripId: id }, orderBy: { createdAt: "desc" } }),
            ]);
            const itinerary = itineraryRow ? parseStoredItinerary(itineraryRow) : [];
            return successResponse<TripDTO>(serializeTrip(updated, itinerary));
        } catch (err) {
            logError(`[PATCH /api/trips/${id}] DB error`, err);
            return internalErrorResponse();
        }
    });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const { id } = await params;

        try {
            const trip = await prisma.trip.findUnique({ where: { id } });
            if (!trip || trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            await prisma.trip.delete({ where: { id } });
            return successResponse({ deleted: true });
        } catch (err) {
            logError(`[DELETE /api/trips/${id}] DB error`, err);
            return internalErrorResponse();
        }
    });
}
