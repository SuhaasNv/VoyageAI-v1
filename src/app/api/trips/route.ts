/**
 * app/api/trips/route.ts
 *
 * POST /api/trips  — Create a new trip for the authenticated user.
 * GET  /api/trips  — Return all trips for the authenticated user.
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
import { logError } from "@/lib/logger";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import {
    getDestinationImage,
    getDestinationImageCachedOnly,
} from "@/lib/services/image.service";

const TripStyleEnum = z.enum(["relaxed", "creative", "exciting", "luxury", "budget"]);

const CreateTripSchema = z
    .object({
        destination: z
            .string()
            .min(2, "Destination must be at least 2 characters")
            .max(200, "Destination too long")
            .trim(),
        startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
        endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
        style: TripStyleEnum.optional(),
        budgetTotal: z.number().nonnegative().optional(),
    })
    .refine(
        (d) => new Date(d.endDate) >= new Date(d.startDate),
        { message: "endDate must be on or after startDate", path: ["endDate"] }
    );

// ─── POST /api/trips ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, CreateTripSchema);
        if (!body.ok) return body.response;

        const { destination, startDate, endDate, style, budgetTotal } = body.data;

        let imageUrl: string | null = null;
        try {
            imageUrl = await getDestinationImage(destination);
        } catch {
            imageUrl = null;
        }

        try {
            const trip = await prisma.trip.create({
                data: {
                    userId: auth.user.sub,
                    destination,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    style: style ?? undefined,
                    budgetTotal: budgetTotal ?? 0,
                    imageUrl: imageUrl ?? undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip), 201);
        } catch (err) {
            logError("[POST /api/trips] DB error", err);
            return internalErrorResponse();
        }
    });
}

// ─── GET /api/trips ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const timings: { name: string; dur: number }[] = [];
        const t0 = performance.now();

        try {
            const dbStart = performance.now();
            const trips = await prisma.trip.findMany({
                where: { userId: auth.user.sub },
                include: { itineraries: { orderBy: { createdAt: "desc" }, take: 1 } },
                orderBy: { startDate: "asc" },
            });
            timings.push({ name: "db", dur: Math.round(performance.now() - dbStart) });

            const needsImage = trips.filter((t) => !t.imageUrl);
            const uniqueDestinations = [...new Set(needsImage.map((t) => t.destination))];

            // Fast path: cache-only lookup (Redis only, no Pexels). Target: warm < 500ms.
            const cacheStart = performance.now();
            const cacheResults = await Promise.all(
                uniqueDestinations.map((dest) => getDestinationImageCachedOnly(dest))
            );
            timings.push({ name: "cache", dur: Math.round(performance.now() - cacheStart) });
            const destToImage = new Map<string, string | null>();
            const cacheMissDestinations: string[] = [];
            uniqueDestinations.forEach((dest, i) => {
                const res = cacheResults[i];
                if (res.type === "hit") {
                    destToImage.set(dest, res.url);
                } else {
                    cacheMissDestinations.push(dest);
                }
            });

            // Background revalidation: fire-and-forget for cache misses. Next request gets images.
            if (cacheMissDestinations.length > 0) {
                const tripsNeedingImage = needsImage.filter((t) =>
                    cacheMissDestinations.includes(t.destination)
                );
                const destToTrips = new Map<string, { id: string }[]>();
                for (const t of tripsNeedingImage) {
                    const list = destToTrips.get(t.destination) ?? [];
                    list.push({ id: t.id });
                    destToTrips.set(t.destination, list);
                }
                const requestImageCache = new Map<string, Promise<string | null>>();
                for (const dest of cacheMissDestinations) {
                    getDestinationImage(dest, requestImageCache)
                        .then((url) => {
                            const tripIds = destToTrips.get(dest) ?? [];
                            return Promise.all(
                                tripIds.map(({ id }) =>
                                    prisma.trip.update({
                                        where: { id },
                                        data: { imageUrl: url },
                                    })
                                )
                            );
                        })
                        .catch(() => {
                            // Non-fatal; next request will retry
                        });
                }
            }

            const dtos: TripDTO[] = trips.map((trip) => {
                const imageUrl =
                    trip.imageUrl ?? destToImage.get(trip.destination) ?? null;
                const rawJson = trip.itineraries[0]?.rawJson;
                return serializeTrip({ ...trip, imageUrl }, [], rawJson);
            });

            timings.push({ name: "total", dur: Math.round(performance.now() - t0) });
            const serverTiming = timings.map((t) => `${t.name};dur=${t.dur}`).join(", ");

            return successResponse<TripDTO[]>(dtos, 200, {
                "Server-Timing": serverTiming,
            });
        } catch (err) {
            logError("[GET /api/trips] DB error", err);
            return internalErrorResponse();
        }
    });
}
