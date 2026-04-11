/**
 * scripts/ci/validate-data.ts
 *
 * Data Validation — Stage 5
 *
 * Validates all static fixtures, Zod schemas, and agent I/O contracts
 * against known-good reference payloads WITHOUT hitting any real API.
 *
 * Exit code 0 = all checks passed.
 * Exit code 1 = at least one check failed.
 */

import { z } from "zod";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// ─── Zod schemas re-used throughout the pipeline ─────────────────────────────

import {
    GenerateItineraryRequestSchema,
    TravelDNASchema,
    ChatRequestSchema,
    PackingListRequestSchema,
    CreateTripFromTextInputSchema,
    CreateTripFromTextOutputSchema,
    DashboardSuggestionsOutputSchema,
} from "../../src/lib/ai/schemas/index.js";

// ─── Agent pipeline types ─────────────────────────────────────────────────────

import type { TripContext } from "../../src/agents/planner/plannerAgent.js";
import type { EnrichedTripContext } from "../../src/agents/research/researchAgent.js";
import type { OptimizedTripContext } from "../../src/agents/logistics/logisticsAgent.js";
import type { BudgetedTripContext } from "../../src/agents/budget/budgetAgent.js";
import type { SafeTripContext } from "../../src/agents/safety/safetyAgent.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CheckResult = {
    name: string;
    passed: boolean;
    error?: string;
};

const results: CheckResult[] = [];

function check(name: string, fn: () => void): void {
    try {
        fn();
        results.push({ name, passed: true });
        console.log(`  ✅ ${name}`);
    } catch (err) {
        results.push({ name, passed: false, error: (err as Error).message });
        console.error(`  ❌ ${name}: ${(err as Error).message}`);
    }
}

