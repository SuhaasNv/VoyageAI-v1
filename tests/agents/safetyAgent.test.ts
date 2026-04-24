/**
 * tests/agents/safetyAgent.test.ts
 *
 * Unit tests for the Safety Agent production path.
 *
 * Coverage targets:
 *  - Rule 1: Activity fatigue (high ≥6, medium ≥5 non-meal activities)
 *  - Rule 2: Long travel gaps (high ≥2 h, medium ≥90 min)
 *  - Rule 3: Late-night schedule overflow (endTime ≥ 22:00)
 *  - Rule 4: No meal stop on a given day
 *  - Risk level derivation (low / medium / high)
 *  - LLM tips: called when warnings exist, gracefully skipped on failure
 *  - LLM tips: skipped when no warnings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock infrastructure ───────────────────────────────────────────────────────

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    trunc: vi.fn().mockImplementation((s: string) => (s ?? "").substring(0, 80)),
}));

vi.mock("@/lib/ai/llm", () => {
    class AIServiceError extends Error {
        constructor(public readonly code: string, message: string) {
            super(message);
            this.name = "AIServiceError";
        }
    }
    return {
        AIServiceError,
        LLMClientFactory: { create: vi.fn().mockReturnValue({ execute: vi.fn() }) },
        executeWithRetry: vi.fn(),
        parseJSONResponse: vi.fn().mockImplementation((t: string) => JSON.parse(t)),
    };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { SafetyAgent } from "@/agents/safety/safetyAgent";
import { executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import {
    makeOptimizedContext,
    makeDay,
    makeActivity,
    makeMeal,
    makeDayWithActivities,
    makeBudgetedContext,
} from "../fixtures/tripFixtures";
import type { BudgetedTripContext } from "@/agents/budget/budgetAgent";
import type { ScheduledActivity } from "@/agents/shared/tripPipelineTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wraps an OptimizedTripContext with a minimal budget to satisfy SafetyAgent input type. */
function withBudget(ctx: ReturnType<typeof makeOptimizedContext>): BudgetedTripContext {
    return makeBudgetedContext(ctx as any);
}

