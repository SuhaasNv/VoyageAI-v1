/**
 * tests/api/planner-route.test.ts
 *
 * Integration tests for POST /api/ai/itinerary-flow/planner
 *
 * Uses vi.hoisted() so module-level mock refs are available inside vi.mock()
 * factory closures (Vitest hoists vi.mock calls, so plain const refs are in TDZ).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mock refs ──────────────────────────────────────────────────────────
const { mockPlannerRun } = vi.hoisted(() => ({
    mockPlannerRun: vi.fn(),
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
    getRequestPathname: vi.fn().mockReturnValue("/api/ai/itinerary-flow/planner"),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
    validateBody:   vi.fn(),
    getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
    getBearerToken: vi.fn(),
}));

vi.mock("@/agents/planner/plannerAgent", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PlannerAgent: vi.fn(function (this: any) { this.run = mockPlannerRun; }),
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
    computeConfidence: vi.fn().mockReturnValue(0.8),
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

import { POST } from "@/app/api/ai/itinerary-flow/planner/route";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";
import { computeConfidence } from "@/lib/ai/confidence";
import { mockAuthContext } from "../fixtures/tripFixtures";

// ── Shared fixtures ────────────────────────────────────────────────────────────

function makeRequest(extra: Record<string, string> = {}): NextRequest {
    return new NextRequest("http://localhost/api/ai/itinerary-flow/planner", {
        method:  "POST",
        body:    JSON.stringify({ input: "5 days in Tokyo" }),
        headers: { "content-type": "application/json", ...extra },
    });
}

const MOCK_PLANNER_RESULT = {
    destination:  "Tokyo, Japan",
    startDate:    "2026-07-01",
    endDate:      "2026-07-05",
    durationDays: 5,
    preferences:  { style: "cultural", pace: "moderate" },
    days: [
        { day: 1, theme: "Arrival & Shinjuku",     activities: [] },
        { day: 2, theme: "Asakusa & Ueno",          activities: [] },
        { day: 3, theme: "Harajuku & Shibuya",      activities: [] },
        { day: 4, theme: "Akihabara & Odaiba",      activities: [] },
        { day: 5, theme: "Tsukiji & Farewell tour", activities: [] },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/planner — authentication", () => {
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

describe("POST /api/ai/itinerary-flow/planner — validation", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 400 when body fails Zod schema", async () => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:       false,
            response: new Response(
                JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "input required" } }),
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

describe("POST /api/ai/itinerary-flow/planner — success", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            data: { input: "5 days in Tokyo" } as any,
        });
        mockPlannerRun.mockResolvedValue(MOCK_PLANNER_RESULT);
    });

    it("returns 200 with success:true and trip data", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("response data contains destination and durationDays", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(body.data.destination).toBe("Tokyo, Japan");
        expect(body.data.durationDays).toBe(5);
    });

    it("calls sanitizeUserInput before running the agent", async () => {
        await POST(makeRequest());
        expect(sanitizeUserInput).toHaveBeenCalledWith("5 days in Tokyo");
    });

    it("calls validateLLMOutput on the agent result", async () => {
        await POST(makeRequest());
        expect(validateLLMOutput).toHaveBeenCalledWith(
            expect.any(String),
            "json",
        );
    });

    it("passes x-flow-session-id header to agent.run", async () => {
        await POST(makeRequest({ "x-flow-session-id": "session-abc" }));
        expect(mockPlannerRun).toHaveBeenCalledWith(
            expect.any(String),
            "session-abc",
        );
    });

    it("uses LLM_ONLY confidence mode", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "LLM_ONLY" }),
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT ERRORS
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/ai/itinerary-flow/planner — agent errors", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok:   true,
            data: { input: "5 days in Tokyo" } as any,
        });
    });

    it("returns error response when PlannerAgent.run throws", async () => {
        mockPlannerRun.mockRejectedValue(new Error("LLM timeout"));

        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(body.success).toBe(false);
    });

    it("propagates AIServiceError from the agent", async () => {
        const { AIServiceError } = await import("@/lib/ai/llm");
        mockPlannerRun.mockRejectedValue(
            new AIServiceError("SCHEMA_VALIDATION_FAILED", "Bad LLM output")
        );

        const res = await POST(makeRequest());
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect((await res.json()).success).toBe(false);
    });
});
