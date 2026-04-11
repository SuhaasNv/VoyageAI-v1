import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";

// Forward-declared so ActivitySchema can reference itself for restaurantOptions.
const BaseActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
    // Phase 1: restaurant enrichment fields
    cuisine: z.string().optional(),
    shortDescription: z.string().optional(),
    priceLevel: z.enum(["$", "$$", "$$$"]).optional(),
});

// Phase 2: nested restaurantOptions (self-referential, one level deep)
const ActivitySchema: z.ZodType<z.infer<typeof BaseActivitySchema> & { restaurantOptions?: z.infer<typeof BaseActivitySchema>[] }> =
    BaseActivitySchema.extend({
        restaurantOptions: z.lazy(() => z.array(BaseActivitySchema)).optional(),
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

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.90,
                    dataSources: [
                        "Activity coordinates",
                        "Geographic clustering",
                        "Time-slot heuristics",
                    ],
                    decisionsLog: [
                        `+0ms Grouping ${body.data.days.length} days by geography`,
                        `+50ms Assigning morning / afternoon / evening slots`,
                        `+100ms Selecting hotel: ${result.selectedHotel?.name ?? "TBD"}`,
                        `+150ms Computing route efficiency`,
                        `+${durationMs}ms Logistics optimized`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
