/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRIMARY PRODUCTION PATH — Budget Apply                                 ║
 * ║  Called by ItineraryCreationFlow.tsx when the user accepts a budget     ║
 * ║  optimisation plan. Atomically applies the OptimalPlan to trip context. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import {
    applyOptimalPlan,
    type OptimalPlan,
    type BudgetAdjustment,
} from "@/agents/budget/budgetAgent";
import type { OptimizedTripContext } from "@/agents/shared/tripPipelineTypes";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ActivitySchema = z.object({
    name: z.string(),
    type: z.enum(["attraction", "experience", "restaurant"]),
    description: z.string(),
    estimatedCost: z.number().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    cuisine: z.string().optional(),
    shortDescription: z.string().optional(),
    priceLevel: z.enum(["$", "$$", "$$$"]).optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
});

const ScheduledActivitySchema = ActivitySchema.extend({
    id: z.string().optional(),
    timeSlot: z.enum(["morning", "afternoon", "evening"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    travelTimeFromPrevMs: z.number().optional(),
    isMeal: z.boolean().optional(),
    mealType: z.enum(["lunch", "dinner"]).optional(),
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

const FoodCostSummarySchema = z.object({
    perDay: z.array(z.number()),
    total: z.number(),
    avgPerDay: z.number(),
});

const AdjustmentActionSchema = z.object({
    type: z.enum(["change_hotel", "remove_activity"]),
    payload: z.object({
        activityId:   z.string().optional(),
        activityName: z.string().optional(),
        day:          z.number().optional(),
        hotelFrom:    z.string().optional(),
        hotelTo:      z.string().optional(),
    }),
});

const BudgetAdjustmentSchema: z.ZodType<BudgetAdjustment> = z.object({
    type:        z.enum(["hotel_change", "activity_remove"]),
    impact:      z.number().nonnegative(),
    description: z.string(),
    action:      AdjustmentActionSchema,
});

const CostBreakdownSchema = z.object({
    perDay:     z.array(z.number()),
    total:      z.number(),
    categories: z.object({
        hotel:    z.number(),
        food:     z.number(),
        activity: z.number(),
        other:    z.number(),
    }),
});

const OptimalPlanSchema: z.ZodType<OptimalPlan> = z.object({
    appliedAdjustments: z.array(BudgetAdjustmentSchema),
    finalTotal:         z.number(),
    finalBreakdown:     CostBreakdownSchema,
    achieved:           z.boolean(),
});

const Schema = z.object({
    /** Full OptimizedTripContext from the Logistics / Budget stage output. */
    context: z.object({
        destination:    z.string(),
        startDate:      z.string(),
        endDate:        z.string(),
        durationDays:   z.number(),
        preferences: z.object({
            budget: z.number().optional(),
            style:  z.string().optional(),
            pace:   z.string().optional(),
        }).optional(),
        days:         z.array(OptimizedDaySchema),
        hotels:       z.array(HotelSchema),
        selectedHotel: HotelSchema,
        foodCostSummary: FoodCostSummarySchema.optional(),
        warnings:     z.array(z.string()).optional(),
    }),
    /** The OptimalPlan returned by the Budget Agent to apply. */
    plan: OptimalPlanSchema,
});

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/itinerary-flow/apply-plan
 *
 * Atomically applies an OptimalPlan to a trip context and returns the fully
 * recomputed state. The UI replaces its itinerary + budget state wholesale
 * with the returned values — no partial merging required.
 *
 * Request body:
 *   { context: OptimizedTripContext, plan: OptimalPlan }
 *
 * Response:
 *   { success: true, data: { updatedContext, updatedBudget, warnings } }
 *
 * No LLM calls — purely deterministic, fast (<5ms on typical plans).
 */
export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({
            layer: "agent", step: "start",
            data: { stage: "apply-plan", flowSessionId, adjustments: body.data.plan.appliedAdjustments.length },
        });

        try {
            const t0 = Date.now();
            // Cast is safe: the Zod schema validates every field present in
            // OptimizedTripContext.
            const context = body.data.context as unknown as OptimizedTripContext;
            const result = applyOptimalPlan(context, body.data.plan, flowSessionId);
            const durationMs = Date.now() - t0;

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    adjustmentsApplied: body.data.plan.appliedAdjustments.length,
                    achieved:           body.data.plan.achieved,
                    warningCount:       result.warnings.length,
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
