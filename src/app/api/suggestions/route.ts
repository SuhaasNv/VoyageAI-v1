/**
 * GET /api/suggestions
 *
 * Returns contextual suggestions for each upcoming trip.
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

            const now = new Date();
            const trips = await prisma.trip.findMany({
                where: {
                    userId: auth.user.sub,
                    endDate: { gte: now },
                },
                orderBy: { startDate: "asc" },
            });

            const results: TripSuggestion[] = [];

            for (const trip of trips) {
                const cacheKey = suggestionsCacheKey(trip.id);
                const cached = await getSuggestionsCached(cacheKey);
                if (cached && Array.isArray((cached as { suggestions: unknown[] }).suggestions)) {
                    results.push({
                        tripId: trip.id,
                        suggestions: (cached as { suggestions: unknown[] }).suggestions as TripSuggestion["suggestions"],
                    });
                    continue;
                }

                try {
                    const output = await generateSuggestionsForTrip({
                        tripId: trip.id,
                        destination: trip.destination,
                        style: trip.style,
                        budgetTotal: trip.budgetTotal,
                        budgetCurrency: trip.budgetCurrency,
                    });
                    await setSuggestionsCached(cacheKey, output);
                    results.push({ tripId: trip.id, suggestions: output.suggestions });
                } catch (err) {
                    logError(`[GET /api/suggestions] Failed for trip ${trip.id}`, err);
                    results.push({ tripId: trip.id, suggestions: [] });
                }
            }

            return successResponse<TripSuggestion[]>(results);
        } catch (err) {
            logError("[GET /api/suggestions] Error", err);
            return formatErrorResponse(err);
        }
    });
}
