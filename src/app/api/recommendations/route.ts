/**
 * GET /api/recommendations
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
import { computeConfidence } from "@/lib/ai/confidence";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { formatAIResponse } from "@/lib/ai/explainability";
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
            const t0 = Date.now();
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

            // ── Trip suggestions + destination recommendations run concurrently ──

            // All trips needed for visited-country detection in destination scoring.
            const allTripsPromise = prisma.trip.findMany({
                where: { userId: auth.user.sub },
                select: { destination: true },
            });

            const tripSuggestionsPromise = Promise.all(
                trips.map(async (trip): Promise<TripSuggestion> => {
                    const cacheKey = suggestionsCacheKey(trip.id);
                    const cached = await getSuggestionsCached(cacheKey);
                    if (cached && Array.isArray((cached as { suggestions: unknown[] }).suggestions)) {
                        const raw = (cached as { suggestions: unknown[] }).suggestions as TripSuggestion["suggestions"];
                        return { tripId: trip.id, suggestions: rankSuggestions(raw, dnaData) };
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
                        return { tripId: trip.id, suggestions: output.suggestions };
                    } catch (err) {
                        logError(`[GET /api/recommendations] Failed for trip ${trip.id}`, err);
                        return { tripId: trip.id, suggestions: [] };
                    }
                })
            );

            const destinationsPromise = (async (): Promise<DestinationSuggestion[]> => {
                const destKey = destinationsCacheKey(auth.user.sub);
                const destCached = await getDestinationsCached(destKey);

                if (destCached) {
                    console.log("[REDIS] suggestions cache hit");
                    const age = Date.now() - destCached.cachedAt;
                    if (age > STALE_DESTINATIONS_MS) {
                        void (async () => {
                            const acquired = await acquireRefreshMutex(auth.user.sub);
                            if (!acquired) return;
                            try {
                                const allTrips = await allTripsPromise;
                                const fresh = await generateSuggestions(allTrips, dnaData, 5);
                                await setDestinationsCached(destKey, fresh);
                                console.log("[REDIS] suggestions cached (background refresh)");
                            } catch {
                                // Non-fatal — stale data already served
                            }
                        })();
                    }
                    return destCached.data as DestinationSuggestion[];
                }

                console.log("[REDIS] suggestions cache miss");
                try {
                    const allTrips = await allTripsPromise;
                    const destinations = await generateSuggestions(allTrips, dnaData, 5);
                    await setDestinationsCached(destKey, destinations);
                    console.log("[REDIS] suggestions cached");
                    return destinations;
                } catch (err) {
                    logError("[GET /api/recommendations] Destination suggestions failed", err);
                    return [];
                }
            })();

            const [tripSuggestions, destinations] = await Promise.all([
                tripSuggestionsPromise,
                destinationsPromise,
            ]);

            const totalSuggestions = tripSuggestions.reduce((s, t) => s + t.suggestions.length, 0);
            const durationMs = Date.now() - t0;

            return successResponse(
                formatAIResponse(
                    { tripSuggestions, destinations },
                    {
                        // Heuristic: LLM_GROUNDED when trip suggestions were generated
                        // (LLM + Travel DNA context), DETERMINISTIC when only the
                        // rule-based destination scorer ran (no LLM involved).
                        confidence: computeConfidence({
                            mode: tripSuggestions.length > 0 ? "LLM_GROUNDED" : "DETERMINISTIC",
                        }),
                        reasoning: `Generated ${totalSuggestions} trip suggestion(s) via LLM, ranked by Travel DNA preferences. ` +
                            `Produced ${destinations.length} destination recommendation(s) via deterministic DNA scoring ` +
                            `against a curated pool of ${destinations.length > 0 ? "global destinations" : "no visited matches"}.`,
                        sources: [
                            "Travel DNA preferences",
                            "Trip history",
                            "LLM (trip suggestions)",
                            "Curated destination pool",
                        ],
                        durationMs,
                    }
                )
            );
        } catch (err) {
            logError("[GET /api/recommendations] Error", err);
            return formatErrorResponse(err);
        }
    });
}
