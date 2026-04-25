/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRIMARY PRODUCTION PATH — Stage 3 of 5: Logistics Agent               ║
 * ║  Called by ItineraryCreationFlow.tsx after the Research stage.          ║
 * ║  Applies deterministic scheduling, geo-clustering, and travel routing.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence, lowGeoFraction } from "@/lib/ai/confidence";

const ActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
    cuisine: z.string().optional(),
    shortDescription: z.string().optional(),
    priceLevel: z.enum(["$", "$$", "$$$"]).optional(),
});

const HotelSchema = z.object({
    name: z.string(),
    priceRange: z.enum(["$", "$$", "$$$", "$$$$"]),
    area: z.string(),
    tags: z.array(z.string()),
    rating: z.number().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
});

const EnrichedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(ActivitySchema),
});

const Schema = z.object({
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number(),
    preferences: z
        .object({
            budget: z.number().optional(),
            style: z.string().optional(),
            pace: z.string().optional(),
        })
        .optional(),
    days: z.array(EnrichedDaySchema),
    hotels: z.array(HotelSchema),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "logistics", flowSessionId } });

        try {
            const t0 = Date.now();
            const agent = new LogisticsAgent();
            const result = await agent.run(body.data, flowSessionId);
            const durationMs = Date.now() - t0;

            const totalActivities = body.data.days.reduce((s, d) => s + d.activities.length, 0);

            const decisionsLog = [
                `Grouped ${body.data.days.length} days by geography`,
                `Assigned morning / afternoon / evening slots`,
                `Selected hotel: ${result.selectedHotel?.name ?? "TBD"}`,
                `Computed route efficiency`,
                `Logistics optimized`,
            ];

            return successResponse(
                formatAIResponse(result, {
                    // DETERMINISTIC: pure geographic clustering + time-slot heuristics — no LLM.
                    // Penalties: low geo-confidence reduces routing accuracy;
                    //            warnings indicate the scheduler hit edge cases.
                    confidence: computeConfidence({
                        mode: "DETERMINISTIC",
                        lowGeoFraction: lowGeoFraction(
                            body.data.days.flatMap((d) => d.activities)
                        ),
                        hasWarnings: Boolean(result.warnings?.length),
                    }),
                    reasoning: `Scheduled ${totalActivities} activities across ${body.data.days.length} days using ` +
                        `deterministic geographic clustering and time-slot heuristics. ` +
                        `Hotel selected: ${result.selectedHotel?.name ?? "TBD"}. No LLM involved.`,
                    sources: ["Activity coordinates", "Geographic clustering", "Time-slot heuristics"],
                    durationMs,
                    decisionsLog,
                })
            );
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
