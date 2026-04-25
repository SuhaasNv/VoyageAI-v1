/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠  LEGACY PATH (NOT USED IN DEMO)                                      ║
 * ║                                                                          ║
 * ║  POST /api/ai/itinerary                                                  ║
 * ║                                                                          ║
 * ║  This is the original one-shot itinerary generator. It bypasses the     ║
 * ║  staged multi-agent pipeline (itinerary-flow) and calls a single tool   ║
 * ║  (generateItinerary) with no intermediate state or agent handoff.       ║
 * ║                                                                          ║
 * ║  PRODUCTION PATH: /api/ai/itinerary-flow/* (staged pipeline)            ║
 * ║                                                                          ║
 * ║  DO NOT add new callers. Retained for backward-compatibility only.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Request body: GenerateItineraryRequestSchema fields + required `tripId`.
 * Invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateItinerary } from "@/tools/itineraryTool";
import { GenerateItineraryRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { unauthorizedResponse, errorResponse } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { getTravelPreferenceContext } from "@/memory/contextStore";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";

// Extend the base schema to require a tripId for persistence.
const ItineraryRouteSchema = GenerateItineraryRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, ItineraryRouteSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { tripId, ...aiPayload } = validation.data;

        // Verify the trip exists and belongs to the authenticated user.
        const trip = await prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) {
            return errorResponse("NOT_FOUND", "Trip not found", 404);
        }
        if (trip.userId !== auth.user.sub) {
            return errorResponse("NOT_FOUND", "Trip not found", 404);
        }

        try {
            await checkRateLimit(`ai:${auth.user.sub}:itinerary`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);

            // Sanitize user-controlled string fields before they reach the LLM prompt.
            const safePayload = {
                ...aiPayload,
                destination: sanitizeUserInput(aiPayload.destination),
                mustSeeAttractions: (aiPayload.mustSeeAttractions ?? []).map(sanitizeUserInput),
                avoidAttractions:   (aiPayload.avoidAttractions   ?? []).map(sanitizeUserInput),
            };

            const result = await generateItinerary({ ...safePayload, tripId }, dnaContext || undefined);

            // Validate LLM output for injected HTML before persisting.
            validateLLMOutput(JSON.stringify(result), "json");

            // ── Persist: replace itinerary and update trip budget in one transaction ──
            const costAmount   = result.totalEstimatedCost?.amount   ?? 0;
            const costCurrency = result.totalEstimatedCost?.currency ?? trip.budgetCurrency;

            await prisma.$transaction([
                prisma.itinerary.deleteMany({ where: { tripId } }),
                prisma.itinerary.create({
                    data: {
                        tripId,
                        rawJson: result as object,
                    },
                }),
                prisma.trip.update({
                    where: { id: tripId },
                    data: {
                        budgetTotal:    costAmount,
                        budgetCurrency: costCurrency,
                    },
                }),
            ]);

            return NextResponse.json({
                success: true,
                data: formatAIResponse(result, {
                    confidence: computeConfidence({ mode: "LLM_ONLY" }),
                    reasoning:  `One-shot itinerary generated for ${aiPayload.destination} via LLM parametric knowledge. ` +
                                `No external data source — output not externally verified.`,
                    sources:    ["User input", "Travel DNA preferences", "LLM knowledge base (unverified)"],
                }),
            }, { status: 200 });
        } catch (err) {
            logError("[API] Itinerary generation error", err);
            return formatErrorResponse(err);
        }
    });
}