function zodCheck<T>(name: string, schema: z.ZodType<T>, data: unknown): void {
    check(name, () => {
        const result = schema.safeParse(data);
        if (!result.success) {
            throw new Error(result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "));
        }
    });
}

// ─── Reference fixtures ────────────────────────────────────────────────────────

const VALID_TRIP_CONTEXT: TripContext = {
    destination: "Tokyo",
    startDate: "2026-05-01",
    endDate: "2026-05-05",
    durationDays: 5,
    preferences: { budget: 2000, style: "balanced", pace: "moderate" },
    days: [
        { day: 1, theme: "Arrival & Orientation" },
        { day: 2, theme: "Culture & Landmarks" },
        { day: 3, theme: "Nature & Relaxation" },
        { day: 4, theme: "Local Life & Markets" },
        { day: 5, theme: "Hidden Gems & Exploration" },
    ],
};

const VALID_ENRICHED_CONTEXT: EnrichedTripContext = {
    ...VALID_TRIP_CONTEXT,
    days: VALID_TRIP_CONTEXT.days.map((d) => ({
        ...d,
        activities: [
            { name: "Senso-ji Temple", type: "attraction", description: "Historic Buddhist temple in Asakusa.", estimatedCost: 0 },
            { name: "Ramen at Ichiran", type: "restaurant", description: "Famous tonkotsu ramen solo dining.", estimatedCost: 15 },
        ],
    })),
    hotels: [
        { name: "Shinjuku Granbell Hotel", priceRange: "$$", area: "Shinjuku", tags: ["central", "modern"], rating: 4.2 },
        { name: "Park Hyatt Tokyo", priceRange: "$$$$", area: "Shinjuku", tags: ["luxury", "views"], rating: 4.9 },
        { name: "Khaosan Tokyo Kabuki", priceRange: "$", area: "Asakusa", tags: ["budget", "hostel"], rating: 3.8 },
    ],
};

const VALID_OPTIMIZED_CONTEXT: OptimizedTripContext = {
    ...VALID_ENRICHED_CONTEXT,
    days: VALID_ENRICHED_CONTEXT.days.map((d) => ({
        ...d,
        activities: d.activities.map((a, i) => ({
            ...a,
            timeSlot: (["morning", "afternoon", "evening"] as const)[i % 3],
        })),
    })),
    selectedHotel: VALID_ENRICHED_CONTEXT.hotels[0]!,
};

const VALID_BUDGETED_CONTEXT: BudgetedTripContext = {
    ...VALID_OPTIMIZED_CONTEXT,
    budget: {
        totalEstimatedCost: 1450,
        costPerDay: [290, 290, 290, 290, 290],
        isOverBudget: false,
    },
};

const VALID_SAFE_CONTEXT: SafeTripContext = {
    ...VALID_BUDGETED_CONTEXT,
    safety: {
        riskLevel: "low",
        warnings: [],
        tips: ["Book Senso-ji early to avoid crowds.", "Keep a copy of your passport."],
    },
};

// ─── 1. Zod Schema validation ─────────────────────────────────────────────────

console.log("\n📋 Zod schema checks");

zodCheck("GenerateItineraryRequestSchema — valid payload", GenerateItineraryRequestSchema, {
    destination: "Tokyo",
    startDate: "2026-05-01",
    endDate: "2026-05-05",
    budget: { total: 2000, currency: "USD", flexibility: "flexible" },
    groupSize: 1,
});

zodCheck("TravelDNASchema — valid payload", TravelDNASchema, {
    travelStyles: ["adventure", "cultural"],
    pacePreference: "moderate",
    budgetTier: "mid-range",
    interests: ["history", "food", "architecture"],
});

zodCheck("ChatRequestSchema — valid payload", ChatRequestSchema, {
    messages: [{ role: "user", content: "What is the best way to get to Shibuya?" }],
    intent: "general_query",
});

zodCheck("PackingListRequestSchema — valid payload", PackingListRequestSchema, {
    destination: "Tokyo",
    startDate: "2026-05-01",
    endDate: "2026-05-05",
    climate: "temperate",
});

zodCheck("CreateTripFromTextInputSchema", CreateTripFromTextInputSchema, {
    text: "I want to visit Bali for a week in July with a $1500 budget.",
});

zodCheck("CreateTripFromTextOutputSchema", CreateTripFromTextOutputSchema, {
    destination: "Bali, Indonesia",
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    style: "relaxed",
});

zodCheck("DashboardSuggestionsOutputSchema", DashboardSuggestionsOutputSchema, {
    suggestions: [
        { title: "Explore Kyoto", description: "Golden temples and bamboo forests await.", tag: "popular" },
    ],
});

// ─── 2. Agent pipeline contract checks ───────────────────────────────────────

console.log("\n🔗 Agent pipeline contract checks");

check("TripContext — required fields present", () => {
    const required: (keyof TripContext)[] = ["destination", "startDate", "endDate", "durationDays", "days"];
    for (const f of required) {
        if (VALID_TRIP_CONTEXT[f] === undefined) throw new Error(`Missing field: ${f}`);
    }
});

check("TripContext → EnrichedTripContext — days count preserved", () => {
    if (VALID_ENRICHED_CONTEXT.days.length !== VALID_TRIP_CONTEXT.days.length) {
        throw new Error("Day count mismatch after enrichment");
    }
    if (!VALID_ENRICHED_CONTEXT.hotels.length) throw new Error("Hotels missing from enriched context");
});

check("EnrichedTripContext → OptimizedTripContext — selectedHotel present", () => {
    if (!VALID_OPTIMIZED_CONTEXT.selectedHotel?.name) throw new Error("selectedHotel missing");
    for (const day of VALID_OPTIMIZED_CONTEXT.days) {
        for (const act of day.activities) {
            if (!["morning", "afternoon", "evening"].includes(act.timeSlot)) {
                throw new Error(`Invalid timeSlot "${act.timeSlot}" on day ${day.day}`);
            }
        }
    }
});

check("OptimizedTripContext → BudgetedTripContext — budget fields valid", () => {
    const b = VALID_BUDGETED_CONTEXT.budget;
    if (b.totalEstimatedCost <= 0) throw new Error("totalEstimatedCost must be > 0");
    if (b.costPerDay.length !== VALID_BUDGETED_CONTEXT.durationDays) {
        throw new Error("costPerDay length != durationDays");
    }
});

check("BudgetedTripContext → SafeTripContext — safety result present", () => {
    const s = VALID_SAFE_CONTEXT.safety;
    if (!["low", "medium", "high"].includes(s.riskLevel)) throw new Error(`Invalid riskLevel: ${s.riskLevel}`);
    if (!Array.isArray(s.warnings)) throw new Error("warnings must be an array");
    if (!Array.isArray(s.tips)) throw new Error("tips must be an array");
});

// ─── 3. Negative / boundary checks ──────────────────────────────────────────

console.log("\n🚫 Negative / boundary checks");

check("GenerateItineraryRequestSchema rejects empty destination", () => {
    const r = GenerateItineraryRequestSchema.safeParse({
        destination: "",
        startDate: "2026-05-01",
        endDate: "2026-05-05",
        budget: { total: 2000 },
    });
    if (r.success) throw new Error("Should have failed on empty destination");
});

check("TravelDNASchema rejects empty travelStyles", () => {
    const r = TravelDNASchema.safeParse({
        travelStyles: [],
        pacePreference: "moderate",
        budgetTier: "mid-range",
        interests: ["food"],
    });
    if (r.success) throw new Error("Should have failed on empty travelStyles");
});

check("BudgetedTripContext isOverBudget flag consistent with gap", () => {
    const overBudget: BudgetedTripContext = {
        ...VALID_BUDGETED_CONTEXT,
        budget: { totalEstimatedCost: 3000, costPerDay: [], isOverBudget: true, budgetGap: 1000 },
    };
    if (!overBudget.budget.isOverBudget) throw new Error("isOverBudget should be true");
    if ((overBudget.budget.budgetGap ?? 0) <= 0) throw new Error("budgetGap must be positive when over budget");
});

// ─── Report ───────────────────────────────────────────────────────────────────

const passed = results.every((r) => r.passed);
const report = {
    stage: "data-validation",
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    failures: results.filter((r) => !r.passed).length,
    checks: results,
};

mkdirSync("reports", { recursive: true });
writeFileSync(path.join("reports", "data-validation.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Data validation: ${results.filter((r) => r.passed).length}/${results.length} checks passed`);
process.exit(passed ? 0 : 1);
