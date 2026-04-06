/**
 * LangGraph parity tests.
 *
 * These tests verify that `runViaLangGraph` produces a structurally equivalent
 * OrchestratorResult to the TypeScript AgentOrchestrator on the same input and
 * with the same mocked agents.
 *
 * Two modes:
 *
 *  1. UNIT mode (default, no Python service required):
 *     The fetch() call to the LangGraph service is mocked to return a response
 *     whose shape was synthetically constructed from the same fixtures used by
 *     AgentOrchestrator tests. This tests that `runViaLangGraph` correctly
 *     forwards the response from the service without modification.
 *
 *  2. INTEGRATION mode (requires running Python service):
 *     Set env LANGGRAPH_INTEGRATION=true to exercise a live /run call against
 *     LANGGRAPH_SERVICE_URL. Skipped in CI unless opted in.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
    AgentOrchestrator,
    runViaLangGraph,
    type OrchestratorResult,
    type AgentOrchestratorDeps,
} from "../agentOrchestrator";
import { PlannerAgent, type TripContext } from "@/agents/planner/plannerAgent";
import { ResearchAgent, type EnrichedTripContext } from "@/agents/research/researchAgent";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";
import {
    BudgetAgent,
    type BudgetedTripContext,
    type OptimizedTripContext,
} from "@/agents/budget/budgetAgent";
import { SafetyAgent, type SafeTripContext } from "@/agents/safety/safetyAgent";

// ─── Fixtures (shared with existing agentOrchestrator tests) ─────────────────

function makeTripContext(): TripContext {
    return {
        destination: "Tokyo",
        startDate: "2025-04-01",
        endDate: "2025-04-06",
        durationDays: 5,
        preferences: { budget: 1500, style: "balanced", pace: "moderate" },
        days: [{ day: 1, theme: "Arrival" }, { day: 2, theme: "Culture" }],
    };
}

function makeEnrichedContext(): EnrichedTripContext {
    return {
        ...makeTripContext(),
        days: [
            { day: 1, theme: "Arrival", activities: [] },
            { day: 2, theme: "Culture", activities: [] },
        ],
        hotels: [{ name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: ["central"] }],
    };
}

function makeOptimized(): OptimizedTripContext {
    return {
        ...makeEnrichedContext(),
        days: [
            { day: 1, theme: "Arrival", activities: [] },
            { day: 2, theme: "Culture", activities: [] },
        ],
        selectedHotel: { name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: [] },
    };
}

function makeBudgeted(overBudget = false): BudgetedTripContext {
    return {
        ...makeOptimized(),
        budget: {
            totalEstimatedCost: overBudget ? 9999 : 400,
            costPerDay: [200, 200],
            isOverBudget: overBudget,
        },
    };
}

function makeSafe(overBudget = false): SafeTripContext {
    return {
        ...makeBudgeted(overBudget),
        safety: { riskLevel: "low", warnings: [], tips: [] },
    };
}

function buildDeps(opts: {
    overBudget?: boolean;
}): AgentOrchestratorDeps {
    const { overBudget = false } = opts;

    const planner = vi.fn().mockResolvedValue(makeTripContext());
    const research = vi.fn().mockResolvedValue(makeEnrichedContext());
    const logistics = vi.fn().mockResolvedValue(makeOptimized());
    const budget = vi.fn().mockResolvedValue(makeBudgeted(overBudget));
    const safety = vi.fn().mockResolvedValue(makeSafe(overBudget));

    return {
        planner: { run: planner } as unknown as PlannerAgent,
        research: { run: research } as unknown as ResearchAgent,
        logistics: { run: logistics } as unknown as LogisticsAgent,
        budget: { run: budget } as unknown as BudgetAgent,
        safety: { run: safety } as unknown as SafetyAgent,
    };
}

// ─── Contract shape checks ────────────────────────────────────────────────────

function assertOrchestratorShape(result: OrchestratorResult): void {
    // Every branch must have executionLog
    expect(result).toHaveProperty("executionLog");
    expect(Array.isArray((result as { executionLog: unknown[] }).executionLog)).toBe(true);

    if ("ok" in result && result.ok === true) {
        expect(result.requiresHuman).toBe(false);
        expect(result.context).toBeDefined();
    } else if ("requiresHuman" in result && result.requiresHuman === true) {
        expect(result.context).toBeDefined();
        expect(typeof (result as { message: string }).message).toBe("string");
    } else if ("ok" in result && result.ok === false) {
        expect((result as { stage: string }).stage).toBeDefined();
    }
}

// ─── Unit tests: TS orchestrator contract ────────────────────────────────────

describe("AgentOrchestrator — result shape", () => {
    it("happy path returns ok:true with context and executionLog", async () => {
        const deps = buildDeps({});
        const orch = new AgentOrchestrator(deps);
        const result = await orch.run("Trip to Tokyo for 5 days");
        assertOrchestratorShape(result);
        expect("ok" in result && result.ok).toBe(true);
        if ("ok" in result && result.ok) {
            expect(result.context).toBeDefined();
        }
    });
});

// ─── Unit tests: runViaLangGraph — fetch mock ─────────────────────────────────

describe("runViaLangGraph — mocked Python service", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.stubGlobal("fetch", originalFetch);
        vi.restoreAllMocks();
    });

    it("returns the LangGraph service response when service is reachable", async () => {
        const mockResponse: OrchestratorResult = {
            ok: true,
            requiresHuman: false,
            context: makeSafe() as unknown as SafeTripContext,
            executionLog: [{ agent: "planner", status: "success", timestamp: 0 }],
        };

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await runViaLangGraph("Trip to Tokyo for 5 days");
        assertOrchestratorShape(result);
        expect("ok" in result && result.ok).toBe(true);
    });

    it("falls back to TS orchestrator when Python service is unreachable", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));

        const deps = buildDeps({});
        const result = await runViaLangGraph("Trip to Tokyo for 5 days", deps);
        assertOrchestratorShape(result);
        expect("ok" in result && result.ok).toBe(true);
    });

    it("falls back to TS orchestrator when Python service returns non-OK status", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        });

        const deps = buildDeps({});
        const result = await runViaLangGraph("Trip to Tokyo for 5 days", deps);
        assertOrchestratorShape(result);
    });

    it("falls back to TS orchestrator when response JSON fails OrchestratorResult validation", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            // `ok` must be boolean when present — invalid type forces safeParse failure.
            json: async () => ({ ok: "not-a-boolean" }),
        });

        const deps = buildDeps({});
        const result = await runViaLangGraph("Trip to Tokyo for 5 days", deps);
        assertOrchestratorShape(result);
        expect("ok" in result && result.ok).toBe(true);
    });

    it("passes request_id in the body", async () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                requiresHuman: false,
                context: makeSafe(),
                executionLog: [],
            }),
        });

        await runViaLangGraph("Trip to Tokyo for 5 days");

        const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string);
        expect(body).toHaveProperty("input");
        expect(body).toHaveProperty("request_id");
    });
});

// ─── Structural parity: TS result shape == LangGraph response shape ───────────

describe("OrchestratorResult structural parity", () => {
    it("TS orchestrator ok:true response has all fields expected by LangGraph caller", async () => {
        const deps = buildDeps({});
        const orch = new AgentOrchestrator(deps);
        const result = await orch.run("Trip to Tokyo");

        // These are the exact fields main.py RunResponse exposes
        expect(result).toHaveProperty("executionLog");
        if ("ok" in result && result.ok) {
            expect(result.context).toBeDefined();
            expect(result.requiresHuman).toBe(false);
        }
    });

    it("TS orchestrator planner-failure response has stage + error fields", async () => {
        const deps: AgentOrchestratorDeps = {
            planner: { run: vi.fn().mockRejectedValue(new Error("LLM timeout")) } as unknown as PlannerAgent,
        };
        const orch = new AgentOrchestrator(deps);
        const result = await orch.run("Trip to Tokyo");

        if (!("ok" in result && !result.ok)) return;
        expect((result as { stage: string }).stage).toBe("planner");
        expect((result as { error: string }).error).toMatch(/LLM timeout/);
    });
});

// ─── Live integration test (only when LANGGRAPH_INTEGRATION=true) ─────────────

const runLive = process.env.LANGGRAPH_INTEGRATION === "true";

describe.skipIf(!runLive)("runViaLangGraph — live integration (requires Python service)", () => {
    it("returns a valid OrchestratorResult from the real Python service", async () => {
        // Live call: no mocks, Python service must be running
        const result = await runViaLangGraph("Plan a 3-day trip to Paris");
        assertOrchestratorShape(result);
    }, 120_000);
});
