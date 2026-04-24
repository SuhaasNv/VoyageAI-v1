/**
 * tests/agents/budgetAgent.test.ts
 *
 * Unit tests for the Budget Agent production path.
 *
 * Coverage targets:
 *  - applyAdjustment   (exported pure function) — all action branches
 *  - simulateAdjustment (exported pure function)
 *  - applyOptimalPlan  (exported function) — warnings, empty-day guard
 *  - BudgetAgent.run() — cost ledger build, aggregation invariants,
 *                        within-budget, over-budget (LLM suggestions),
 *                        LLM failure graceful degradation
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
        LLMClientFactory: { create: vi.fn().mockReturnValue({ execute: vi.fn() }) },
        executeWithRetry: vi.fn(),
        parseJSONResponse: vi.fn().mockImplementation((text: string) => JSON.parse(text)),
    };
});

vi.mock("@/lib/ai/modelRouter", () => ({
    selectModelConfig: vi.fn().mockReturnValue({
        provider: "gemini",
        model: "gemini-2.5-flash",
        temperature: 0.2,
        maxTokens: 512,
        timeoutMs: 15_000,
    }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
    applyAdjustment,
    simulateAdjustment,
    applyOptimalPlan,
    BudgetAgent,
    type BudgetAdjustment,
    type OptimalPlan,
} from "@/agents/budget/budgetAgent";
import { executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import {
    makeOptimizedContext,
    makeDay,
    makeActivity,
    makeMeal,
    makeHotel,
    makeOverBudgetContext,
    makeWithinBudgetContext,
} from "../fixtures/tripFixtures";

// ─────────────────────────────────────────────────────────────────────────────
// applyAdjustment — pure function, no LLM
// ─────────────────────────────────────────────────────────────────────────────

describe("applyAdjustment — remove_activity", () => {
    it("removes the target activity matched by activityId", () => {
        const ctx = makeOptimizedContext({
            days: [
                makeDay(1, [
                    makeActivity({ name: "Museum", id: "act-museum" }),
                    makeActivity({ name: "Park",   id: "act-park" }),
                    makeMeal(),
                ]),
            ],
        });
        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 30,
            description: "Skip Museum",
            action: { type: "remove_activity", payload: { activityId: "act-museum", day: 1 } },
        };

        const result = applyAdjustment(ctx, adj);
        const names = result.days[0].activities.map((a) => a.name);
        expect(names).not.toContain("Museum");
        expect(names).toContain("Park");
        expect(names).toContain("Lunch"); // meal preserved
    });

    it("removes the target activity matched by name when no id", () => {
        const ctx = makeOptimizedContext({
            days: [
                makeDay(1, [
                    makeActivity({ name: "Museum" }),
                    makeActivity({ name: "Park" }),
                    makeMeal(),
                ]),
            ],
        });
        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 30,
            description: "Skip Museum",
            action: { type: "remove_activity", payload: { activityName: "Museum", day: 1 } },
        };

        const result = applyAdjustment(ctx, adj);
        expect(result.days[0].activities.map((a) => a.name)).not.toContain("Museum");
    });

    it("never removes isMeal activities even when name matches", () => {
        const ctx = makeOptimizedContext({
            days: [
                makeDay(1, [
                    makeActivity({ name: "Lunch" }),   // non-meal with same name
                    makeMeal({ name: "Lunch" }),         // actual meal — must be preserved
                ]),
            ],
        });
        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 25,
            description: "Skip Lunch",
            action: { type: "remove_activity", payload: { activityName: "Lunch", day: 1 } },
        };

        const result = applyAdjustment(ctx, adj);
        // The meal entry (isMeal: true) must survive; only the non-meal "Lunch" is removed
        const meals = result.days[0].activities.filter((a) => a.isMeal);
        expect(meals).toHaveLength(1);
    });

    it("does not touch days that don't match the target day", () => {
        const ctx = makeOptimizedContext({
            days: [
                makeDay(1, [makeActivity({ name: "Museum", id: "id-1" })]),
                makeDay(2, [makeActivity({ name: "Museum", id: "id-2" })]),
            ],
            durationDays: 2,
        });
        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 30,
            description: "Remove from day 1",
            action: { type: "remove_activity", payload: { activityId: "id-1", day: 1 } },
        };

        const result = applyAdjustment(ctx, adj);
        expect(result.days[0].activities).toHaveLength(0);
        expect(result.days[1].activities).toHaveLength(1); // day 2 untouched
    });

    it("is a pure function — does not mutate the original context", () => {
        const ctx = makeOptimizedContext({
            days: [makeDay(1, [makeActivity({ name: "Museum", id: "m1" }), makeMeal()])],
        });
        const original = ctx.days[0].activities.length;
        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 30,
            description: "",
            action: { type: "remove_activity", payload: { activityId: "m1", day: 1 } },
        };
        applyAdjustment(ctx, adj);
        expect(ctx.days[0].activities).toHaveLength(original);
    });
});

describe("applyAdjustment — change_hotel", () => {
    it("changes the hotel to the lower tier", () => {
        const ctx = makeOptimizedContext({
            selectedHotel: makeHotel({ priceRange: "$$$", name: "Fancy Hotel ($$$)" }),
        });
        const adj: BudgetAdjustment = {
            type: "hotel_change",
            impact: 200,
            description: "Switch from $$$ to $$",
            action: { type: "change_hotel", payload: { hotelFrom: "$$$", hotelTo: "$$" } },
        };

        const result = applyAdjustment(ctx, adj);
        expect(result.selectedHotel.priceRange).toBe("$$");
        expect(result.selectedHotel.name).toContain("Standard Hotel");
    });

    it("returns context unchanged when hotelTo is missing", () => {
        const ctx = makeOptimizedContext({
            selectedHotel: makeHotel({ priceRange: "$$$" }),
        });
        const adj: BudgetAdjustment = {
            type: "hotel_change",
            impact: 200,
            description: "",
            action: { type: "change_hotel", payload: {} },
        };
        const result = applyAdjustment(ctx, adj);
        expect(result.selectedHotel.priceRange).toBe("$$$");
    });

    it("correctly maps all tier labels", () => {
        const tiers = [
            { priceRange: "$" as const, label: "Budget Hotel" },
            { priceRange: "$$" as const, label: "Standard Hotel" },
            { priceRange: "$$$" as const, label: "Mid-range Hotel" },
            { priceRange: "$$$$" as const, label: "Upscale Hotel" },
        ] as const;

        const ctx = makeOptimizedContext({ selectedHotel: makeHotel({ priceRange: "$$$$" }) });
        for (const { priceRange, label } of tiers) {
            const adj: BudgetAdjustment = {
                type: "hotel_change",
                impact: 100,
                description: "",
                action: { type: "change_hotel", payload: { hotelFrom: "$$$$", hotelTo: priceRange } },
            };
            const result = applyAdjustment(ctx, adj);
            expect(result.selectedHotel.name).toContain(label);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateAdjustment
// ─────────────────────────────────────────────────────────────────────────────

describe("simulateAdjustment", () => {
    it("returns a lower total after removing an expensive activity", () => {
        const ctx = makeOptimizedContext({
            durationDays: 1,
            days: [
                makeDay(1, [
                    makeActivity({ name: "Expensive Tour", estimatedCost: 150, id: "tour-1" }),
                    makeMeal(),
                ]),
            ],
            selectedHotel: makeHotel({ priceRange: "$" }),
            foodCostSummary: { perDay: [30], total: 30, avgPerDay: 30 },
        });

        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 150,
            description: "Skip tour",
            action: { type: "remove_activity", payload: { activityId: "tour-1", day: 1 } },
        };

        const { total: before } = simulateAdjustment(ctx, { ...adj, type: "activity_remove", impact: 0 } as BudgetAdjustment);
        const { total: after } = simulateAdjustment(ctx, adj);
        // After removing the $150 activity the total must be lower
        expect(after).toBeLessThan(
            simulateAdjustment(makeOptimizedContext({
                durationDays: 1,
                days: [makeDay(1, [makeActivity({ name: "Expensive Tour", estimatedCost: 150 }), makeMeal()])],
                selectedHotel: makeHotel({ priceRange: "$" }),
                foodCostSummary: { perDay: [30], total: 30, avgPerDay: 30 },
            }), {
                type: "hotel_change", impact: 0, description: "",
                action: { type: "change_hotel", payload: {} },
            }).total,
        );

        // Sanity: the no-op adjustment keeps the total unchanged
        const noOp: BudgetAdjustment = {
            type: "hotel_change",
            impact: 0,
            description: "",
            action: { type: "change_hotel", payload: {} },
        };
        const { total: noOpTotal } = simulateAdjustment(ctx, noOp);
        expect(after).toBeLessThan(noOpTotal);
    });

    it("returns a consistent breakdown: total equals sum of perDay", () => {
        const ctx = makeOptimizedContext({
            durationDays: 2,
            selectedHotel: makeHotel({ priceRange: "$$" }),
            foodCostSummary: { perDay: [40, 40], total: 80, avgPerDay: 40 },
        });
        const adj: BudgetAdjustment = {
            type: "hotel_change",
            impact: 50,
            description: "",
            action: { type: "change_hotel", payload: { hotelFrom: "$$", hotelTo: "$" } },
        };
        const { total, breakdown } = simulateAdjustment(ctx, adj);
        const sumPerDay = breakdown.perDay.reduce((s, n) => s + n, 0);
        expect(total).toBe(breakdown.total);
        expect(Math.round(sumPerDay)).toBe(Math.round(total));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyOptimalPlan
// ─────────────────────────────────────────────────────────────────────────────

describe("applyOptimalPlan", () => {
    it("applies hotel change and returns updated budget", () => {
        const ctx = makeOptimizedContext({
            durationDays: 2,
            selectedHotel: makeHotel({ priceRange: "$$$", name: "Fancy ($$$)" }),
        });
        const hotelAdj: BudgetAdjustment = {
            type: "hotel_change",
            impact: 200,
            description: "Switch hotel",
            action: { type: "change_hotel", payload: { hotelFrom: "$$$", hotelTo: "$$" } },
        };
        const plan: OptimalPlan = {
            appliedAdjustments: [hotelAdj],
            finalTotal: 300,
            finalBreakdown: { total: 300, perDay: [150, 150], categories: { hotel: 100, food: 80, activity: 80, other: 40 } },
            achieved: true,
        };

        const result = applyOptimalPlan(ctx, plan);
        expect(result.updatedContext.selectedHotel.priceRange).toBe("$$");
        expect(result.warnings).toHaveLength(0);
        expect(result.updatedBudget.total).toBeGreaterThan(0);
    });

    it("emits a warning when an adjustment has no cost effect (no-op)", () => {
        const ctx = makeOptimizedContext({
            durationDays: 1,
            selectedHotel: makeHotel({ priceRange: "$" }),
            days: [makeDay(1, [makeMeal()])], // only a meal, no non-meal activity to remove
            foodCostSummary: { perDay: [25], total: 25, avgPerDay: 25 },
        });

        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 50,
            description: "Skip non-existent tour",
            action: { type: "remove_activity", payload: { activityId: "ghost-id", day: 1 } },
        };
        const plan: OptimalPlan = {
            appliedAdjustments: [adj],
            finalTotal: 500,
            finalBreakdown: { total: 500, perDay: [500], categories: { hotel: 0, food: 25, activity: 0, other: 15 } },
            achieved: false,
        };

        const result = applyOptimalPlan(ctx, plan);
        expect(result.warnings.some((w) => w.includes("no effect"))).toBe(true);
    });

    it("emits a warning when a day ends up with no activities", () => {
        const ctx = makeOptimizedContext({
            durationDays: 1,
            selectedHotel: makeHotel({ priceRange: "$" }),
            days: [makeDay(1, [makeActivity({ name: "Solo Activity", id: "solo-act" })])],
        });

        const adj: BudgetAdjustment = {
            type: "activity_remove",
            impact: 30,
            description: "Skip Solo Activity",
            action: { type: "remove_activity", payload: { activityId: "solo-act", day: 1 } },
        };
        const plan: OptimalPlan = {
            appliedAdjustments: [adj],
            finalTotal: 100,
            finalBreakdown: { total: 100, perDay: [100], categories: { hotel: 50, food: 0, activity: 0, other: 15 } },
            achieved: true,
        };

        const result = applyOptimalPlan(ctx, plan);
        expect(result.warnings.some((w) => w.includes("no activities"))).toBe(true);
    });

    it("is idempotent — same plan applied twice gives same result", () => {
        const ctx = makeOptimizedContext({
            durationDays: 2,
            selectedHotel: makeHotel({ priceRange: "$$$" }),
        });
        const adj: BudgetAdjustment = {
            type: "hotel_change",
            impact: 200,
            description: "",
            action: { type: "change_hotel", payload: { hotelFrom: "$$$", hotelTo: "$$" } },
        };
        const plan: OptimalPlan = {
            appliedAdjustments: [adj],
            finalTotal: 400,
            finalBreakdown: { total: 400, perDay: [200, 200], categories: { hotel: 100, food: 80, activity: 80, other: 40 } },
            achieved: true,
        };

        const r1 = applyOptimalPlan(ctx, plan);
        const r2 = applyOptimalPlan(r1.updatedContext, plan);
        // After the first application hotel is already $$; second attempt is a no-op on hotel cost.
        expect(r2.updatedContext.selectedHotel.priceRange).toBe("$$");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BudgetAgent.run() — deterministic path (no LLM)
// ─────────────────────────────────────────────────────────────────────────────

describe("BudgetAgent.run() — deterministic cost ledger", () => {
    const agent = new BudgetAgent();

    it("total === sum of costPerDay (invariant)", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-1");
        const sumPerDay = result.budget.costPerDay.reduce((s, n) => s + n, 0);
        expect(result.budget.totalEstimatedCost).toBe(sumPerDay);
    });

    it("total === sum of category costs (invariant)", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-2");
        const { hotel, food, activity, other } = result.budget.costBreakdown.categories;
        expect(result.budget.totalEstimatedCost).toBe(hotel + food + activity + other);
    });

    it("total === sum of ledger amounts (invariant)", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-3");
        const ledgerSum = result.budget.ledger.reduce((s, i) => s + i.amount, 0);
        expect(result.budget.totalEstimatedCost).toBe(ledgerSum);
    });

    it("hotel category cost equals (durationDays - 1) nights × nightly rate", async () => {
        const ctx = makeOptimizedContext({
            durationDays: 3,
            selectedHotel: makeHotel({ priceRange: "$$" }),      // $100/night
            preferences: {},
        });
        const result = await agent.run(ctx, "req-4");
        // 2 nights × $100 = $200
        expect(result.budget.costBreakdown.categories.hotel).toBe(200);
    });

    it("uses foodCostSummary verbatim when present", async () => {
        const ctx = makeOptimizedContext({
            durationDays: 3,
            selectedHotel: makeHotel({ priceRange: "$" }),
            foodCostSummary: { perDay: [50, 60, 70], total: 180, avgPerDay: 60 },
        });
        const result = await agent.run(ctx, "req-5");
        expect(result.budget.costBreakdown.categories.food).toBe(180);
    });

    it("excludes isMeal activities from the activity category", async () => {
        const ctx = makeOptimizedContext({
            durationDays: 1,
            days: [
                makeDay(1, [
                    makeActivity({ name: "Tour", estimatedCost: 50 }),
                    makeMeal({ name: "Lunch", estimatedCost: 30 }), // isMeal — must NOT go into activity
                ]),
            ],
            selectedHotel: makeHotel({ priceRange: "$" }),
            // No foodCostSummary → food comes from isMeal activities
        });
        const result = await agent.run(ctx, "req-6");
        // Tour ($50) + Transport ($15) = activity + other; food = $30
        expect(result.budget.costBreakdown.categories.activity).toBe(50);
        expect(result.budget.costBreakdown.categories.food).toBe(30);
    });

    it("costPerDay array length equals durationDays", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-7");
        expect(result.budget.costPerDay).toHaveLength(ctx.durationDays);
    });

    it("adds per-day transport cost for each day", async () => {
        const ctx = makeOptimizedContext({
            durationDays: 3,
            days: [makeDay(1, []), makeDay(2, []), makeDay(3, [])],
            selectedHotel: makeHotel({ priceRange: "$" }),
            preferences: {},
        });
        const result = await agent.run(ctx, "req-8");
        // Transport is $15/day = $45 for 3 days
        expect(result.budget.costBreakdown.categories.other).toBe(45);
    });

    it("produces no budgetAnalysis when preferences.budget is absent", async () => {
        const ctx = makeOptimizedContext({ preferences: {} });
        const result = await agent.run(ctx, "req-9");
        expect(result.budget.budgetAnalysis).toBeUndefined();
        expect(result.budget.isOverBudget).toBe(false);
    });

    it("isOverBudget is false when within budget", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-10");
        expect(result.budget.isOverBudget).toBe(false);
        expect(result.budget.budgetGap).toBeUndefined();
    });

    it("budgetAnalysis.delta <= 0 when within budget", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-11");
        expect(result.budget.budgetAnalysis?.delta).toBeLessThanOrEqual(0);
        expect(result.budget.budgetAnalysis?.suggestions).toHaveLength(0);
    });

    it("preserves all original context fields in output", async () => {
        const ctx = makeWithinBudgetContext();
        const result = await agent.run(ctx, "req-12");
        expect(result.destination).toBe(ctx.destination);
        expect(result.durationDays).toBe(ctx.durationDays);
        expect(result.days).toBe(ctx.days);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BudgetAgent.run() — over-budget path (with LLM)
// ─────────────────────────────────────────────────────────────────────────────

describe("BudgetAgent.run() — over-budget path", () => {
    const agent = new BudgetAgent();

    beforeEach(() => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: '{"suggestions":["Switch to a cheaper hotel","Skip the museum"]}',
            latencyMs: 120,
            model: "gemini-2.5-flash",
            provider: "gemini",
            tokens: { prompt: 200, completion: 40, total: 240 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({
            suggestions: ["Switch to a cheaper hotel", "Skip the museum"],
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("isOverBudget is true when total exceeds user budget", async () => {
        const ctx = makeOverBudgetContext(); // $$$ hotel, budget $100
        const result = await agent.run(ctx, "req-ob-1");
        expect(result.budget.isOverBudget).toBe(true);
    });

    it("budgetGap is a positive number equal to total - budget", async () => {
        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-ob-2");
        const expected = result.budget.totalEstimatedCost - (ctx.preferences?.budget ?? 0);
        expect(result.budget.budgetGap).toBe(expected);
        expect(result.budget.budgetGap).toBeGreaterThan(0);
    });

    it("budgetAnalysis.delta equals totalEstimatedCost - userBudget", async () => {
        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-ob-3");
        const delta = result.budget.totalEstimatedCost - (ctx.preferences!.budget!);
        expect(result.budget.budgetAnalysis?.delta).toBe(delta);
    });

    it("budgetAnalysis.suggestions contains at least one adjustment", async () => {
        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-ob-4");
        expect(result.budget.budgetAnalysis?.suggestions.length).toBeGreaterThan(0);
    });

    it("LLM-rephrased suggestions are surfaced in budget.suggestions", async () => {
        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-ob-5");
        expect(result.budget.suggestions).toEqual(
            expect.arrayContaining(["Switch to a cheaper hotel"]),
        );
    });

    it("optimalPlan is present when over budget and adjustments exist", async () => {
        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-ob-6");
        // optimalPlan may or may not achieve budget — it exists
        expect(result.budget.budgetAnalysis?.optimalPlan).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BudgetAgent.run() — LLM failure graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

describe("BudgetAgent.run() — LLM failure graceful degradation", () => {
    const agent = new BudgetAgent();

    afterEach(() => vi.restoreAllMocks());

    it("returns valid budget result even when LLM throws", async () => {
        vi.mocked(executeWithRetry).mockRejectedValue(new Error("LLM timeout"));

        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-fail-1");

        // Numeric output must still be correct
        expect(result.budget.totalEstimatedCost).toBeGreaterThan(0);
        expect(result.budget.isOverBudget).toBe(true);
        // suggestions undefined (LLM failed) — not null, not empty array
        expect(result.budget.suggestions).toBeUndefined();
    });

    it("returns valid budget result when LLM returns malformed JSON", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: "not-json",
            latencyMs: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue(null);

        const ctx = makeOverBudgetContext();
        const result = await agent.run(ctx, "req-fail-2");
        expect(result.budget.totalEstimatedCost).toBeGreaterThan(0);
        expect(result.budget.suggestions).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic hotel-tier rule (hotel share > 50%)
// ─────────────────────────────────────────────────────────────────────────────

describe("BudgetAgent.run() — Rule 1: hotel share adjustment", () => {
    const agent = new BudgetAgent();

    beforeEach(() => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: '{"suggestions":[]}',
            latencyMs: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ suggestions: [] });
    });

    afterEach(() => vi.restoreAllMocks());

    it("includes a hotel tier downgrade suggestion when hotel share > 50%", async () => {
        // $$$$ hotel: 2 nights × $400 = $800
        // With modest activity/food the hotel share will be > 50%
        const ctx = makeOptimizedContext({
            durationDays: 3,
            selectedHotel: makeHotel({ priceRange: "$$$$", name: "Luxury ($$$$)" }),
            preferences: { budget: 50 }, // force over-budget
            foodCostSummary: { perDay: [30, 30, 30], total: 90, avgPerDay: 30 },
        });

        const result = await agent.run(ctx, "req-hotel-rule");
        const hotelSuggestion = result.budget.budgetAnalysis?.suggestions.find(
            (s) => s.type === "hotel_change",
        );
        expect(hotelSuggestion).toBeDefined();
        expect(hotelSuggestion?.action.payload.hotelTo).toBe("$$$");
    });
});
