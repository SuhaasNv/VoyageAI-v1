/**
 * tests/api/logistics-route.test.ts
 *
 * Integration tests for POST /api/ai/itinerary-flow/logistics
 * Uses vi.hoisted() for reliable mock references.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockLogisticsAgentRun } = vi.hoisted(() => ({
    mockLogisticsAgentRun: vi.fn(),
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
    getRequestPathname: vi.fn().mockReturnValue("/api/ai/itinerary-flow/logistics"),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
    validateBody:   vi.fn(),
    getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
    getBearerToken: vi.fn(),
}));

vi.mock("@/agents/logistics/logisticsAgent", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LogisticsAgent: vi.fn(function (this: any) { this.run = mockLogisticsAgentRun; }),
}));

vi.mock("@/lib/ai/explainability", () => ({
    formatAIResponse: vi.fn().mockImplementation((data: unknown) => data),
}));

vi.mock("@/lib/ai/confidence", () => ({
    computeConfidence: vi.fn().mockReturnValue(1.0),
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

import { POST } from "@/app/api/ai/itinerary-flow/logistics/route";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { computeConfidence } from "@/lib/ai/confidence";
import { mockAuthContext } from "../fixtures/tripFixtures";

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/ai/itinerary-flow/logistics", {
        method: "POST", body: "{}", headers: { "content-type": "application/json" },
    });
}

function makeValidBody() {
    return {
        destination: "Paris, France",
        startDate:   "2026-08-01",
        endDate:     "2026-08-03",
        durationDays: 3,
        days: [{ day: 1, theme: "Arrival", activities: [
            { name: "Eiffel Tower", type: "attraction", description: "Landmark" },
        ]}],
        hotels: [
            { name: "Hotel Paris", priceRange: "$$" as const, area: "Centre", tags: [] },
        ],
    };
}

const MOCK_LOGISTICS_RESULT = {
    ...makeValidBody(),
    days: [{ day: 1, theme: "Arrival", activities: [
        { name: "Eiffel Tower", type: "attraction", description: "Landmark",
          timeSlot: "morning", startTime: "09:15", endTime: "11:15",
          travelTimeFromPrevMs: 900000 },
    ]}],
    selectedHotel: { name: "Hotel Paris", priceRange: "$$" as const, area: "Centre", tags: [] },
    foodCostSummary: { perDay: [20, 20, 20], total: 60, avgPerDay: 20 },
    warnings: [] as string[],
};

describe("POST /api/ai/itinerary-flow/logistics — auth", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns 401 when no auth token", async () => {
        vi.mocked(getAuthContext).mockReturnValue(null);
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
    });
});

describe("POST /api/ai/itinerary-flow/logistics — validation", () => {
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

describe("POST /api/ai/itinerary-flow/logistics — success", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({ ok: true, data: makeValidBody() as any });
        mockLogisticsAgentRun.mockResolvedValue(MOCK_LOGISTICS_RESULT);
    });

    it("returns 200 with success:true", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("response data contains days with scheduled activities", async () => {
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(body.data.days[0].activities[0].timeSlot).toBe("morning");
    });

    it("uses DETERMINISTIC confidence mode", async () => {
        await POST(makeRequest());
        expect(computeConfidence).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "DETERMINISTIC" }),
        );
    });
});

describe("POST /api/ai/itinerary-flow/logistics — errors", () => {
    afterEach(() => vi.clearAllMocks());

    beforeEach(() => {
        vi.mocked(getAuthContext).mockReturnValue(mockAuthContext());
        vi.mocked(validateBody).mockResolvedValue({ ok: true, data: makeValidBody() as any });
    });

    it("returns error when LogisticsAgent.run throws", async () => {
        mockLogisticsAgentRun.mockRejectedValue(new Error("Mapbox unavailable"));
        const res  = await POST(makeRequest());
        const body = await res.json();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(body.success).toBe(false);
    });
});
