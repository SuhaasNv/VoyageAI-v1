/**
 * tests/api/budget-route.test.ts
 *
 * Integration tests for POST /api/ai/itinerary-flow/budget
 *
 * Uses vi.hoisted() so module-level mock refs are available inside vi.mock()
 * factory closures (Vitest hoists vi.mock calls, so plain const refs are in TDZ).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mock refs ──────────────────────────────────────────────────────────
const { mockBudgetAgentRun } = vi.hoisted(() => ({
    mockBudgetAgentRun: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    trunc:         vi.fn().mockImplementation((s: string) => s),
}));

vi.mock("@/lib/requestContext", () => ({
    runWithRequestContext: vi.fn().mockImplementation(
        (_req: unknown, fn: () => Promise<unknown>) => fn()
    ),
    getRequestId:       vi.fn().mockReturnValue("test-req-id"),
    getRequestPathname: vi.fn().mockReturnValue("/api/ai/itinerary-flow/budget"),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
    validateBody:   vi.fn(),
    getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
    getBearerToken: vi.fn(),
}));

vi.mock("@/agents/budget/budgetAgent", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BudgetAgent: vi.fn(function (this: any) { this.run = mockBudgetAgentRun; }),
}));

vi.mock("@/lib/ai/explainability", () => ({
    formatAIResponse: vi.fn().mockImplementation((data: unknown) => data),
}));

vi.mock("@/lib/ai/confidence", () => ({
    computeConfidence: vi.fn().mockReturnValue(1.0),
}));

vi.mock("@/lib/ai/llm", () => {
    class AIServiceError extends Error {
        constructor(public readonly code: string, message: string) {
            super(message);
            this.name = "AIServiceError";
        }
    }
    return { AIServiceError };
});

vi.mock("@/lib/ai/itineraryValidation", () => ({
    ItineraryValidationError: class extends Error {},
}));

vi.mock("@/security/rateLimiter", () => ({
    RateLimitError: class extends Error {
        readonly status = 429;
        readonly code   = "RATE_LIMIT_EXCEEDED";
    },
}));

// ── Imports (after all vi.mock calls) ─────────────────────────────────────────

import { POST } from "@/app/api/ai/itinerary-flow/budget/route";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { computeConfidence } from "@/lib/ai/confidence";
import { mockAuthContext } from "../fixtures/tripFixtures";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest("http://localhost/api/ai/itinerary-flow/budget", {
        method:  "POST",
        body:    "{}",
        headers: { "content-type": "application/json", ...headers },
    });
}

function makeValidBudgetBody() {
    return {
        destination:  "Paris, France",
        startDate:    "2026-07-01",
        endDate:      "2026-07-03",
        durationDays: 3,
        preferences:  { budget: 1500, style: "balanced", pace: "moderate" },
        days: [
            {
                day:   1,
                theme: "Arrival",
                activities: [{
                    name:          "Eiffel Tower",
                    type:          "attraction",
                    description:   "Iconic iron structure",
                    timeSlot:      "afternoon",
                    estimatedCost: 30,
                }],
            },
        ],
        hotels:        [{ name: "Hotel A", priceRange: "$$", area: "Centre", tags: ["wifi"] }],
        selectedHotel: { name: "Hotel A", priceRange: "$$", area: "Centre", tags: ["wifi"] },
    };
}

const MOCK_BUDGET_RESULT = {
    ...makeValidBudgetBody(),
    budget: {
        totalEstimatedCost: 650,
        costPerDay:  [216, 217, 217],
        isOverBudget: false,
        ledger: [
            { category: "hotel",    description: "Hotel A (2 nights)", cost: 200 },
            { category: "food",     description: "Meals total",         cost: 150 },
            { category: "activity", description: "Eiffel Tower",        cost: 30  },
        ],
        costBreakdown: {
            perDay:      [216, 217, 217],
            total:       650,
            categories:  { hotel: 200, food: 150, activity: 30, other: 0 },
        },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/budget — authentication", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 401 when no auth token is present", async () => {
        vi.mocked(getAuthContext).mockReturnValue(null);
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
        expect((await res.json()).success).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/budget — validation", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 400 when body fails Zod schema", async () => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:       false,
            response: new Response(
                JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "selectedHotel required" } }),
                { status: 400, headers: { "content-type": "application/json" } }
            ) as never,
        });

        const res = await POST(makeRequest());
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/budget — success", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            data: makeValidBudgetBody() as any,
        });
        mockBudgetAgentRun.mockResolvedValue(MOCK_BUDGET_RESULT);
    });

    it("returns 200 with success:true", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("response data contains budget breakdown", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(body.data.budget.totalEstimatedCost).toBe(650);
        expect(body.data.budget.isOverBudget).toBe(false);
    });

    it("uses DETERMINISTIC confidence mode", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "DETERMINISTIC" }),
        );
    });

    it("passes x-flow-session-id to agent.run", async () => {
        await POST(makeRequest({ "x-flow-session-id": "flow-abc" }));
        expect(mockBudgetAgentRun).toHaveBeenCalledWith(
            expect.anything(),
            "flow-abc",
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT ERRORS
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/budget — agent errors", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            data: makeValidBudgetBody() as any,
        });
    });

    it("returns an error response when BudgetAgent.run throws", async () => {
        mockBudgetAgentRun.mockRejectedValue(new Error("Budget calculation failed"));

        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(body.success).toBe(false);
    });
});
