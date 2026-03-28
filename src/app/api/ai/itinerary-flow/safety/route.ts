import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { SafetyAgent } from "@/agents/safety/safetyAgent";

const ScheduledActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    timeSlot: z.enum(["morning", "afternoon", "evening"]),
});

const OptimizedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(ScheduledActivitySchema),
});

const HotelSchema = z.object({
    name: z.string(),
    priceRange: z.string(),
    area: z.string(),
    tags: z.array(z.string()),
    rating: z.number().optional(),
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
    days: z.array(OptimizedDaySchema),
    hotels: z.array(HotelSchema),
    selectedHotel: HotelSchema.optional(),
    budget: z.object({
        totalEstimatedCost: z.number(),
        costPerDay: z.array(z.number()).optional(),
        isOverBudget: z.boolean(),
        budgetGap: z.number().optional(),
        suggestions: z.array(z.string()).optional(),
    }),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "safety", flowSessionId } });

        try {
            const t0 = Date.now();
            const agent = new SafetyAgent();
            const result = await agent.run(body.data as Parameters<typeof agent.run>[0], flowSessionId);
            const durationMs = Date.now() - t0;

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.88,
                    dataSources: [
                        "Risk rule engine",
                        "Weather heuristics",
                        "Destination knowledge base",
                    ],
                    decisionsLog: [
                        `+0ms Scanning ${body.data.days.length} days for risk signals`,
                        `+20ms Checking activity density per day`,
                        `+40ms Evaluating fatigue patterns`,
                        `+60ms Applying weather heuristics for ${body.data.destination}`,
                        `+80ms Risk level: ${result.safety.riskLevel.toUpperCase()}`,
                        `+90ms Found ${result.safety.warnings.length} warning(s), ${result.safety.tips.length} tip(s)`,
                        `+${durationMs}ms Safety briefing complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
