import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { BudgetAgent } from "@/agents/budget/budgetAgent";
import { formatAIResponse } from "@/lib/ai/explainability";

/**
 * Scheduled activity schema — preserves all fields that Budget Agent and
 * Logistics produce so isMeal, mealType, and priceLevel are never stripped
 * and food cost resolution stays consistent between the UI flow and the
 * in-process orchestrator.
 */
const ScheduledActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    timeSlot: z.enum(["morning", "afternoon", "evening"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    travelTimeFromPrevMs: z.number().optional(),
    /** Injected meal flag — must be preserved so Budget skips double-counting. */
    isMeal: z.boolean().optional(),
    mealType: z.enum(["lunch", "dinner"]).optional(),
    priceLevel: z.enum(["$", "$$", "$$$"]).optional(),
    cuisine: z.string().optional(),
    shortDescription: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
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

const OptimizedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(ScheduledActivitySchema),
});

/**
 * foodCostSummary mirrors the OptimizedTripContext shape from Logistics.
 * When present, Budget Agent uses it verbatim as the food source of truth
 * instead of re-deriving food costs from activities.
 */
const FoodCostSummarySchema = z.object({
    perDay: z.array(z.number()),
    total: z.number(),
    avgPerDay: z.number(),
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
    /** Forwarded from Logistics — single source of truth for food costs. */
    foodCostSummary: FoodCostSummarySchema.optional(),
    warnings: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "budget", flowSessionId } });

        try {
            const t0 = Date.now();
            const agent = new BudgetAgent();
            const result = await agent.run(body.data, flowSessionId);
            const durationMs = Date.now() - t0;

            const { hotel, food, activity } = result.budget.costBreakdown.categories;

            const foodSource = body.data.foodCostSummary ? "Logistics food cost summary" : "Activity price levels";
            const sources = [foodSource, "Hotel rate table", "Activity cost estimates"];

            const decisionsLog = [
                `Hotel: ${body.data.selectedHotel.priceRange} tier × ${Math.max(0, body.data.durationDays - 1)} nights = $${hotel}`,
                `Food: $${food} (${body.data.foodCostSummary ? "Logistics source" : "activity fallback"})`,
                `Activities: $${activity} across ${result.budget.ledger.filter((l) => l.category === "activity").length} items`,
                `Total: $${result.budget.totalEstimatedCost}`,
                `Budget check: ${result.budget.isOverBudget ? "OVER" : "within"} budget`,
                ...(result.budget.isOverBudget
                    ? [`Generating saving suggestions (gap: $${result.budget.budgetGap})`]
                    : []),
                `Budget analysis complete`,
            ];

            return successResponse(
                formatAIResponse(result, {
                    confidence: 1.0,
                    reasoning: `Computed trip total of $${result.budget.totalEstimatedCost} from ${result.budget.ledger.length} line items ` +
                        `(hotel $${hotel}, food $${food}, activities $${activity}). ` +
                        `Budget status: ${result.budget.isOverBudget ? `OVER by $${result.budget.budgetGap ?? "N/A"} — saving suggestions generated` : "within budget"}. ` +
                        `Calculation is fully deterministic.`,
                    sources,
                    durationMs,
                    decisionsLog,
                })
            );
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
