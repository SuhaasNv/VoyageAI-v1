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
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import {
    suggestionsCacheKey,
    getSuggestionsCached,
    setSuggestionsCached,
} from "@/lib/ai/cache";
import { generateSuggestionsForTrip } from "@/services/ai/dashboard-suggestions.service";
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

            // Fetch Travel DNA once — used for both trip-level ranking and destination scoring.
            const preference = await prisma.travelPreference.findUnique({
                where: { userId: auth.user.sub },
                select: { data: true },
            });
            const dnaData = (preference?.data ?? null) as Record<string, unknown> | null;

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
            try {
                destinations = await generateSuggestions(allTrips, dnaData, 5);
            } catch (err) {
                logError("[GET /api/suggestions] Destination suggestions failed", err);
            }

            return successResponse({ tripSuggestions, destinations });
        } catch (err) {
            logError("[GET /api/suggestions] Error", err);
            return formatErrorResponse(err);
        }
    });
}
