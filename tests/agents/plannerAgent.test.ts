/**
 * tests/agents/plannerAgent.test.ts
 *
 * Unit tests for the Planner Agent production path.
 *
 * Coverage targets:
 *  - normalizeDestination  (exported pure fn) — vague inputs, acronyms, capitalization
 *  - safeDateParsing       (exported pure fn) — valid ISO, invalid, undefined
 *  - PlannerAgent.run()    — happy path, JSON repair, double-failure error
 *  - validateAndNormalize  — exercised via run(): duration clamping, date consistency,
 *                            preference normalization, duplicate theme de-dup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock infrastructure BEFORE any agent import ───────────────────────────────

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    trunc: vi.fn().mockImplementation((s: string) => (s ?? "").substring(0, 80)),
}));

vi.mock("@/lib/ai/llm", () => {
    class AIServiceError extends Error {
        constructor(
            public readonly code: string,
            message: string,
            public readonly details?: unknown,
        ) {
            super(message);
            this.name = "AIServiceError";
        }
    }
    return {
        AIServiceError,
        LLMClientFactory: { create: vi.fn() },
        executeWithRetry: vi.fn(),
        parseJSONResponse: vi.fn().mockImplementation((t: string) => JSON.parse(t)),
    };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
    normalizeDestination,
    safeDateParsing,
    PlannerAgent,
} from "@/agents/planner/plannerAgent";
import { AIServiceError } from "@/lib/ai/llm";
import type { LLMClient } from "@/lib/ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// normalizeDestination — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeDestination", () => {
    it("returns 'Top Travel Destination' for vague input 'somewhere'", () => {
        expect(normalizeDestination("somewhere")).toBe("Top Travel Destination");
    });

    it("returns 'Top Travel Destination' for all registered vague terms", () => {
        const vague = ["somewhere", "anywhere", "nearby", "near airport", "unknown", "here", "there", "location", "place", "destination"];
        vague.forEach((term) => {
            expect(normalizeDestination(term)).toBe("Top Travel Destination");
        });
    });

    it("vague match is case-insensitive", () => {
        expect(normalizeDestination("Somewhere")).toBe("Top Travel Destination");
        expect(normalizeDestination("ANYWHERE")).toBe("Top Travel Destination");
    });

    it("capitalizes each word", () => {
        expect(normalizeDestination("paris, france")).toBe("Paris, France");
    });

    it("preserves all-uppercase acronyms (2–4 letters)", () => {
        expect(normalizeDestination("NYC, USA")).toBe("NYC, USA");
        expect(normalizeDestination("UAE")).toBe("UAE");
        expect(normalizeDestination("UK travel")).toBe("UK Travel");
    });

    it("normalizes comma spacing — always adds a space after comma", () => {
        // The normalizer replaces /\s*,\s*/ with ", " so bare commas get a space.
        expect(normalizeDestination("tokyo,japan")).toBe("Tokyo, Japan");
        expect(normalizeDestination("tokyo , japan")).toBe("Tokyo, Japan");
    });

    it("collapses multiple spaces", () => {
        expect(normalizeDestination("new   york")).toBe("New York");
    });

    it("trims leading and trailing whitespace", () => {
        expect(normalizeDestination("  London  ")).toBe("London");
    });

    it("handles mixed case correctly", () => {
        expect(normalizeDestination("bUENOS AIRES")).toBe("Buenos Aires");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeDateParsing — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe("safeDateParsing", () => {
    it("returns ISO date string for a valid date", () => {
        expect(safeDateParsing("2026-05-15")).toBe("2026-05-15");
    });

    it("returns null for an invalid date string", () => {
        expect(safeDateParsing("not-a-date")).toBeNull();
    });

    it("returns null for undefined", () => {
        expect(safeDateParsing(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(safeDateParsing("")).toBeNull();
    });

    it("parses a natural language date that JS can handle", () => {
        const result = safeDateParsing("2026-12-25");
        expect(result).toBe("2026-12-25");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal valid planner output that validateAndNormalize can accept. */
function makePlannerOutput(overrides: Record<string, unknown> = {}) {
    return {
        destination: "Tokyo, Japan",
        startDate: "2026-06-01",
        endDate: "2026-06-04",
        durationDays: 4,
        preferences: { budget: 2000, style: "balanced", pace: "moderate" },
        days: [
            { day: 1, theme: "Arrival & Orientation" },
            { day: 2, theme: "Culture & Landmarks" },
            { day: 3, theme: "Local Life & Markets" },
            { day: 4, theme: "Farewell" },
        ],
        ...overrides,
    };
}

/** Creates a mock LLM client with a pre-configured execute stub. */
function makeMockClient(responses: Array<{ content: string } | Error>): LLMClient {
    let callCount = 0;
    return {
        execute: vi.fn().mockImplementation(() => {
            const resp = responses[callCount++] ?? responses[responses.length - 1];
            if (resp instanceof Error) return Promise.reject(resp);
            return Promise.resolve({ content: resp.content, latencyMs: 50, model: "test", provider: "gemini", tokens: { prompt: 0, completion: 0, total: 0 } });
        }),
    } as unknown as LLMClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// PlannerAgent.run() — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("PlannerAgent.run() — happy path", () => {
    it("returns a valid TripContext when LLM returns well-formed JSON", async () => {
        const output = makePlannerOutput();
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("4-day trip to Tokyo, balanced pace, $2000 budget");
        expect(result.destination).toBe("Tokyo, Japan");
        expect(result.durationDays).toBe(4);
        expect(result.days).toHaveLength(4);
        expect(result.preferences?.budget).toBe(2000);
        expect(result.preferences?.style).toBe("balanced");
        expect(result.preferences?.pace).toBe("moderate");
    });

    it("normalizes destination via normalizeDestination", async () => {
        const output = makePlannerOutput({ destination: "new york city" });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("trip to new york");
        expect(result.destination).toBe("New York City");
    });

    it("clamps durationDays to [1, 14]", async () => {
        const tooLong = makePlannerOutput({ durationDays: 30, days: Array.from({ length: 14 }, (_, i) => ({ day: i + 1, theme: `Day ${i + 1}` })) });
        const client = makeMockClient([{ content: JSON.stringify(tooLong) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("month-long trip");
        expect(result.durationDays).toBeLessThanOrEqual(14);
    });

    it("uses default 4 days when durationDays is 0 or missing", async () => {
        const output = makePlannerOutput({ durationDays: 0, days: [] });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("just a trip");
        expect(result.durationDays).toBe(4);
    });

    it("generates days array equal in length to durationDays", async () => {
        const output = makePlannerOutput({ durationDays: 3, endDate: "2026-06-03", days: [{ day: 1, theme: "A" }, { day: 2, theme: "B" }, { day: 3, theme: "C" }] });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("3 day trip");
        expect(result.days).toHaveLength(3);
        expect(result.days.every((d, i) => d.day === i + 1)).toBe(true);
    });

    it("falls back to generic theme when LLM omits a day", async () => {
        const output = makePlannerOutput({
            durationDays: 3,
            endDate: "2026-06-03",
            days: [{ day: 1, theme: "Arrival & Orientation" }], // days 2 & 3 missing
        });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("3 day trip");
        expect(result.days).toHaveLength(3);
        // day 2 and 3 should have generic themes (not undefined)
        expect(typeof result.days[1].theme).toBe("string");
        expect(result.days[1].theme.length).toBeGreaterThan(0);
    });

    it("de-duplicates day themes", async () => {
        const output = makePlannerOutput({
            durationDays: 3,
            endDate: "2026-06-03",
            days: [
                { day: 1, theme: "Culture & Landmarks" },
                { day: 2, theme: "Culture & Landmarks" }, // duplicate
                { day: 3, theme: "Hidden Gems" },
            ],
        });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("3 day trip");
        const themes = result.days.map((d) => d.theme.toLowerCase());
        const unique = new Set(themes);
        expect(unique.size).toBe(themes.length);
    });

    it("normalizes style synonym 'luxurious' to 'luxury'", async () => {
        const output = makePlannerOutput({ preferences: { style: "luxurious" } });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("luxurious trip");
        expect(result.preferences?.style).toBe("luxury");
    });

    it("normalizes pace synonym 'easy' to 'slow'", async () => {
        const output = makePlannerOutput({ preferences: { pace: "easy" } });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("easy trip");
        expect(result.preferences?.pace).toBe("slow");
    });

    it("drops style if value is invalid (not in VALID_STYLES)", async () => {
        const output = makePlannerOutput({ preferences: { style: "neon-vibes" } });
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("neon trip");
        expect(result.preferences?.style).toBeUndefined();
    });

    it("computes endDate from startDate + durationDays when endDate is absent", async () => {
        const output = { ...makePlannerOutput(), endDate: undefined as unknown as string };
        const client = makeMockClient([{ content: JSON.stringify(output) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("trip");
        expect(result.endDate).toBeTruthy();
        // endDate must be after startDate
        expect(new Date(result.endDate).getTime()).toBeGreaterThan(new Date(result.startDate).getTime());
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlannerAgent.run() — JSON repair path
// ─────────────────────────────────────────────────────────────────────────────

describe("PlannerAgent.run() — JSON repair", () => {
    it("retries with repair prompt when first response is invalid JSON, returns valid result", async () => {
        const { parseJSONResponse: mockParse } = await import("@/lib/ai/llm");
        const parseMock = vi.mocked(mockParse as (...args: unknown[]) => unknown);

        // First call to parseJSONResponse throws; second succeeds.
        const validOutput = makePlannerOutput();
        let parseCallCount = 0;
        parseMock.mockImplementation((text: string) => {
            parseCallCount++;
            if (parseCallCount === 1) throw new SyntaxError("Unexpected token");
            return JSON.parse(text);
        });

        // Both LLM responses return valid JSON strings — only parseJSONResponse differs.
        const client = makeMockClient([
            { content: "```invalid json```" },          // first LLM call (parse fails)
            { content: JSON.stringify(validOutput) },    // repair LLM call (parse succeeds)
        ]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("trip repair test");
        expect(result.destination).toBe("Tokyo, Japan");
        // Client should have been called twice
        expect((client.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    });

    it("throws AIServiceError with SCHEMA_VALIDATION_FAILED when both LLM calls fail JSON parsing", async () => {
        const { parseJSONResponse: mockParse } = await import("@/lib/ai/llm");
        vi.mocked(mockParse as (...args: unknown[]) => unknown).mockImplementation(() => {
            throw new SyntaxError("Always invalid");
        });

        const client = makeMockClient([
            { content: "bad json 1" },
            { content: "bad json 2" },
        ]);
        const agent = new PlannerAgent(client);

        await expect(agent.run("double failure")).rejects.toMatchObject({
            name: "AIServiceError",
            code: "SCHEMA_VALIDATION_FAILED",
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlannerAgent.run() — LLM call failure
// ─────────────────────────────────────────────────────────────────────────────

describe("PlannerAgent.run() — LLM call error propagation", () => {
    afterEach(() => vi.restoreAllMocks());

    it("rethrows AIServiceError from the LLM client unchanged", async () => {
        const llmError = Object.assign(new Error("Model unavailable"), {
            name: "AIServiceError",
            code: "LLM_ERROR",
        });
        const client = makeMockClient([llmError]);
        const agent = new PlannerAgent(client);

        await expect(agent.run("failing trip")).rejects.toMatchObject({
            name: "AIServiceError",
        });
    });

    it("wraps generic Error in AIServiceError", async () => {
        const networkError = new Error("ECONNRESET");
        const client = makeMockClient([networkError]);
        const agent = new PlannerAgent(client);

        await expect(agent.run("network error trip")).rejects.toMatchObject({
            name: "AIServiceError",
            code: "LLM_ERROR",
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlannerAgent.run() — startDate fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("PlannerAgent.run() — date fallback", () => {
    it("uses a start date ~7 days in the future when LLM provides no dates", async () => {
        const { parseJSONResponse: mockParse } = await import("@/lib/ai/llm");
        vi.mocked(mockParse as (...args: unknown[]) => unknown).mockImplementation((text: string) => JSON.parse(text));

        const outputWithoutDates = {
            destination: "Barcelona, Spain",
            durationDays: 3,
            preferences: {},
            days: [
                { day: 1, theme: "Arrival & Orientation" },
                { day: 2, theme: "Culture & Landmarks" },
                { day: 3, theme: "Farewell" },
            ],
        };
        const client = makeMockClient([{ content: JSON.stringify(outputWithoutDates) }]);
        const agent = new PlannerAgent(client);

        const result = await agent.run("3-day Barcelona trip");
        const start = new Date(result.startDate);
        const today = new Date();
        const diffDays = (start.getTime() - today.getTime()) / 86_400_000;
        // Should be close to 7 days (within a 1-day window for CI timing)
        expect(diffDays).toBeGreaterThan(5);
        expect(diffDays).toBeLessThan(10);
    });
});
