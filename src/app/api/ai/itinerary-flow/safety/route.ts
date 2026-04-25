/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRIMARY PRODUCTION PATH — Stage 5 of 5: Safety Agent                  ║
 * ║  Called by ItineraryCreationFlow.tsx as the final pipeline stage.       ║
 * ║  Applies fatigue rules, pacing constraints, and travel advisories.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { SafetyAgent } from "@/agents/safety/safetyAgent";
import type { BudgetedTripContext } from "@/agents/budget/budgetAgent";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";
import { validateLLMOutput } from "@/security/safety";

// ─── Schema ───────────────────────────────────────────────────────────────────
//
// Must pass through all fields the Safety Agent reads from ScheduledActivity:
//   travelTimeFromPrevMs  → Rule 2 (travel fatigue)
//   endTime               → Rule 3 (late-night overflow)
//   isMeal / mealType     → Rule 4 (meal gap detection)
//
// Additional Activity fields (id, lat, lng, geo, restaurant metadata) are
// preserved so the returned SafeTripContext remains structurally complete.

const ScheduledActivitySchema = z.object({
    name:                 z.string(),
    type:                 z.enum(["attraction", "experience", "restaurant"]),
    description:          z.string(),
    estimatedCost:        z.number().optional(),
    lat:                  z.number().optional(),
    lng:                  z.number().optional(),
    cuisine:              z.string().optional(),
    shortDescription:     z.string().optional(),
    priceLevel:           z.enum(["$", "$$", "$$$"]).optional(),
    geoConfidence:        z.enum(["high", "medium", "low"]).optional(),
    id:                   z.string().optional(),
    timeSlot:             z.enum(["morning", "afternoon", "evening"]),
    startTime:            z.string().optional(),
    endTime:              z.string().optional(),
    travelTimeFromPrevMs: z.number().optional(),
    isMeal:               z.boolean().optional(),
    mealType:             z.enum(["lunch", "dinner"]).optional(),
});

const OptimizedDaySchema = z.object({
    day:        z.number(),
    theme:      z.string(),
    activities: z.array(ScheduledActivitySchema),
});

const HotelSchema = z.object({
    name:          z.string(),
    priceRange:    z.string(),
    area:          z.string(),
    tags:          z.array(z.string()),
    rating:        z.number().optional(),
    lat:           z.number().optional(),
    lng:           z.number().optional(),
    geoConfidence: z.enum(["high", "medium", "low"]).optional(),
});

const Schema = z.object({
    destination:  z.string(),
    startDate:    z.string(),
    endDate:      z.string(),
    durationDays: z.number(),
    preferences: z.object({
        budget: z.number().optional(),
        style:  z.string().optional(),
        pace:   z.string().optional(),
    }).optional(),
    days:          z.array(OptimizedDaySchema),
    hotels:        z.array(HotelSchema),
    selectedHotel: HotelSchema.optional(),
    budget: z.object({
        totalEstimatedCost: z.number(),
        costPerDay:         z.array(z.number()).optional(),
        isOverBudget:       z.boolean(),
        budgetGap:          z.number().optional(),
        suggestions:        z.array(z.string()).optional(),
    }),
});

// ─── Route ────────────────────────────────────────────────────────────────────

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
            // Cast is safe: the Zod schema validates every field the Safety Agent
            // reads. The delta vs full BudgetedTripContext (ledger, costBreakdown,
            // budgetAnalysis) is not accessed by SafetyAgent.run().
            const context = body.data as unknown as BudgetedTripContext;
            const result = await agent.run(context, flowSessionId);
            const durationMs = Date.now() - t0;

            const warningCount = result.safety.warnings.length;
            const llmUsed = warningCount > 0;
            if (llmUsed) {
                validateLLMOutput(result.safety.tips.join("\n"), "text");
            }

            const sources = [
                "Deterministic safety rule engine",
                ...(llmUsed ? ["LLM (tip generation only)"] : []),
            ];

            const decisionsLog = [
                `Applied fatigue, travel, schedule, and meal rules to ${body.data.days.length}-day itinerary`,
                `Found ${warningCount} warning(s) — risk level: ${result.safety.riskLevel.toUpperCase()}`,
                ...(llmUsed
                    ? [`Generated ${result.safety.tips.length} actionable tip(s) from warnings`]
                    : [`No warnings — generic travel tip applied`]),
                `Total analysis: ${durationMs}ms`,
            ];

            return successResponse(
                formatAIResponse(result, {
                    // DETERMINISTIC: safety rules are pure code (fatigue, travel, schedule, meal).
                    // Penalty: warnings trigger the LLM tip path, which introduces generation
                    //          uncertainty into an otherwise deterministic output.
                    confidence: computeConfidence({
                        mode: "DETERMINISTIC",
                        hasWarnings: warningCount > 0,
                    }),
                    reasoning: `Evaluated ${body.data.days.length}-day itinerary against fatigue, travel-time, schedule, ` +
                        `and meal-gap rules. Risk level: ${result.safety.riskLevel.toUpperCase()}; ` +
                        `${warningCount} warning(s) detected.` +
                        (llmUsed ? ` ${result.safety.tips.length} actionable tip(s) generated by LLM.` : " No warnings — rules-only pass."),
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
