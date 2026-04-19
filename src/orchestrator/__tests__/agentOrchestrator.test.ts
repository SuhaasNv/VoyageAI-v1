import { describe, it, expect, vi } from "vitest";
import { AgentOrchestrator } from "../agentOrchestrator";
import type {
    OrchestratorAction,
    OrchestratorResult,
    DecideInput,
    AgentOrchestratorDeps,
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
import type { OptimizedTripContext as LogisticsOptimizedTripContext } from "@/agents/logistics/logisticsAgent";

// ─── Shared fixture factories ─────────────────────────────────────────────────

function makeTripContext(): TripContext {
    return {
        destination: "Tokyo",
        startDate: "2025-04-01",
        endDate: "2025-04-05",
        durationDays: 5,
        preferences: { budget: 500, style: "balanced", pace: "moderate" },
        days: [
            { day: 1, theme: "Arrival" },
            { day: 2, theme: "Culture" },
        ],
    };
}

function makeEnrichedContext(): EnrichedTripContext {
    return {
        ...makeTripContext(),
        days: [
            { day: 1, theme: "Arrival", activities: [] },
            { day: 2, theme: "Culture", activities: [] },
        ],
        hotels: [
            { name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: ["central"] },
        ],
    };
}

function makeLogisticsOptimized(dense = false): LogisticsOptimizedTripContext {
    const e = makeEnrichedContext();
    const activities = dense
        ? Array.from({ length: 5 }, (_, i) => ({
              name: `Activity ${i}`,
              type: "attraction" as const,
              description: "desc",
              timeSlot: "morning" as const,
          }))
        : [];
    return {
        ...e,
        days: [
            { day: 1, theme: "Arrival", activities },
            { day: 2, theme: "Culture", activities: [] },
        ],
        selectedHotel: { name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: [] },
    };
}

function makeOptimizedContext(overBudget = false, dense = false): OptimizedTripContext {
    const activities = dense
        ? Array.from({ length: 5 }, (_, i) => ({
              name: `Activity ${i}`,
              type: "attraction" as const,
              description: "desc",
              timeSlot: "morning" as const,
          }))
        : [];

    return {
        destination: "Tokyo",
        startDate: "2025-04-01",
        endDate: "2025-04-05",
        durationDays: 5,
        preferences: { budget: overBudget ? 100 : 9999, style: "balanced" },
        days: [
            { day: 1, theme: "Arrival", activities },
            { day: 2, theme: "Culture", activities: [] },
        ],
        hotels: [{ name: "Hotel A", priceRange: "$$" as const, area: "Shinjuku", tags: ["central"] }],
        selectedHotel: { name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: [] },
    };
}

function makeSafeContext(overBudget = false, dense = false): SafeTripContext {
    return {
        ...makeBudgeted(overBudget, dense),
        safety: { riskLevel: "low", warnings: [], tips: [] },
    };
}

function makeBudgeted(overBudget = false, dense = false): BudgetedTripContext {
    const opt = makeOptimizedContext(overBudget, dense);
    const total = overBudget ? 9999 : 400;
    return {
        ...opt,
        budget: {
            totalEstimatedCost: total,
            costPerDay: [200, 200],
            isOverBudget: overBudget,
            ledger: [
                { day: 1, category: "hotel", name: "Hotel A", amount: 100, meta: { source: "fallback" } },
                { day: 2, category: "hotel", name: "Hotel A", amount: 100, meta: { source: "fallback" } },
            ],
            costBreakdown: {
                perDay: [200, 200],
                total,
                categories: { hotel: 200, food: 0, activity: 0, other: 0 },
            },
        },
    };
}

// ─── Mock builder ─────────────────────────────────────────────────────────────

function buildDeps(opts: {
    plannerResult?: TripContext | Error;
    researchResult?: EnrichedTripContext | Error;
    logisticsResult?: LogisticsOptimizedTripContext | Error;
    budgetResults?: Array<BudgetedTripContext | Error>;
    safetyResults?: Array<SafeTripContext | Error>;
    decisions?: OrchestratorAction[];
}): AgentOrchestratorDeps {
    const {
        plannerResult = makeTripContext(),
        researchResult = makeEnrichedContext(),
        logisticsResult = makeLogisticsOptimized(),
        budgetResults = [],
        safetyResults = [],
        decisions = [],
    } = opts;

    let budgetCallCount = 0;
    let safetyCallCount = 0;
    let decisionCallCount = 0;

    const planner = {
        run: vi.fn().mockImplementation(() =>
            plannerResult instanceof Error ? Promise.reject(plannerResult) : Promise.resolve(plannerResult),
        ),
    } as unknown as PlannerAgent;

    const research = {
        run: vi.fn().mockImplementation(() =>
            researchResult instanceof Error ? Promise.reject(researchResult) : Promise.resolve(researchResult),
        ),
    } as unknown as ResearchAgent;

    const logistics = {
        run: vi.fn().mockImplementation(() =>
            logisticsResult instanceof Error ? Promise.reject(logisticsResult) : Promise.resolve(logisticsResult),
        ),
    } as unknown as LogisticsAgent;

    const budget = {
        run: vi.fn().mockImplementation(() => {
            const r = budgetResults[budgetCallCount] ?? makeBudgeted();
            budgetCallCount += 1;
            return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
        }),
    } as unknown as BudgetAgent;

    const safety = {
        run: vi.fn().mockImplementation(() => {
            const r = safetyResults[safetyCallCount] ?? makeSafeContext();
            safetyCallCount += 1;
            return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
        }),
    } as unknown as SafetyAgent;

    const decideNextAction = vi.fn().mockImplementation((input: DecideInput) => {
        void input;
        const a: OrchestratorAction = decisions[decisionCallCount] ?? "reoptimize_budget";
        decisionCallCount += 1;
        return Promise.resolve({ action: a });
    });

    return { planner, research, logistics, budget, safety, decideNextAction };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentOrchestrator", () => {
    it("happy path: returns ok=true when no issues arise", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(false, false)],
        });
        const orch = new AgentOrchestrator(deps);
        const result = await orch.run("Trip to Tokyo for 5 days") as OrchestratorResult;

        expect(result).toMatchObject({ ok: true, requiresHuman: false });
        expect(deps.decideNextAction).not.toHaveBeenCalled();
        expect(orch.executionLog.some((e) => "agent" in e && e.agent === "planner")).toBe(true);
    });

    it("executes deterministic pipeline in order", async () => {
        const order: string[] = [];
        const deps = buildDeps({ safetyResults: [makeSafeContext()] });

        vi.mocked(deps.planner!.run).mockImplementation(async () => {
            order.push("planner");
            return makeTripContext();
        });
        vi.mocked(deps.research!.run).mockImplementation(async () => {
            order.push("research");
            return makeEnrichedContext();
        });
        vi.mocked(deps.logistics!.run).mockImplementation(async () => {
            order.push("logistics");
            return makeLogisticsOptimized();
        });
        vi.mocked(deps.budget!.run).mockImplementation(async () => {
            order.push("budget");
            return makeBudgeted();
        });
        vi.mocked(deps.safety!.run).mockImplementation(async () => {
            order.push("safety");
            return makeSafeContext();
        });

        await new AgentOrchestrator(deps).run("trip");

        expect(order).toEqual(["planner", "research", "logistics", "budget", "safety"]);
    });

    it("over_budget: LLM chooses reoptimize_budget, loop resolves on second pass", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(true), makeSafeContext(false)],
            decisions: ["reoptimize_budget"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: true, requiresHuman: false });
        expect(deps.decideNextAction).toHaveBeenCalledOnce();
        const logDecision = (new AgentOrchestrator(deps).executionLog); // new instance has empty log; check via result shape
        void logDecision; // just confirming types
    });

    it("too_dense: LLM chooses rerun_logistics, loop resolves on second pass", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(false, true), makeSafeContext(false, false)],
            decisions: ["rerun_logistics"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: true, requiresHuman: false });
        expect(deps.logistics!.run).toHaveBeenCalledTimes(2);
    });

    it("ask_user: LLM decision triggers immediate human-in-the-loop return", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(true)],
            decisions: ["ask_user"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({
            requiresHuman: true,
            message: "Trip needs adjustment. Proceed or optimize?",
        });
    });

    it("proceed: LLM decides to proceed even with budget issue, returns ok=true", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(true)],
            decisions: ["proceed"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: true, requiresHuman: false });
    });

    it("exhausted loop: returns requiresHuman after MAX_ITERATIONS (3) unresolved decisions", async () => {
        const deps = buildDeps({
            // Always over budget, never resolves
            safetyResults: Array.from({ length: 10 }, () => makeSafeContext(true)),
            decisions: ["reoptimize_budget", "reoptimize_budget", "reoptimize_budget"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({
            requiresHuman: true,
            message: "Trip exceeds budget. Optimize or proceed?",
        });
        expect(deps.decideNextAction).toHaveBeenCalledTimes(3);
    });

    it("exhausted loop: contextual message when both budget and dense", async () => {
        const deps = buildDeps({
            safetyResults: Array.from({ length: 10 }, () => makeSafeContext(true, true)),
            decisions: ["reoptimize_budget", "reoptimize_budget", "reoptimize_budget"],
        });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ requiresHuman: true });
        if ("message" in result && typeof result.message === "string") {
            expect(result.message).toContain("budget");
            expect(result.message).toContain("packed");
        }
    });

    it("LLM failure fallback: decision layer throws → defaults to reoptimize_budget", async () => {
        let calls = 0;
        const deps = buildDeps({
            safetyResults: [makeSafeContext(true), makeSafeContext(false)],
        });
        deps.decideNextAction = vi.fn().mockImplementation(async () => {
            calls += 1;
            if (calls === 1) throw new Error("LLM unavailable");
            return { action: "proceed" as OrchestratorAction };
        });

        // First decision throws → fallback to reoptimize_budget → next pass ok
        const result = await new AgentOrchestrator(deps).run("trip");
        expect(result).toMatchObject({ ok: true, requiresHuman: false });
    });

    it("planner failure: returns ok=false with stage=planner", async () => {
        const deps = buildDeps({ plannerResult: new Error("planner error") });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: false, stage: "planner", error: "planner error" });
    });

    it("research failure: returns ok=false with stage=research", async () => {
        const deps = buildDeps({ researchResult: new Error("research error") });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: false, stage: "research", error: "research error" });
    });

    it("logistics failure: returns ok=false with stage=logistics", async () => {
        const deps = buildDeps({ logisticsResult: new Error("logistics error") });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: false, stage: "logistics", error: "logistics error" });
    });

    it("budget failure in first pass: returns ok=false with stage=budget_safety", async () => {
        const deps = buildDeps({ budgetResults: [new Error("budget error")] });
        const result = await new AgentOrchestrator(deps).run("trip");

        expect(result).toMatchObject({ ok: false, stage: "budget_safety" });
    });

    it("executionLog records agent and llm-decision entries in order", async () => {
        const deps = buildDeps({
            safetyResults: [makeSafeContext(true), makeSafeContext(false)],
            decisions: ["reoptimize_budget"],
        });
        const orch = new AgentOrchestrator(deps);
        await orch.run("trip");

        const agentNames = orch.executionLog
            .filter((e): e is Extract<typeof e, { agent: string }> => "agent" in e)
            .map((e) => e.agent);

        expect(agentNames).toContain("planner");
        expect(agentNames).toContain("research");
        expect(agentNames).toContain("logistics");
        expect(agentNames).toContain("budget");
        expect(agentNames).toContain("safety");

        const llmDecisions = orch.executionLog.filter(
            (e): e is Extract<typeof e, { type: string }> => "type" in e && e.type === "llm-decision",
        );
        expect(llmDecisions).toHaveLength(1);
        expect(llmDecisions[0]).toMatchObject({ type: "llm-decision", issue: "over_budget", action: "reoptimize_budget" });
    });

    it("executionLog is reset on each run() call", async () => {
        const deps = buildDeps({ safetyResults: [makeSafeContext(), makeSafeContext()] });
        const orch = new AgentOrchestrator(deps);

        await orch.run("trip");
        const firstRunLength = orch.executionLog.length;

        await orch.run("trip");
        expect(orch.executionLog.length).toBe(firstRunLength);
    });

    it("run() return type is OrchestratorResult (type-level check via assignment)", async () => {
        const deps = buildDeps({ safetyResults: [makeSafeContext()] });
        const orch = new AgentOrchestrator(deps);

        // If this compiles, the return type is correctly typed as OrchestratorResult
        const result: OrchestratorResult = await orch.run("trip");
        expect(result).toBeDefined();
    });
});
