/**
 * tests/fixtures/tripFixtures.ts
 *
 * Reusable factory functions for the trip pipeline types used across
 * all agent, API route, and integration tests.
 */

import type {
    OptimizedTripContext,
    ScheduledActivity,
    OptimizedDay,
    HotelOption,
} from "@/agents/shared/tripPipelineTypes";
import type { BudgetedTripContext, BudgetResult, CostBreakdown } from "@/agents/budget/budgetAgent";

// ─── Activity factories ───────────────────────────────────────────────────────

export function makeActivity(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
    return {
        name: "Test Activity",
        type: "attraction",
        description: "A test activity description",
        timeSlot: "morning",
        estimatedCost: 30,
        isMeal: false,
        ...overrides,
    };
}

export function makeMeal(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
    return makeActivity({
        name: "Lunch",
        type: "restaurant",
        isMeal: true,
        mealType: "lunch",
        estimatedCost: 25,
        priceLevel: "$$",
        ...overrides,
    });
}

// ─── Day factory ──────────────────────────────────────────────────────────────

/**
 * Creates an OptimizedDay with 2 non-meal activities and 1 meal by default.
 * Pass custom activities to override.
 */
export function makeDay(day: number, activities?: ScheduledActivity[]): OptimizedDay {
    return {
        day,
        theme: `Day ${day} Theme`,
        activities: activities ?? [
            makeActivity({ name: `Museum Visit - Day ${day}`, estimatedCost: 30 }),
            makeActivity({ name: `City Walk - Day ${day}`, estimatedCost: 15, type: "experience" }),
            makeMeal({ name: `Lunch - Day ${day}` }),
        ],
    };
}

/**
 * Creates a day with a specific number of non-meal activities (no meals).
 * Useful for fatigue-rule testing.
 */
export function makeDayWithActivities(day: number, count: number): OptimizedDay {
    return {
        day,
        theme: `Day ${day} Theme`,
        activities: Array.from({ length: count }, (_, i) =>
            makeActivity({ name: `Activity ${i + 1} - Day ${day}`, estimatedCost: 25 + i }),
        ),
    };
}

// ─── Hotel factory ────────────────────────────────────────────────────────────

export function makeHotel(overrides: Partial<HotelOption> = {}): HotelOption {
    return {
        name: "Grand Hotel ($$)",
        priceRange: "$$",
        area: "City Centre",
        tags: ["wifi", "breakfast"],
        rating: 4.0,
        ...overrides,
    };
}

// ─── OptimizedTripContext factory ─────────────────────────────────────────────

export function makeOptimizedContext(overrides: Partial<OptimizedTripContext> = {}): OptimizedTripContext {
    const days = overrides.days ?? [makeDay(1), makeDay(2), makeDay(3)];
    return {
        destination: "Tokyo, Japan",
        startDate: "2026-05-01",
        endDate: "2026-05-03",
        durationDays: 3,
        preferences: {},
        days,
        hotels: [makeHotel()],
        selectedHotel: makeHotel(),
        ...overrides,
    };
}

/**
 * Creates a context guaranteed to be over-budget ($$$ hotel, 3 days, budget $100).
 * Hotel costs alone exceed the budget.
 */
export function makeOverBudgetContext(): OptimizedTripContext {
    return makeOptimizedContext({
        selectedHotel: makeHotel({ name: "Luxury Resort ($$$)", priceRange: "$$$" }),
        preferences: { budget: 100 },
        // foodCostSummary absent → food resolved from meal activities
    });
}

/**
 * Creates a context guaranteed to be within budget ($ hotel, explicit food summary, high budget).
 */
export function makeWithinBudgetContext(): OptimizedTripContext {
    return makeOptimizedContext({
        selectedHotel: makeHotel({ name: "Budget Hotel ($)", priceRange: "$" }),
        preferences: { budget: 10_000 },
        foodCostSummary: { perDay: [30, 30, 30], total: 90, avgPerDay: 30 },
    });
}

// ─── CostBreakdown factory ────────────────────────────────────────────────────

export function makeCostBreakdown(overrides: Partial<CostBreakdown> = {}): CostBreakdown {
    return {
        perDay: [166, 167, 167],
        total: 500,
        categories: { hotel: 200, food: 150, activity: 100, other: 50 },
        ...overrides,
    };
}

// ─── BudgetedTripContext factory ──────────────────────────────────────────────

export function makeBudgetedContext(overrides: Partial<BudgetedTripContext> = {}): BudgetedTripContext {
    const base = makeOptimizedContext(overrides as Partial<OptimizedTripContext>);
    const budget: BudgetResult = {
        totalEstimatedCost: 500,
        costPerDay: [166, 167, 167],
        isOverBudget: false,
        ledger: [],
        costBreakdown: makeCostBreakdown(),
    };
    return {
        ...base,
        ...(overrides as object),
        budget: { ...budget, ...(overrides as BudgetedTripContext).budget },
    };
}

// ─── Mock JWT token ───────────────────────────────────────────────────────────

/**
 * Returns a fake auth context object (matching AccessTokenPayload shape)
 * for use in API route tests where getAuthContext is mocked.
 */
export function mockAuthContext() {
    return {
        user: {
            sub:   "user-abc-123",
            email: "tester@voyageai.test",
            role:  "USER" as const,
            iat:   Math.floor(Date.now() / 1000) - 60,
            exp:   Math.floor(Date.now() / 1000) + 900,
        },
    };
}
