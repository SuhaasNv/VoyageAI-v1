/**
 * tests/api/safety-route.test.ts
 *
 * Integration tests for POST /api/ai/itinerary-flow/safety
 *
 * Uses vi.hoisted() so module-level mock refs are available inside vi.mock()
 * factory closures (Vitest hoists vi.mock calls, so plain const refs are in TDZ).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mock refs ──────────────────────────────────────────────────────────
const { mockSafetyAgentRun } = vi.hoisted(() => ({
    mockSafetyAgentRun: vi.fn(),
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
    getRequestPathname: vi.fn().mockReturnValue("/api/ai/itinerary-flow/safety"),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
    validateBody:   vi.fn(),
    getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
    getBearerToken: vi.fn(),
}));

vi.mock("@/agents/safety/safetyAgent", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafetyAgent: vi.fn(function (this: any) { this.run = mockSafetyAgentRun; }),
}));

vi.mock("@/security/safety", () => ({
    sanitizeUserInput: vi.fn().mockImplementation((s: string) => s),
    validateLLMOutput: vi.fn(),
    sanitizeHTML:      vi.fn().mockImplementation((s: string) => s ?? ""),
}));

vi.mock("@/lib/ai/explainability", () => ({
    formatAIResponse: vi.fn().mockImplementation((data: unknown) => data),
}));

vi.mock("@/lib/ai/confidence", () => ({
    computeConfidence: vi.fn().mockReturnValue(0.95),
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

import { POST } from "@/app/api/ai/itinerary-flow/safety/route";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { validateLLMOutput } from "@/security/safety";
import { computeConfidence } from "@/lib/ai/confidence";
import { mockAuthContext } from "../fixtures/tripFixtures";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/ai/itinerary-flow/safety", {
        method:  "POST",
        body:    "{}",
        headers: { "content-type": "application/json" },
    });
}

function makeValidSafetyBody(overrides: Record<string, unknown> = {}) {
    return {
        destination:  "Rome, Italy",
        startDate:    "2026-08-01",
        endDate:      "2026-08-03",
        durationDays: 3,
        preferences:  { style: "balanced" },
        days: [
            {
                day:   1,
                theme: "Arrival",
                activities: [
                    {
                        name:        "Colosseum",
                        type:        "attraction",
                        description: "Ancient amphitheatre",
                        timeSlot:    "morning",
                        isMeal:      false,
                    },
                    {
                        name:        "Lunch",
                        type:        "restaurant",
                        description: "Italian lunch",
                        timeSlot:    "afternoon",
                        isMeal:      true,
                        mealType:    "lunch",
                    },
                ],
            },
        ],
        hotels:        [{ name: "Roma Hotel", priceRange: "$$", area: "Centro", tags: [] }],
        selectedHotel: { name: "Roma Hotel", priceRange: "$$", area: "Centro", tags: [] },
        budget: {
            totalEstimatedCost: 700,
            isOverBudget:       false,
        },
        ...overrides,
    };
}

const MOCK_SAFETY_RESULT_CLEAN = {
    ...makeValidSafetyBody(),
    safety: {
        riskLevel: "low" as const,
        warnings:  [] as unknown[],
        tips:      [] as string[],
    },
};

const MOCK_SAFETY_RESULT_WARNINGS = {
    ...makeValidSafetyBody(),
    safety: {
        riskLevel: "medium" as const,
        warnings:  [{ type: "fatigue", day: 1, severity: "medium", message: "Heavy schedule" }],
        tips:      ["Take it easy"],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/safety — authentication", () => {
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

describe("POST /api/ai/itinerary-flow/safety — validation", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 400 when body fails Zod schema", async () => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:       false,
            response: new Response(
                JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "budget required" } }),
                { status: 400, headers: { "content-type": "application/json" } }
            ) as never,
        });

        const res = await POST(makeRequest());
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS — no warnings (clean itinerary)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/safety — success (clean)", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: makeValidSafetyBody() as any,
        });
        mockSafetyAgentRun.mockResolvedValue(MOCK_SAFETY_RESULT_CLEAN);
    });

    it("returns 200 with success:true", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("response data contains safety.riskLevel", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(body.data.safety.riskLevel).toBe("low");
    });

    it("does NOT call validateLLMOutput when there are no warnings", async () => {
        await POST(makeRequest());
        expect(validateLLMOutput).not.toHaveBeenCalled();
    });

    it("uses DETERMINISTIC confidence mode", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "DETERMINISTIC" }),
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS — with warnings (LLM tips generated)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/safety — success (with warnings)", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: makeValidSafetyBody() as any,
        });
        mockSafetyAgentRun.mockResolvedValue(MOCK_SAFETY_RESULT_WARNINGS);
    });

    it("calls validateLLMOutput on tips when warnings are present", async () => {
        await POST(makeRequest());
        expect(validateLLMOutput).toHaveBeenCalledWith(
            expect.any(String),
            "text",
        );
    });

    it("response carries the warnings and tips", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(body.data.safety.warnings.length).toBeGreaterThan(0);
        expect(body.data.safety.tips).toContain("Take it easy");
    });

    it("confidence has hasWarnings:true when warnings exist", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ hasWarnings: true }),
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT ERRORS
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/safety — agent errors", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: makeValidSafetyBody() as any,
        });
    });

    it("returns error response when SafetyAgent.run throws", async () => {
        mockSafetyAgentRun.mockRejectedValue(new Error("Safety check failed"));

        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(body.success).toBe(false);
    });
});