const agent = new SafetyAgent();

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1 — Activity Fatigue
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — Rule 1: activity fatigue", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("no fatigue warning when day has 4 or fewer non-meal activities", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 4)],
        }));
        // No tips call expected; silence LLM just in case
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        const result = await agent.run(ctx, "r1-safe");
        const fatigue = result.safety.warnings.filter((w) => w.type === "fatigue");
        expect(fatigue).toHaveLength(0);
    });

    it("emits medium fatigue warning for exactly 5 non-meal activities", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Take a rest"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Take a rest"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 5)],
        }));

        const result = await agent.run(ctx, "r1-medium");
        const fatigue = result.safety.warnings.filter((w) => w.type === "fatigue");
        expect(fatigue).toHaveLength(1);
        expect(fatigue[0].severity).toBe("medium");
        expect(fatigue[0].day).toBe(1);
    });

    it("emits high fatigue warning for 6 or more non-meal activities", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Pace yourself"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Pace yourself"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 6)],
        }));

        const result = await agent.run(ctx, "r1-high");
        const fatigue = result.safety.warnings.filter((w) => w.type === "fatigue");
        expect(fatigue).toHaveLength(1);
        expect(fatigue[0].severity).toBe("high");
        expect(fatigue[0].message).toContain("6 activities");
    });

    it("counts only non-meal activities for fatigue", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        // 4 non-meal + 3 meals = 7 total but only 4 non-meal
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [{
                day: 1,
                theme: "Food Day",
                activities: [
                    ...Array.from({ length: 4 }, (_, i) => makeActivity({ name: `Act ${i}` })),
                    makeMeal({ name: "Breakfast", mealType: "lunch" }),
                    makeMeal({ name: "Lunch", mealType: "lunch" }),
                    makeMeal({ name: "Dinner", mealType: "dinner" }),
                ],
            }],
        }));

        const result = await agent.run(ctx, "r1-meals-ignored");
        const fatigue = result.safety.warnings.filter((w) => w.type === "fatigue");
        expect(fatigue).toHaveLength(0); // 4 non-meal → no warning
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2 — Long Travel Gaps
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — Rule 2: long travel gaps", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    const TRAVEL_HIGH_MS  = 2 * 60 * 60 * 1000;   // 2 h
    const TRAVEL_MED_MS   = 90 * 60 * 1000;         // 90 min

    it("emits no travel warning when travelTimeFromPrevMs is absent", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [makeActivity({ name: "Walk", travelTimeFromPrevMs: undefined }), makeMeal()])],
        }));
        const result = await agent.run(ctx, "r2-no-travel");
        expect(result.safety.warnings.filter((w) => w.type === "travel")).toHaveLength(0);
    });

    it("emits medium travel warning for 90-minute travel time", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Allow extra time"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Allow extra time"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Far Attraction", travelTimeFromPrevMs: TRAVEL_MED_MS }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r2-medium");
        const travel = result.safety.warnings.filter((w) => w.type === "travel");
        expect(travel).toHaveLength(1);
        expect(travel[0].severity).toBe("medium");
        expect(travel[0].message).toContain("Far Attraction");
    });

    it("emits high travel warning for 2-hour+ travel time", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Very long transfer"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Very long transfer"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Distant Castle", travelTimeFromPrevMs: TRAVEL_HIGH_MS }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r2-high");
        const travel = result.safety.warnings.filter((w) => w.type === "travel");
        expect(travel).toHaveLength(1);
        expect(travel[0].severity).toBe("high");
    });

    it("formats travel time correctly: 1h 30m for 90 minutes", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Place", travelTimeFromPrevMs: TRAVEL_MED_MS }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r2-format");
        const travel = result.safety.warnings.find((w) => w.type === "travel");
        expect(travel?.message).toContain("1h 30m");
    });

    it("emits one travel warning per long-transit activity", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Place A", travelTimeFromPrevMs: TRAVEL_HIGH_MS }),
                makeActivity({ name: "Place B", travelTimeFromPrevMs: TRAVEL_HIGH_MS }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r2-two");
        expect(result.safety.warnings.filter((w) => w.type === "travel")).toHaveLength(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 3 — Late-Night Overflow
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — Rule 3: late-night schedule", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("emits no schedule warning when all activities end before 22:00", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Museum", endTime: "18:00" }),
                makeMeal({ endTime: "20:30" }),
            ])],
        }));
        const result = await agent.run(ctx, "r3-safe");
        expect(result.safety.warnings.filter((w) => w.type === "schedule")).toHaveLength(0);
    });

    it("emits medium schedule warning when activity ends at 22:00 or later", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Sleep early"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Sleep early"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Night Show", endTime: "23:00" }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r3-warning");
        const schedule = result.safety.warnings.filter((w) => w.type === "schedule");
        expect(schedule).toHaveLength(1);
        expect(schedule[0].severity).toBe("medium");
        expect(schedule[0].message).toContain("23:00");
    });

    it("only flags the latest-ending activity per day (no duplicate warnings)", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Evening Tour", endTime: "22:30" }),
                makeActivity({ name: "Midnight Show", endTime: "00:00" }),
                makeMeal(),
            ])],
        }));

        const result = await agent.run(ctx, "r3-latest-only");
        // Only the single latest activity (or only one per day per the rule)
        expect(result.safety.warnings.filter((w) => w.type === "schedule")).toHaveLength(1);
    });

    it("ignores activities with no endTime for schedule rule", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Open-end Tour", endTime: undefined }),
                makeMeal(),
            ])],
        }));
        const result = await agent.run(ctx, "r3-no-endtime");
        expect(result.safety.warnings.filter((w) => w.type === "schedule")).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule 4 — No Meals
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — Rule 4: missing meals", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("emits no meal warning when isMeal activity is present", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [makeActivity(), makeMeal()])],
        }));
        const result = await agent.run(ctx, "r4-has-meal");
        expect(result.safety.warnings.filter((w) => w.type === "meal")).toHaveLength(0);
    });

    it("emits medium meal warning when no isMeal activity exists", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Add a meal"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Add a meal"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [
                makeActivity({ name: "Sightseeing", isMeal: false }),
                makeActivity({ name: "Museum", isMeal: false }),
            ])],
        }));

        const result = await agent.run(ctx, "r4-no-meal");
        const meal = result.safety.warnings.filter((w) => w.type === "meal");
        expect(meal).toHaveLength(1);
        expect(meal[0].severity).toBe("medium");
        expect(meal[0].message).toContain("Day 1");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Risk level derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — risk level derivation", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("riskLevel is 'low' when no warnings", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [makeActivity(), makeMeal()])],
        }));
        const result = await agent.run(ctx, "risk-low");
        expect(result.safety.riskLevel).toBe("low");
        expect(result.safety.tips).toHaveLength(0);
    });

    it("riskLevel is 'medium' when only medium-severity warnings exist", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Tip A"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Tip A"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 5)], // medium fatigue, no meal → medium
        }));

        const result = await agent.run(ctx, "risk-medium");
        expect(result.safety.riskLevel).toBe("medium");
    });

    it("riskLevel is 'high' when any high-severity warning is present", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Serious warning"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Serious warning"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 7)], // high fatigue
        }));

        const result = await agent.run(ctx, "risk-high");
        expect(result.safety.riskLevel).toBe("high");
    });

    it("multi-day trip: one high-severity day overrides all medium days", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Watch out"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Watch out"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 3,
            days: [
                makeDay(1, [makeActivity(), makeMeal()]), // clean
                makeDayWithActivities(2, 5),              // medium fatigue + no meal
                makeDayWithActivities(3, 8),              // high fatigue
            ],
        }));

        const result = await agent.run(ctx, "risk-multi");
        expect(result.safety.riskLevel).toBe("high");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// LLM Tips integration
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — LLM tips", () => {
    // Clear mock call history before every test so accumulated calls from earlier
    // describe blocks don't affect assertions like .not.toHaveBeenCalled().
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("does NOT call LLM when there are no warnings", async () => {
        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDay(1, [makeActivity(), makeMeal()])],
        }));

        const result = await agent.run(ctx, "tips-no-call");
        expect(executeWithRetry).not.toHaveBeenCalled();
        expect(result.safety.tips).toHaveLength(0);
    });

    it("returns tips from LLM when warnings are present", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: '{"tips":["Drink water","Wear sunscreen"]}',
            latencyMs: 80,
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Drink water", "Wear sunscreen"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 6)], // triggers high fatigue warning
        }));

        const result = await agent.run(ctx, "tips-present");
        expect(result.safety.tips).toContain("Drink water");
    });

    it("returns empty tips when LLM call fails — warnings are still present", async () => {
        vi.mocked(executeWithRetry).mockRejectedValue(new Error("LLM timeout"));

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 6)],
        }));

        const result = await agent.run(ctx, "tips-fail");
        // The deterministic output must not be affected
        expect(result.safety.warnings.length).toBeGreaterThan(0);
        expect(result.safety.tips).toHaveLength(0);
        // riskLevel still correctly derived
        expect(result.safety.riskLevel).toBe("high");
    });

    it("caps tips at 4 items", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: '{"tips":["A","B","C","D","E"]}',
            latencyMs: 10,
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["A", "B", "C", "D", "E"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 6)],
        }));

        const result = await agent.run(ctx, "tips-cap");
        expect(result.safety.tips.length).toBeLessThanOrEqual(4);
    });

    it("filters non-string tips from LLM response", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({
            content: '{"tips":["Good tip",null,42,"Another tip"]}',
            latencyMs: 10,
        } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Good tip", null, 42, "Another tip"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [makeDayWithActivities(1, 6)],
        }));

        const result = await agent.run(ctx, "tips-filter");
        expect(result.safety.tips).toEqual(["Good tip", "Another tip"]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full multi-rule scenario
// ─────────────────────────────────────────────────────────────────────────────

describe("SafetyAgent — combined rules", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("collects warnings from all four rules simultaneously", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":["Multi-rule tip"]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: ["Multi-rule tip"] });

        const ctx = withBudget(makeOptimizedContext({
            durationDays: 1,
            days: [{
                day: 1,
                theme: "Brutal Day",
                activities: [
                    // Rule 1: 6 non-meal activities
                    makeActivity({ name: "Act 1" }),
                    makeActivity({ name: "Act 2" }),
                    makeActivity({ name: "Act 3" }),
                    makeActivity({ name: "Act 4" }),
                    makeActivity({ name: "Act 5" }),
                    makeActivity({ name: "Act 6", travelTimeFromPrevMs: 2 * 60 * 60 * 1000 }), // Rule 2: 2h travel
                    // Rule 3: late night
                    makeActivity({ name: "Late Night Bar", endTime: "23:30" }),
                    // No isMeal → Rule 4
                ],
            }],
        }));

        const result = await agent.run(ctx, "combined");
        const types = result.safety.warnings.map((w) => w.type);
        expect(types).toContain("fatigue");
        expect(types).toContain("travel");
        expect(types).toContain("schedule");
        expect(types).toContain("meal");
        expect(result.safety.riskLevel).toBe("high");
    });

    it("preserves all original context fields in output", async () => {
        vi.mocked(executeWithRetry).mockResolvedValue({ content: '{"tips":[]}', latencyMs: 10 } as any);
        vi.mocked(parseJSONResponse).mockReturnValue({ tips: [] });

        const ctx = withBudget(makeOptimizedContext());
        // Add a meal so we don't get meal warning
        const result = await agent.run(ctx, "passthrough");
        expect(result.destination).toBe(ctx.destination);
        expect(result.durationDays).toBe(ctx.durationDays);
    });
});
