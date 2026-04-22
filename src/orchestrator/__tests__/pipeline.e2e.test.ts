/**
 * End-to-end pipeline integration test
 *
 * Validates the complete Planner → Research → Logistics → Budget → Safety
 * pipeline using realistic fixture data and mock agent implementations.
 *
 * What this test proves:
 *   1. Data flows correctly through all 5 stages (no silent drops / rewrites).
 *   2. Each stage's output satisfies the structural contract expected by the
 *      next stage (correct types, no null/undefined on required fields).
 *   3. The final SafeTripContext is complete and demo-safe.
 *   4. The execution log records every stage in the correct order.
 *
 * Run: npm test -- src/orchestrator/__tests__/pipeline.e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentOrchestrator, type OrchestratorResult } from "../agentOrchestrator";
import type { PlannerAgent, TripContext } from "@/agents/planner/plannerAgent";
import type { ResearchAgent, EnrichedTripContext } from "@/agents/research/researchAgent";
import type { LogisticsAgent, OptimizedTripContext } from "@/agents/logistics/logisticsAgent";
import type { BudgetAgent, BudgetedTripContext } from "@/agents/budget/budgetAgent";
import type { SafetyAgent, SafeTripContext } from "@/agents/safety/safetyAgent";

// ─── Realistic mock payload (3-day Bali trip) ─────────────────────────────────
//
// Each fixture is deliberately "full" — not minimal — so the test catches any
// field access in the real agent contract code rather than silently passing with
// undefined values.

const MOCK_PLANNER_OUTPUT: TripContext = {
    destination: "Bali, Indonesia",
    startDate: "2025-08-01",
    endDate: "2025-08-03",
    durationDays: 3,
    preferences: { budget: 1500, style: "balanced", pace: "moderate" },
    days: [
        { day: 1, theme: "Arrival & Beach" },
        { day: 2, theme: "Temple & Culture" },
        { day: 3, theme: "Adventure & Spa" },
    ],
};

const MOCK_RESEARCH_OUTPUT: EnrichedTripContext = {
    ...MOCK_PLANNER_OUTPUT,
    days: [
        {
            day: 1,
            theme: "Arrival & Beach",
            activities: [
                { name: "Kuta Beach Walk", type: "attraction", description: "Iconic black-sand beach stroll." },
                { name: "Warung Sunset Dinner", type: "restaurant", description: "Beachside warungs at sunset.", estimatedCost: 18 },
            ],
        },
        {
            day: 2,
            theme: "Temple & Culture",
            activities: [
                { name: "Tanah Lot Temple", type: "attraction", description: "Sea temple at sunset.", estimatedCost: 5 },
                { name: "Ubud Rice Terraces", type: "experience", description: "Tegallalang terraces walk.", estimatedCost: 0 },
                { name: "Nasi Campur Lunch", type: "restaurant", description: "Authentic Balinese mixed rice.", estimatedCost: 10 },
            ],
        },
        {
            day: 3,
            theme: "Adventure & Spa",
            activities: [
                { name: "Mount Batur Sunrise Trek", type: "experience", description: "Active volcano dawn hike.", estimatedCost: 70 },
                { name: "Traditional Spa Treatment", type: "experience", description: "90-minute Balinese massage.", estimatedCost: 40 },
            ],
        },
    ],
    hotels: [
        { name: "Villa Bali Resort", priceRange: "$$", area: "Seminyak", tags: ["beach", "pool", "central"] },
        { name: "Ubud Jungle Lodge", priceRange: "$$$", area: "Ubud", tags: ["nature", "quiet"] },
    ],
};

const MOCK_LOGISTICS_OUTPUT: OptimizedTripContext = {
    ...MOCK_RESEARCH_OUTPUT,
    days: [
        {
            day: 1,
            theme: "Arrival & Beach",
            activities: [
                { name: "Kuta Beach Walk", type: "attraction", description: "Iconic beach stroll.", timeSlot: "afternoon", startTime: "14:00", endTime: "16:00", travelTimeFromPrevMs: 0 },
                { name: "Warung Sunset Dinner", type: "restaurant", description: "Beachside dinner.", timeSlot: "evening", startTime: "18:30", endTime: "20:00", isMeal: true, mealType: "dinner", estimatedCost: 18, travelTimeFromPrevMs: 8_400_000 },
            ],
        },
        {
            day: 2,
            theme: "Temple & Culture",
            activities: [
                { name: "Tanah Lot Temple", type: "attraction", description: "Sea temple.", timeSlot: "morning", startTime: "09:00", endTime: "11:00", estimatedCost: 5, travelTimeFromPrevMs: 0 },
                { name: "Nasi Campur Lunch", type: "restaurant", description: "Balinese lunch.", timeSlot: "afternoon", startTime: "12:30", endTime: "13:30", isMeal: true, mealType: "lunch", estimatedCost: 10, travelTimeFromPrevMs: 3_600_000 },
                { name: "Ubud Rice Terraces", type: "experience", description: "Rice terraces walk.", timeSlot: "afternoon", startTime: "14:00", endTime: "16:00", travelTimeFromPrevMs: 1_800_000 },
            ],
        },
        {
            day: 3,
            theme: "Adventure & Spa",
            activities: [
                { name: "Mount Batur Sunrise Trek", type: "experience", description: "Volcano hike.", timeSlot: "morning", startTime: "04:00", endTime: "09:00", estimatedCost: 70, travelTimeFromPrevMs: 0 },
                { name: "Traditional Spa Treatment", type: "experience", description: "Balinese massage.", timeSlot: "afternoon", startTime: "14:00", endTime: "15:30", estimatedCost: 40, travelTimeFromPrevMs: 18_000_000 },
            ],
        },
    ],
    selectedHotel: { name: "Villa Bali Resort", priceRange: "$$", area: "Seminyak", tags: ["beach", "pool", "central"] },
    foodCostSummary: { perDay: [18, 10, 0], total: 28, avgPerDay: 9.33 },
    warnings: [],
};

// Ledger breakdown (used to derive all totals):
//   Day 1: hotel(160) + dinner(18) + Kuta Beach(0)        = 178
//   Day 2: hotel(160) + lunch(10)  + Tanah Lot(5) + rice(0) = 175
//   Day 3: hotel(160) + Batur Trek(70) + Spa(40)           = 270
//   Grand total: 178 + 175 + 270 = 623
//   Categories: hotel(480) + food(28) + activity(115) + other(0) = 623
const MOCK_BUDGET_OUTPUT: BudgetedTripContext = {
    ...MOCK_LOGISTICS_OUTPUT,
    budget: {
        totalEstimatedCost: 623,
        costPerDay: [178, 175, 270],
        isOverBudget: false,
        ledger: [
            { day: 1, category: "hotel",    name: "Villa Bali Resort",       amount: 160, meta: { source: "priceLevel" } },
            { day: 1, category: "food",     name: "Warung Sunset Dinner",    amount: 18,  meta: { source: "estimatedCost", mealType: "dinner" } },
            { day: 1, category: "activity", name: "Kuta Beach Walk",         amount: 0 },
            { day: 2, category: "hotel",    name: "Villa Bali Resort",       amount: 160, meta: { source: "priceLevel" } },
            { day: 2, category: "food",     name: "Nasi Campur Lunch",       amount: 10,  meta: { source: "estimatedCost", mealType: "lunch" } },
            { day: 2, category: "activity", name: "Tanah Lot Temple",        amount: 5,   meta: { source: "estimatedCost" } },
            { day: 2, category: "activity", name: "Ubud Rice Terraces",      amount: 0 },
            { day: 3, category: "hotel",    name: "Villa Bali Resort",       amount: 160, meta: { source: "priceLevel" } },
            { day: 3, category: "activity", name: "Mount Batur Sunrise Trek", amount: 70, meta: { source: "estimatedCost" } },
            { day: 3, category: "activity", name: "Traditional Spa Treatment", amount: 40, meta: { source: "estimatedCost" } },
        ],
        costBreakdown: {
            perDay: [178, 175, 270],
            total: 623,
            categories: { hotel: 480, food: 28, activity: 115, other: 0 },
        },
    },
};

const MOCK_SAFETY_OUTPUT: SafeTripContext = {
    ...MOCK_BUDGET_OUTPUT,
    safety: {
        riskLevel: "low",
        warnings: [],
        tips: [
            "Stay hydrated on the Mount Batur trek — bring at least 2L of water.",
            "Use reef-safe sunscreen on beach days.",
            "Dress modestly when visiting temples (sarong required at most sites).",
        ],
    },
};

// ─── Mock agent factory ───────────────────────────────────────────────────────

/**
 * Captures the exact input each agent's run() receives so we can assert
 * correct data handoff between stages.
 */
