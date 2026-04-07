/**
 * GET /api/suggestions
 *
 * Returns:
 *   tripSuggestions — per-trip AI suggestions (existing behaviour)
 *   destinations    — curated destination recommendations scored against
 *                     the user's Travel DNA and trip history (new)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import {
    suggestionsCacheKey,
    getSuggestionsCached,
    setSuggestionsCached,
    destinationsCacheKey,
    getDestinationsCached,
    setDestinationsCached,
    STALE_DESTINATIONS_MS,
    acquireRefreshMutex,
    travelDNACacheKey,
    getTravelDNACached,
    setTravelDNACached,
} from "@/lib/ai/cache";
import { generateSuggestionsForTrip } from "@/tools/suggestionTool";
import { rankSuggestions } from "@/lib/ai/travelDNARules";
import { generateSuggestions, type DestinationSuggestion } from "@/lib/ai/destinationSuggestions";

interface TripSuggestion {
    tripId: string;
    suggestions: { title: string; description: string; action?: string; tag?: string }[];
}

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        try {
            await checkRateLimit(`ai:${auth.user.sub}:suggestions`);

            // Fetch Travel DNA — Redis-cached to avoid DB round-trip on every AI call.
            const dnaKey = travelDNACacheKey(auth.user.sub);
            let dnaData = await getTravelDNACached(dnaKey);
            if (dnaData === null) {
                const preference = await prisma.travelPreference.findUnique({
                    where: { userId: auth.user.sub },
                    select: { data: true },
                });
                dnaData = (preference?.data ?? null) as Record<string, unknown> | null;
                if (dnaData !== null) await setTravelDNACached(dnaKey, dnaData);
            }

            const now = new Date();
            const trips = await prisma.trip.findMany({
                where: {
                    userId: auth.user.sub,
                    endDate: { gte: now },
                },
                orderBy: { startDate: "asc" },
            });

            // ── Trip-level AI suggestions ─────────────────────────────────────
            const tripSuggestions: TripSuggestion[] = [];

            for (const trip of trips) {
                const cacheKey = suggestionsCacheKey(trip.id);
                const cached = await getSuggestionsCached(cacheKey);
                if (cached && Array.isArray((cached as { suggestions: unknown[] }).suggestions)) {
                    const raw = (cached as { suggestions: unknown[] }).suggestions as TripSuggestion["suggestions"];
                    tripSuggestions.push({
                        tripId: trip.id,
                        suggestions: rankSuggestions(raw, dnaData),
                    });
                    continue;
                }

                try {
                    const output = await generateSuggestionsForTrip(
                        {
                            tripId: trip.id,
                            destination: trip.destination,
                            style: trip.style,
                            budgetTotal: trip.budgetTotal,
                            budgetCurrency: trip.budgetCurrency,
                        },
                        dnaData
                    );
                    await setSuggestionsCached(cacheKey, output);
                    tripSuggestions.push({ tripId: trip.id, suggestions: output.suggestions });
                } catch (err) {
                    logError(`[GET /api/suggestions] Failed for trip ${trip.id}`, err);
                    tripSuggestions.push({ tripId: trip.id, suggestions: [] });
                }
            }

            // ── Destination recommendations ────────────────────────────────────
            // Pass all user trips (past + upcoming) for visited-country detection.
            const allTrips = await prisma.trip.findMany({
                where: { userId: auth.user.sub },
                select: { destination: true },
            });

            let destinations: DestinationSuggestion[] = [];
            const destKey = destinationsCacheKey(auth.user.sub);
            const destCached = await getDestinationsCached(destKey);

            if (destCached) {
                console.log("[REDIS] suggestions cache hit");
                destinations = destCached.data as DestinationSuggestion[];

                // Stale-while-revalidate: refresh silently if older than 5h.
                // Mutex prevents concurrent requests from all firing a refresh.
                const age = Date.now() - destCached.cachedAt;
                if (age > STALE_DESTINATIONS_MS) {
                    void (async () => {
                        const acquired = await acquireRefreshMutex(auth.user.sub);
                        if (!acquired) return; // Another request is already refreshing
                        try {
                            const fresh = await generateSuggestions(allTrips, dnaData, 5);
                            await setDestinationsCached(destKey, fresh);
                            console.log("[REDIS] suggestions cached (background refresh)");
                        } catch {
                            // Non-fatal — stale data already served
                        }
                    })();
                }
            } else {
                console.log("[REDIS] suggestions cache miss");
                try {
                    destinations = await generateSuggestions(allTrips, dnaData, 5);
                    await setDestinationsCached(destKey, destinations);
                    console.log("[REDIS] suggestions cached");
                } catch (err) {
                    logError("[GET /api/suggestions] Destination suggestions failed", err);
                }
            }

            return successResponse({ tripSuggestions, destinations });
        } catch (err) {
            logError("[GET /api/suggestions] Error", err);
            return formatErrorResponse(err);
        }
    });
}
