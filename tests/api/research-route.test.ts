/**
 * tests/api/research-route.test.ts
 *
 * Integration tests for POST /api/ai/itinerary-flow/research
 * Uses vi.hoisted() for reliable mock references.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockResearchAgentRun } = vi.hoisted(() => ({
    mockResearchAgentRun: vi.fn(),
}));

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(), logError: vi.fn(), logInfo: vi.fn(),
    trunc: vi.fn((s: string) => s),
}));

vi.mock("@/lib/requestContext", () => ({
    runWithRequestContext: vi.fn().mockImplementation(
        (_req: unknown, fn: () => Promise<unknown>) => fn()
    ),
    getRequestId:       vi.fn().mockReturnValue("req-test"),
    getRequestPathname: vi.fn().mockReturnValue("/api/ai/itinerary-flow/research"),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
    validateBody:   vi.fn(),
    getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
    getBearerToken: vi.fn(),
}));

vi.mock("@/agents/research/researchAgent", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ResearchAgent: vi.fn(function (this: any) { this.run = mockResearchAgentRun; }),
}));

vi.mock("@/security/safety", () => ({
    sanitizeUserInput: vi.fn().mockImplementation((s: string) => s),
    validateLLMOutput: vi.fn(),
}));

vi.mock("@/lib/ai/explainability", () => ({
    formatAIResponse: vi.fn().mockImplementation((data: unknown) => data),
}));

vi.mock("@/lib/ai/confidence", () => ({
    computeConfidence: vi.fn().mockReturnValue(0.82),
    lowGeoFraction:    vi.fn().mockReturnValue(0),
}));

vi.mock("@/lib/ai/llm", () => ({
    AIServiceError: class AIServiceError extends Error {
        constructor(public readonly code: string, message: string) { super(message); }
    },
}));

vi.mock("@/lib/ai/itineraryValidation", () => ({
    ItineraryValidationError: class extends Error {},
}));

vi.mock("@/security/rateLimiter", () => ({
    RateLimitError: class extends Error { readonly status = 429; readonly code = "RATE_LIMIT_EXCEEDED"; },
}));

import { POST } from "@/app/api/ai/itinerary-flow/research/route";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { validateLLMOutput } from "@/security/safety";
import { computeConfidence } from "@/lib/ai/confidence";
import { mockAuthContext } from "../fixtures/tripFixtures";

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/ai/itinerary-flow/research", {
        method: "POST", body: "{}", headers: { "content-type": "application/json" },
    });
}

function makeValidBody() {
    return {
        destination: "Tokyo, Japan", startDate: "2026-07-01",
        endDate: "2026-07-05", durationDays: 5,
        days: [{ day: 1, theme: "Arrival" }, { day: 2, theme: "Temples" }],
    };
}

const MOCK_RESEARCH_RESULT = {
    ...makeValidBody(),
    days: [{ day: 1, theme: "Arrival", activities: [
        { name: "Shinjuku Gyoen", type: "attraction", description: "Garden",
          geoConfidence: "high", lat: 35.685, lng: 139.710 },
    ]}],
    hotels: [
        { name: "Park Hyatt", priceRange: "$$" as const, area: "Shinjuku", tags: [], geoConfidence: "high" },
    ],
    _dataSource: "brightdata" as const,
};

describe("POST /api/ai/itinerary-flow/research — auth", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 401 when no auth token", async () => {
        vi.mocked(getAuthContext).mockReturnValue(null);
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
    });
});

describe("POST /api/ai/itinerary-flow/research — validation", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 400 on Zod failure", async () => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({
            ok: false,
            response: new Response(
                JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR" } }),
                { status: 400, headers: { "content-type": "application/json" } }
            ) as never,
        });
        const res = await POST(makeRequest());
        expect(res.status).toBe(400);
    });
});

describe("POST /api/ai/itinerary-flow/research — success", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({ ok: true, data: makeValidBody() as any });
        mockResearchAgentRun.mockResolvedValue(MOCK_RESEARCH_RESULT);
    });

    it("returns 200 with success:true", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("calls validateLLMOutput on result", async () => {
        await POST(makeRequest());
        expect(validateLLMOutput).toHaveBeenCalledWith(expect.any(String), "json");
    });

    it("calls computeConfidence with LLM_GROUNDED when brightdata used", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "LLM_GROUNDED" }),
        );
    });
});

describe("POST /api/ai/itinerary-flow/research — errors", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({ ok: true, data: makeValidBody() as any });
    });

    it("returns error when ResearchAgent.run throws", async () => {
        mockResearchAgentRun.mockRejectedValue(new Error("Research failed"));
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(body.success).toBe(false);
    });
});