function buildPipelineMocks() {
    const calls: { planner?: string; research?: TripContext; logistics?: EnrichedTripContext; budget?: OptimizedTripContext; safety?: BudgetedTripContext } = {};

    const planner = {
        run: vi.fn(async (input: string) => {
            calls.planner = input;
            return MOCK_PLANNER_OUTPUT;
        }),
    } as unknown as PlannerAgent;

    const research = {
        run: vi.fn(async (ctx: TripContext) => {
            calls.research = ctx;
            return MOCK_RESEARCH_OUTPUT;
        }),
    } as unknown as ResearchAgent;

    const logistics = {
        run: vi.fn(async (ctx: EnrichedTripContext) => {
            calls.logistics = ctx;
            return MOCK_LOGISTICS_OUTPUT;
        }),
    } as unknown as LogisticsAgent;

    const budget = {
        run: vi.fn(async (ctx: OptimizedTripContext) => {
            calls.budget = ctx;
            return MOCK_BUDGET_OUTPUT;
        }),
    } as unknown as BudgetAgent;

    const safety = {
        run: vi.fn(async (ctx: BudgetedTripContext) => {
            calls.safety = ctx;
            return MOCK_SAFETY_OUTPUT;
        }),
    } as unknown as SafetyAgent;

    return { planner, research, logistics, budget, safety, calls };
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe("Full itinerary pipeline — end-to-end", () => {

    const USER_INPUT = "Plan a 3-day trip to Bali for 2 people with a $1,500 budget, balanced style";

    let mocks: ReturnType<typeof buildPipelineMocks>;
    let result: OrchestratorResult;

    beforeEach(async () => {
        mocks = buildPipelineMocks();

        const orchestrator = new AgentOrchestrator({
            planner:  mocks.planner,
            research: mocks.research,
            logistics: mocks.logistics,
            budget:   mocks.budget,
            safety:   mocks.safety,
        });

        result = await orchestrator.run(USER_INPUT);
    });

    // ── 1. Pipeline completes successfully ────────────────────────────────────

    it("returns ok=true with requiresHuman=false", () => {
        expect(result).toMatchObject({ ok: true, requiresHuman: false });
    });

    // ── 2. All 5 agents ran exactly once ──────────────────────────────────────

    it("calls every agent exactly once", () => {
        expect(mocks.planner.run).toHaveBeenCalledOnce();
        expect(mocks.research.run).toHaveBeenCalledOnce();
        expect(mocks.logistics.run).toHaveBeenCalledOnce();
        expect(mocks.budget.run).toHaveBeenCalledOnce();
        expect(mocks.safety.run).toHaveBeenCalledOnce();
    });

    // ── 3. Data handoff correctness ───────────────────────────────────────────

    it("passes user input to planner", () => {
        expect(mocks.calls.planner).toBe(USER_INPUT);
    });

    it("passes planner output to research unchanged", () => {
        expect(mocks.calls.research?.destination).toBe(MOCK_PLANNER_OUTPUT.destination);
        expect(mocks.calls.research?.durationDays).toBe(MOCK_PLANNER_OUTPUT.durationDays);
        expect(mocks.calls.research?.days).toHaveLength(MOCK_PLANNER_OUTPUT.days.length);
    });

    it("passes research output to logistics (hotels present)", () => {
        expect(mocks.calls.logistics?.hotels).toHaveLength(MOCK_RESEARCH_OUTPUT.hotels.length);
        expect(mocks.calls.logistics?.hotels[0].name).toBe("Villa Bali Resort");
    });

    it("passes logistics output to budget (selectedHotel set)", () => {
        expect(mocks.calls.budget?.selectedHotel.name).toBe("Villa Bali Resort");
    });

    it("passes budget output to safety (budget object present)", () => {
        expect(mocks.calls.safety?.budget.totalEstimatedCost).toBe(623);
    });

    // ── 4. Stage output shapes ────────────────────────────────────────────────

    it("planner output: required fields are defined and valid", () => {
        const ctx = mocks.calls.research!;
        expect(ctx.destination).toBeTruthy();
        expect(ctx.destination).not.toBe("Top Travel Destination");
        expect(ctx.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(ctx.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(ctx.durationDays).toBeGreaterThan(0);
        expect(ctx.days.length).toBe(ctx.durationDays);
        ctx.days.forEach((d, i) => {
            expect(d.day).toBe(i + 1);
            expect(d.theme).toBeTruthy();
        });
    });

    it("research output: each day has ≥1 activity and hotels array is non-empty", () => {
        const ctx = mocks.calls.logistics!;
        ctx.days.forEach((day) => {
            expect(day.activities.length).toBeGreaterThanOrEqual(1);
            day.activities.forEach((a) => {
                expect(a.name).toBeTruthy();
                expect(["attraction", "experience", "restaurant"]).toContain(a.type);
            });
        });
        expect(ctx.hotels.length).toBeGreaterThan(0);
        ctx.hotels.forEach((h) => {
            expect(h.name).toBeTruthy();
            expect(h.area).toBeTruthy();
            expect(["$", "$$", "$$$", "$$$$"]).toContain(h.priceRange);
        });
    });

    it("logistics output: selectedHotel defined, every activity has a valid timeSlot", () => {
        const ctx = mocks.calls.budget!;
        expect(ctx.selectedHotel).toBeDefined();
        expect(ctx.selectedHotel.name).toBeTruthy();
        ctx.days.forEach((day) => {
            day.activities.forEach((a) => {
                expect(["morning", "afternoon", "evening"]).toContain(a.timeSlot);
                expect(a.name).toBeTruthy();
            });
        });
    });

    it("budget output: ledger is non-empty, total equals breakdown total", () => {
        const ctx = mocks.calls.safety!;
        expect(ctx.budget.ledger.length).toBeGreaterThan(0);
        expect(ctx.budget.totalEstimatedCost).toBeGreaterThan(0);

        const ledgerSum = ctx.budget.ledger.reduce((acc, item) => acc + item.amount, 0);
        expect(ctx.budget.costBreakdown.total).toBe(ctx.budget.totalEstimatedCost);

        const breakdownCategorySum = Object.values(ctx.budget.costBreakdown.categories)
            .reduce((acc, v) => acc + v, 0);
        expect(breakdownCategorySum).toBe(ctx.budget.costBreakdown.total);

        expect(ctx.budget.costBreakdown.perDay.length).toBe(MOCK_PLANNER_OUTPUT.durationDays);
        expect(ledgerSum).toBe(ctx.budget.totalEstimatedCost);
    });

    // ── 5. Final SafeTripContext completeness ─────────────────────────────────

    it("final context: destination, dates, and days are intact", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const ctx = result.context;

        expect(ctx.destination).toBe("Bali, Indonesia");
        expect(ctx.startDate).toBe("2025-08-01");
        expect(ctx.endDate).toBe("2025-08-03");
        expect(ctx.days).toHaveLength(3);
    });

    it("final context: every day has theme, activities, and no null fields", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const ctx = result.context;

        ctx.days.forEach((day, i) => {
            expect(day.day).toBe(i + 1);
            expect(day.theme).toBeTruthy();
            expect(day.activities).toBeDefined();
            expect(Array.isArray(day.activities)).toBe(true);
            day.activities.forEach((a) => {
                expect(a.name).toBeTruthy();
                expect(a.name).not.toBe("undefined");
                expect(a.timeSlot).toBeDefined();
            });
        });
    });

    it("final context: selectedHotel is complete", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const { selectedHotel } = result.context;

        expect(selectedHotel).toBeDefined();
        expect(selectedHotel.name).toBeTruthy();
        expect(selectedHotel.area).toBeTruthy();
        expect(["$", "$$", "$$$", "$$$$"]).toContain(selectedHotel.priceRange);
    });

    it("final context: budget is within user budget and ledger is balanced", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const { budget, preferences } = result.context;

        expect(budget.isOverBudget).toBe(false);
        expect(budget.totalEstimatedCost).toBe(623);

        if (preferences?.budget) {
            expect(budget.totalEstimatedCost).toBeLessThanOrEqual(preferences.budget);
        }

        // Every ledger item has day, category, name, amount
        budget.ledger.forEach((item) => {
            expect(item.day).toBeGreaterThan(0);
            expect(["hotel", "food", "activity", "other"]).toContain(item.category);
            expect(item.name).toBeTruthy();
            expect(typeof item.amount).toBe("number");
            expect(item.amount).toBeGreaterThanOrEqual(0);
        });
    });

    it("final context: safety result has riskLevel and arrays defined", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const { safety } = result.context;

        expect(safety).toBeDefined();
        expect(["low", "medium", "high"]).toContain(safety.riskLevel);
        expect(Array.isArray(safety.warnings)).toBe(true);
        expect(Array.isArray(safety.tips)).toBe(true);

        // Each warning has required shape
        safety.warnings.forEach((w) => {
            expect(["fatigue", "travel", "schedule", "meal"]).toContain(w.type);
            expect(w.day).toBeGreaterThan(0);
            expect(["medium", "high"]).toContain(w.severity);
            expect(w.message).toBeTruthy();
        });
    });

    // ── 6. Execution log completeness ─────────────────────────────────────────

    it("execution log records all 5 agents with status=success in pipeline order", () => {
        if (!("context" in result)) throw new Error("No context in result");

        const agentEntries = result.executionLog
            .filter((e): e is Extract<typeof e, { agent: string }> => "agent" in e);

        expect(agentEntries.length).toBeGreaterThanOrEqual(5);

        const agentNames = agentEntries.map((e) => e.agent);
        expect(agentNames).toContain("planner");
        expect(agentNames).toContain("research");
        expect(agentNames).toContain("logistics");
        expect(agentNames).toContain("budget");
        expect(agentNames).toContain("safety");

        agentEntries.forEach((e) => {
            expect(e.status).toBe("success");
        });

        // Order must be preserved
        const orderedNames = agentEntries.map((e) => e.agent);
        const plannerIdx  = orderedNames.indexOf("planner");
        const researchIdx = orderedNames.indexOf("research");
        const logisticsIdx = orderedNames.indexOf("logistics");
        const budgetIdx   = orderedNames.indexOf("budget");
        const safetyIdx   = orderedNames.indexOf("safety");

        expect(plannerIdx).toBeLessThan(researchIdx);
        expect(researchIdx).toBeLessThan(logisticsIdx);
        expect(logisticsIdx).toBeLessThan(budgetIdx);
        expect(budgetIdx).toBeLessThan(safetyIdx);
    });

    it("no LLM-decision entries in the execution log (clean single pass)", () => {
        if (!("context" in result)) throw new Error("No context in result");

        const decisionEntries = result.executionLog.filter(
            (e): e is Extract<typeof e, { type: string }> => "type" in e && e.type === "llm-decision",
        );

        expect(decisionEntries).toHaveLength(0);
    });

    // ── 7. No null / undefined on any critical output field ───────────────────

    it("no undefined values on critical context fields (null safety check)", () => {
        if (!("context" in result)) throw new Error("No context in result");
        const ctx = result.context;

        const critical: [string, unknown][] = [
            ["destination", ctx.destination],
            ["startDate",   ctx.startDate],
            ["endDate",     ctx.endDate],
            ["durationDays", ctx.durationDays],
            ["days",        ctx.days],
            ["selectedHotel", ctx.selectedHotel],
            ["selectedHotel.name", ctx.selectedHotel?.name],
            ["budget",      ctx.budget],
            ["budget.ledger", ctx.budget?.ledger],
            ["budget.costBreakdown", ctx.budget?.costBreakdown],
            ["safety",      ctx.safety],
            ["safety.riskLevel", ctx.safety?.riskLevel],
            ["safety.warnings",  ctx.safety?.warnings],
            ["safety.tips",      ctx.safety?.tips],
        ];

        for (const [field, value] of critical) {
            expect(value, `Expected context.${field} to be defined`).toBeDefined();
            expect(value, `Expected context.${field} not to be null`).not.toBeNull();
        }
    });
});
