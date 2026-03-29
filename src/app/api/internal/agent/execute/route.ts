/**
 * POST /api/internal/agent/execute
 *
 * Unified internal execution endpoint for the Python LangGraph orchestrator.
 * Each LangGraph node calls this route to run one TypeScript agent step,
 * keeping all agent logic in a single authoritative implementation.
 *
 * Security: requires X-Internal-Agent-Secret header matching
 * INTERNAL_AGENT_SECRET env var. Never expose this route to the browser.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { validateBody } from "@/lib/api/request";
import { successResponse, errorResponse, forbiddenResponse } from "@/lib/api/response";
import { logStructured, generateRequestId } from "@/infrastructure/logger";
import { formatErrorResponse } from "@/lib/errors";
import { runWithReplayLog } from "@/services/ai/agentReplayLogger";

import { PlannerAgent } from "@/agents/planner/plannerAgent";
import { ResearchAgent } from "@/agents/research/researchAgent";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";
import { BudgetAgent } from "@/agents/budget/budgetAgent";
import { SafetyAgent } from "@/agents/safety/safetyAgent";

// ─── Zod schemas for each step payload ───────────────────────────────────────

const PreferencesSchema = z.object({
    budget: z.number().optional(),
    style: z.string().optional(),
    pace: z.string().optional(),
}).optional();

const PlannerPayloadSchema = z.object({
    input: z.string().min(5).max(2000),
});

const ResearchPayloadSchema = z.object({
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number(),
    preferences: PreferencesSchema,
    days: z.array(z.object({ day: z.number(), theme: z.string() })),
});

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

const EnrichedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(z.object({
        name: z.string(),
        type: z.enum(["attraction", "experience", "restaurant"]),
        description: z.string(),
        estimatedCost: z.number().optional(),
    })),
});

const LogisticsPayloadSchema = z.object({
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number(),
    preferences: PreferencesSchema,
    days: z.array(EnrichedDaySchema),
    hotels: z.array(HotelSchema),
});

const OptimizedDaySchema = z.object({
    day: z.number(),
    theme: z.string(),
    activities: z.array(ScheduledActivitySchema),
});

const BudgetPayloadSchema = z.object({
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number(),
    preferences: PreferencesSchema,
    days: z.array(OptimizedDaySchema),
    hotels: z.array(HotelSchema),
    selectedHotel: HotelSchema,
});

const SafetyPayloadSchema = BudgetPayloadSchema.extend({
    budget: z.object({
        totalEstimatedCost: z.number(),
        costPerDay: z.array(z.number()).optional(),
        isOverBudget: z.boolean(),
        budgetGap: z.number().optional(),
        suggestions: z.array(z.string()).optional(),
    }),
});

const BodySchema = z.discriminatedUnion("step", [
    z.object({ step: z.literal("planner"),   payload: PlannerPayloadSchema }),
    z.object({ step: z.literal("research"),  payload: ResearchPayloadSchema }),
    z.object({ step: z.literal("logistics"), payload: LogisticsPayloadSchema }),
    z.object({ step: z.literal("budget"),    payload: BudgetPayloadSchema }),
    z.object({ step: z.literal("safety"),    payload: SafetyPayloadSchema }),
]);

// Step index map matches orchestrator convention so replay traces are aligned.
const STEP_INDEX: Record<string, number> = {
    planner:   0,
    research:  1,
    logistics: 2,
    budget:    3,
    safety:    4,
};

// ─── Secret validation ────────────────────────────────────────────────────────

function isValidInternalSecret(req: NextRequest): boolean {
    const secret = process.env.INTERNAL_AGENT_SECRET;
    if (!secret) {
        // Secret not configured — block all internal calls in this state.
        return false;
    }
    const header = req.headers.get("x-internal-agent-secret") ?? "";
    // Compare byte buffers, not JS character counts, to handle non-ASCII secrets
    // correctly and to satisfy the equal-length precondition of timingSafeEqual.
    const headerBuf = Buffer.from(header);
    const secretBuf = Buffer.from(secret);
    if (headerBuf.length !== secretBuf.length) return false;
    try {
        return timingSafeEqual(headerBuf, secretBuf);
    } catch {
        return false;
    }
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
//
// Lightweight sliding-window per calling IP. Designed for the internal route
// where the only expected caller is the co-deployed Python service.
// If Redis is available project-wide, the project's existing checkRateLimit
// (src/services/rateLimit) can replace this at any time.

const RATE_LIMIT_WINDOW_MS = 60_000;       // 1 minute window
const RATE_LIMIT_MAX = 200;                // max calls per window per IP

type RateBucket = { count: number; windowStart: number };
const _rateBuckets = new Map<string, RateBucket>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const bucket = _rateBuckets.get(ip);

    if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
        _rateBuckets.set(ip, { count: 1, windowStart: now });
        return false;
    }

    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) return true;
    return false;
}

// ─── Structured error helper ──────────────────────────────────────────────────

function agentErrorResponse(code: string, message: string, stage: string, status = 500) {
    return errorResponse(code, message, status, { stage });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    if (!isValidInternalSecret(req)) {
        return forbiddenResponse("Invalid or missing internal agent secret");
    }

    // Lightweight rate limiting — protects against accidental infinite loops in
    // the Python graph or misconfigured callers.
    const ip =
        req.headers.get("x-real-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "internal";
    if (isRateLimited(ip)) {
        return agentErrorResponse("RATE_LIMITED", "Too many internal agent calls", "internal", 429);
    }

    const body = await validateBody(req, BodySchema);
    if (!body.ok) return body.response;

    const { step, payload } = body.data;
    const requestId = req.headers.get("x-request-id") ?? generateRequestId();
    const stepIndex = STEP_INDEX[step];

    logStructured({ layer: "orchestrator", step: "input", requestId, data: { source: "langgraph", calling: step } });

    try {
        let result: unknown;

        if (step === "planner") {
            const agent = new PlannerAgent();
            result = await runWithReplayLog({
                requestId, agentName: "planner", stepIndex,
                input: { promptLength: payload.input.length },
                run: () => agent.run(payload.input, requestId),
                buildOutputSummary: (r) => ({
                    destination: (r as { destination: string }).destination,
                    durationDays: (r as { durationDays: number }).durationDays,
                }),
            });
        } else if (step === "research") {
            const agent = new ResearchAgent();
            result = await runWithReplayLog({
                requestId, agentName: "research", stepIndex,
                input: { destination: payload.destination, durationDays: payload.durationDays },
                run: () => agent.run(payload, requestId),
                buildOutputSummary: (r) => ({
                    days: (r as { days: unknown[] }).days.length,
                    hotels: (r as { hotels: unknown[] }).hotels.length,
                }),
            });
        } else if (step === "logistics") {
            const agent = new LogisticsAgent();
            result = await runWithReplayLog({
                requestId, agentName: "logistics", stepIndex,
                input: { destination: payload.destination, daysCount: payload.days.length },
                run: () => agent.run(payload, requestId),
                buildOutputSummary: (r) => ({
                    selectedHotel: (r as { selectedHotel: { name: string } }).selectedHotel.name,
                }),
            });
        } else if (step === "budget") {
            const agent = new BudgetAgent();
            result = await runWithReplayLog({
                requestId, agentName: "budget", stepIndex,
                input: { selectedHotel: payload.selectedHotel?.name },
                run: () => agent.run(payload, requestId),
                buildOutputSummary: (r) => ({
                    totalEstimatedCost: (r as { budget: { totalEstimatedCost: number; isOverBudget: boolean } }).budget.totalEstimatedCost,
                    isOverBudget: (r as { budget: { totalEstimatedCost: number; isOverBudget: boolean } }).budget.isOverBudget,
                }),
            });
        } else {
            // safety
            const agent = new SafetyAgent();
            result = await runWithReplayLog({
                requestId, agentName: "safety", stepIndex,
                input: { isOverBudget: (payload as { budget: { isOverBudget: boolean } }).budget.isOverBudget },
                run: () => agent.run(payload as Parameters<SafetyAgent["run"]>[0], requestId),
                buildOutputSummary: (r) => ({
                    riskLevel: (r as { safety: { riskLevel: string } }).safety.riskLevel,
                }),
            });
        }

        logStructured({ layer: "orchestrator", step: "output", requestId, data: { source: "langgraph", agent: step } });

        return successResponse({ step, requestId, result });
    } catch (err) {
        logStructured({ layer: "orchestrator", step: "error", requestId, data: { source: "langgraph", agent: step, error: (err as Error).message } });
        return agentErrorResponse(
            "AGENT_EXECUTION_FAILED",
            (err as Error).message ?? "Agent execution failed",
            step,
        );
    }
}
