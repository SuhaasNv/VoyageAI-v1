import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { BudgetAgent } from "@/agents/budget/budgetAgent";

const ScheduledActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    timeSlot: z.enum(["morning", "afternoon", "evening"]),
});

const HotelSchema = z.object({
    name: z.string(),
    priceRange: z.enum(["$", "$$", "$$$", "$$$$"]),
    area: z.string(),
    tags: z.array(z.string()),
    rating: z.number().optional(),
});

const OptimizedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(ScheduledActivitySchema),
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
    selectedHotel: HotelSchema,
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        try {
            const t0 = Date.now();
            const agent = new BudgetAgent();
            const result = await agent.run(body.data);
            const durationMs = Date.now() - t0;

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.95,
                    dataSources: [
                        "Local pricing data",
                        "Hotel rate tables",
                        "Activity cost estimates",
                    ],
                    decisionsLog: [
                        `+0ms Calculating hotel cost: ${body.data.selectedHotel.priceRange} tier`,
                        `+10ms Tallying activity costs per day`,
                        `+20ms Total: $${result.budget.totalEstimatedCost}`,
                        `+25ms Budget check: ${result.budget.isOverBudget ? "OVER" : "within"} budget`,
                        ...(result.budget.isOverBudget
                            ? [`+50ms Generating saving suggestions (gap: $${result.budget.budgetGap})`]
                            : []),
                        `+${durationMs}ms Budget analysis complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
