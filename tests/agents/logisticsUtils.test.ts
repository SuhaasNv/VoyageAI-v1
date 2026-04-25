/**
 * tests/agents/logisticsUtils.test.ts
 *
 * Unit tests for:
 *   - routingUtils: buildScheduledDay, injectMeals, computeFoodCost
 *   - logisticsAgent: selectHotel
 *
 * All four are pure / near-pure functions.
 * buildScheduledDay uses `logStructured` (mocked below).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    trunc:         vi.fn((s: string) => s),
}));

// haversineDistanceMins is used by buildScheduledDay on matrix miss
vi.mock("@/services/mapbox", () => ({
    haversineDistanceMins: vi.fn().mockReturnValue(15),
    isInvalidCoord: vi.fn().mockReturnValue(false),
    getTravelTimeMatrix: vi.fn(),
}));

import { buildScheduledDay, injectMeals, computeFoodCost } from "@/agents/logistics/routingUtils";
import { selectHotel } from "@/agents/logistics/logisticsAgent";
import type { MatrixLookup } from "@/agents/logistics/routingUtils";
import type { ScheduledActivity, OptimizedDay } from "@/agents/shared/tripPipelineTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHotel(overrides = {}) {
    return { lat: 48.8566, lng: 2.3522, id: "hotel_0", ...overrides };
}

function makeActivity(overrides: Record<string, unknown> = {}) {
    return {
        id:          `act_${Math.random().toString(36).slice(2, 7)}`,
        name:        "Eiffel Tower",
        type:        "attraction" as const,
        description: "Iconic iron structure",
        lat:         48.8584,
        lng:         2.2945,
        ...overrides,
    };
}

function makeMatrix(
    ids: string[],
    travelMins = 20,
): MatrixLookup {
    const indexMap = new Map(ids.map((id, i) => [id, i]));
    const size     = ids.length;
    const matrix   = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => travelMins),
    );
    return { matrix, indexMap };
}

function makeScheduledActivity(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
    return {
        name:        "Eiffel Tower",
        type:        "attraction",
        description: "Landmark",
        timeSlot:    "morning",
        startTime:   "09:00",
        endTime:     "11:00",
        ...overrides,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// buildScheduledDay
// ═════════════════════════════════════════════════════════════════════════════

describe("buildScheduledDay — basic scheduling", () => {
    it("returns empty result for zero activities", () => {
        const { scheduled, droppedCount } = buildScheduledDay(
            makeHotel(),
            [],
            makeMatrix(["hotel_0"]),
        );
        expect(scheduled).toHaveLength(0);
        expect(droppedCount).toBe(0);
    });

    it("schedules a single activity starting at 09:00", () => {
        const act    = makeActivity({ id: "act_1", name: "Louvre" });
        const ids    = ["hotel_0", "act_1"];
        const matrix = makeMatrix(ids, 15);   // 15 min travel

        const { scheduled } = buildScheduledDay(makeHotel(), [act], matrix);

        expect(scheduled).toHaveLength(1);
        expect(scheduled[0]!.startTime).toBe("09:15");  // hotel + 15 min travel
        expect(scheduled[0]!.name).toBe("Louvre");
    });

    it("assigns the correct timeSlot based on arrival time", () => {
        const act    = makeActivity({ id: "act_1" });
        const matrix = makeMatrix(["hotel_0", "act_1"], 5); // arrives ~09:05 → morning

        const { scheduled } = buildScheduledDay(makeHotel(), [act], matrix);

        expect(scheduled[0]!.timeSlot).toBe("morning");
    });

    it("assigns afternoon timeSlot when activity arrives after 12:00", () => {
        // Need an activity that arrives after 12 * 60 = 720 mins.
        // Start of day = 9 * 60 = 540. We need travel > 180 min.
        const act    = makeActivity({ id: "act_1" });
        // 200 min travel → arrival at 540 + 200 = 740 mins (12:20) → afternoon
        const matrix = makeMatrix(["hotel_0", "act_1"], 200);

        const { scheduled } = buildScheduledDay(makeHotel(), [act], matrix);

        expect(scheduled[0]!.timeSlot).toBe("afternoon");
    });

    it("drops activities when day end (19:00) would be exceeded", () => {
        // Three experience activities (stay 150 min each). With short travel between them:
        //   Hotel → act1: 5 min travel, arrive 09:05, stay 150min, end 11:35, buffer → 11:50
        //   act1 → act2:  5 min travel, arrive 11:55, stay 150min, end 14:25, buffer → 14:40
        //   act2 → act3:  5 min travel, arrive 14:45, stay 150min, end 17:15 — still fits
        // Use large travel (capped at 240 min) for act3 to overflow:
        //   act2 → act3: 240 (capped), arrive 14:40+240=18:40, stay 150 → 21:10 > 19:00 → DROP

        const act1 = makeActivity({ id: "act_1", name: "A", type: "experience" as const });
        const act2 = makeActivity({ id: "act_2", name: "B", type: "experience" as const });
        const act3 = makeActivity({ id: "act_3", name: "C", type: "experience" as const });
        const ids  = ["hotel_0", "act_1", "act_2", "act_3"];

        const indexMap = new Map(ids.map((id, i) => [id, i]));
        // hotel→act1=5, act1→act2=5, act2→act3=300 (clamped to 240)
        const matrix   = [
            [0,   5,   600, 600],  // hotel
            [5,   0,   5,   600],  // act1
            [600, 5,   0,   300],  // act2 → act3 = 300 (clamped to 240 by clampTravel)
            [600, 600, 300, 0  ],  // act3
        ];

        const { scheduled, droppedCount } = buildScheduledDay(makeHotel(), [act1, act2, act3], { matrix, indexMap });

        // act1 and act2 fit; act3 overflow → dropped
        expect(scheduled).toHaveLength(2);
        expect(droppedCount).toBe(1);
    });

    it("travelTimeFromPrevMs is set in milliseconds on each scheduled activity", () => {
        const act    = makeActivity({ id: "act_1" });
        const matrix = makeMatrix(["hotel_0", "act_1"], 20);

        const { scheduled } = buildScheduledDay(makeHotel(), [act], matrix);

        expect(scheduled[0]!.travelTimeFromPrevMs).toBe(20 * 60_000);
    });
});

describe("buildScheduledDay — matrix miss fallback", () => {
    it("falls back to haversine when activity id is not in indexMap", async () => {
        const { haversineDistanceMins } = await import("@/services/mapbox");
        vi.mocked(haversineDistanceMins).mockReturnValue(10);

        const act    = makeActivity({ id: "act_MISSING" });
        // matrix only has hotel_0; act_MISSING is absent → matrix miss
        const matrix = makeMatrix(["hotel_0"], 15);

        const { scheduled } = buildScheduledDay(makeHotel(), [act], matrix);

        expect(scheduled).toHaveLength(1);
        // Haversine fallback → 10 min travel
        expect(scheduled[0]!.travelTimeFromPrevMs).toBe(10 * 60_000);
    });
});

describe("buildScheduledDay — deterministic tie-break", () => {
    it("picks alphabetically earlier name when travel times are equal", () => {
        const actA = makeActivity({ id: "act_a", name: "Zebra Museum" });
        const actB = makeActivity({ id: "act_b", name: "Acropolis" });

        const ids    = ["hotel_0", "act_a", "act_b"];
        // Equal travel from hotel to both
        const matrix = makeMatrix(ids, 10);

        const { scheduled } = buildScheduledDay(makeHotel(), [actA, actB], matrix);

        // "Acropolis" < "Zebra Museum" lexicographically → Acropolis is scheduled first
        expect(scheduled[0]!.name).toBe("Acropolis");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// injectMeals
// ═════════════════════════════════════════════════════════════════════════════

describe("injectMeals — empty array", () => {
    it("returns the original empty array unchanged", () => {
        const result = injectMeals([]);
        expect(result.activities).toHaveLength(0);
        expect(result.lunchInserted).toBe(false);
        expect(result.dinnerInserted).toBe(false);
    });
});

describe("injectMeals — lunch window (12:00–15:00)", () => {
    it("promotes a restaurant at 12:30 to isMeal=true, mealType=lunch", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({
                type:      "restaurant",
                startTime: "12:30",
                endTime:   "13:30",
            }),
        ];
        const { activities: out, lunchInserted } = injectMeals(activities);

        expect(lunchInserted).toBe(true);
        expect(out[0]!.isMeal).toBe(true);
        expect(out[0]!.mealType).toBe("lunch");
    });

    it("does NOT promote a restaurant before 12:00", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({
                type:      "restaurant",
                startTime: "11:00",
                endTime:   "12:00",
            }),
        ];
        const { lunchInserted } = injectMeals(activities);
        expect(lunchInserted).toBe(false);
    });

    it("does NOT promote a restaurant at exactly 15:00 (exclusive upper bound)", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({
                type:      "restaurant",
                startTime: "15:00",
                endTime:   "16:00",
            }),
        ];
        const { lunchInserted } = injectMeals(activities);
        expect(lunchInserted).toBe(false);
    });
});

describe("injectMeals — dinner window (18:00–22:00)", () => {
    it("promotes the latest restaurant at 19:00 to mealType=dinner", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({ type: "restaurant", startTime: "12:30", endTime: "13:30" }),
            makeScheduledActivity({ type: "restaurant", startTime: "19:00", endTime: "20:30", name: "Dinner Spot" }),
        ];
        const { activities: out, dinnerInserted } = injectMeals(activities);

        const dinnerAct = out.find((a) => a.mealType === "dinner");
        expect(dinnerInserted).toBe(true);
        expect(dinnerAct?.name).toBe("Dinner Spot");
    });

    it("picks the LAST dinner-window restaurant when multiple qualify", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({ type: "restaurant", startTime: "18:30", endTime: "19:30", name: "Early Dinner" }),
            makeScheduledActivity({ type: "restaurant", startTime: "20:00", endTime: "21:00", name: "Late Dinner" }),
        ];
        const { activities: out } = injectMeals(activities);

        const dinnerAct = out.find((a) => a.mealType === "dinner");
        expect(dinnerAct?.name).toBe("Late Dinner");
    });
});

describe("injectMeals — reclassification of mistimed restaurants", () => {
    it("converts a restaurant at 11:00 (between breakfast and lunch — outside all windows) to type=experience", () => {
        // 11:00 = 660 mins; breakfast window 420-600 (ends 10:00), lunch window 720-900 (starts 12:00)
        // 660 is outside ALL three meal windows → reclassify to experience
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({
                type:      "restaurant",
                startTime: "11:00",
                endTime:   "12:00",
            }),
        ];
        const { activities: out } = injectMeals(activities);
        expect(out[0]!.type).toBe("experience");
    });

    it("does NOT reclassify a restaurant that is already a meal (isMeal=true)", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({
                type:      "restaurant",
                startTime: "10:30",
                endTime:   "11:30",
                isMeal:    true,
                mealType:  "lunch",
            }),
        ];
        const { activities: out } = injectMeals(activities);
        expect(out[0]!.type).toBe("restaurant");
    });

    it("preserves non-restaurant activities unchanged", () => {
        const activities: ScheduledActivity[] = [
            makeScheduledActivity({ type: "attraction", name: "Colosseum" }),
        ];
        const { activities: out } = injectMeals(activities);
        expect(out[0]!.type).toBe("attraction");
        expect(out[0]!.name).toBe("Colosseum");
    });

    it("lunchWasFallback and dinnerWasFallback are always false", () => {
        const { lunchWasFallback, dinnerWasFallback } = injectMeals([
            makeScheduledActivity({ type: "restaurant", startTime: "12:30", endTime: "13:30" }),
        ]);
        expect(lunchWasFallback).toBe(false);
        expect(dinnerWasFallback).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// computeFoodCost
// ═════════════════════════════════════════════════════════════════════════════

describe("computeFoodCost — basic", () => {
    it("returns zero totals for days with no isMeal activities", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "Day 1", activities: [
                { name: "Museum", type: "attraction", description: "Art", timeSlot: "morning" },
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.total).toBe(0);
        expect(result.perDay[0]).toBe(0);
    });

    it("sums estimatedCost from isMeal activities", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "Day 1", activities: [
                { name: "Lunch", type: "restaurant", description: "Meal", timeSlot: "afternoon",
                  isMeal: true, estimatedCost: 25 },
                { name: "Dinner", type: "restaurant", description: "Meal", timeSlot: "evening",
                  isMeal: true, estimatedCost: 50 },
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.perDay[0]).toBe(75);
        expect(result.total).toBe(75);
    });

    it("uses FALLBACK_COST from priceLevel when estimatedCost is absent", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "Day 1", activities: [
                { name: "Lunch", type: "restaurant", description: "Meal", timeSlot: "afternoon",
                  isMeal: true, priceLevel: "$$" },  // $$  = 30
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.perDay[0]).toBe(30);
    });

    it("uses DEFAULT_MEAL_COST (20) when neither estimatedCost nor priceLevel is set", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "Day 1", activities: [
                { name: "Lunch", type: "restaurant", description: "Meal", timeSlot: "afternoon",
                  isMeal: true },
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.perDay[0]).toBe(20);
    });

    it("FALLBACK_COST tiers: $$$ = 75, $$ = 30, $ = 12", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "D1", activities: [
                { name: "L1", type: "restaurant", description: "", timeSlot: "morning", isMeal: true, priceLevel: "$$$" },
            ]},
            { day: 2, theme: "D2", activities: [
                { name: "L2", type: "restaurant", description: "", timeSlot: "morning", isMeal: true, priceLevel: "$$" },
            ]},
            { day: 3, theme: "D3", activities: [
                { name: "L3", type: "restaurant", description: "", timeSlot: "morning", isMeal: true, priceLevel: "$" },
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.perDay[0]).toBe(75);
        expect(result.perDay[1]).toBe(30);
        expect(result.perDay[2]).toBe(12);
    });

    it("computes correct total and avgPerDay across multiple days", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "D1", activities: [
                { name: "L", type: "restaurant", description: "", timeSlot: "morning", isMeal: true, estimatedCost: 30 },
            ]},
            { day: 2, theme: "D2", activities: [
                { name: "D", type: "restaurant", description: "", timeSlot: "morning", isMeal: true, estimatedCost: 50 },
            ]},
        ];
        const result = computeFoodCost(days);
        expect(result.total).toBe(80);
        expect(result.avgPerDay).toBe(40);
    });

    it("returns avgPerDay=0 when days array is empty", () => {
        const result = computeFoodCost([]);
        expect(result.total).toBe(0);
        expect(result.avgPerDay).toBe(0);
    });

    it("skips non-isMeal activities (regular restaurant activity)", () => {
        const days: OptimizedDay[] = [
            { day: 1, theme: "D1", activities: [
                { name: "Cafe", type: "restaurant", description: "", timeSlot: "morning",
                  isMeal: false, estimatedCost: 100 },
            ]},
        ];
        expect(computeFoodCost(days).total).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// selectHotel
// ═════════════════════════════════════════════════════════════════════════════

describe("selectHotel — hotel selection", () => {
    function makeContext(hotels: ReturnType<typeof makeTestHotel>[], overrides = {}) {
        return {
            destination:  "Paris, France",
            startDate:    "2026-07-01",
            endDate:      "2026-07-03",
            durationDays: 3,
            days:         [{ day: 1, theme: "Arrival", activities: [] }],
            hotels,
            ...overrides,
        };
    }

    function makeTestHotel(overrides: Record<string, unknown> = {}) {
        return {
            name:       "Generic Hotel",
            priceRange: "$$" as const,
            area:       "Central",
            tags:       [] as string[],
            ...overrides,
        };
    }

    it("returns PLACEHOLDER hotel when hotels array is empty", () => {
        const ctx    = makeContext([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = selectHotel(ctx as any);
        expect(result.name).toContain("Accommodation");
    });

    it("returns the single hotel when only one option exists", () => {
        const hotel  = makeTestHotel({ name: "Solo Hotel" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = selectHotel(makeContext([hotel]) as any);
        expect(result.name).toBe("Solo Hotel");
    });

    it("prefers a hotel in Central/Downtown area (bonus score)", () => {
        const central    = makeTestHotel({ name: "City Centre Hotel", area: "Downtown" });
        const peripheral = makeTestHotel({ name: "Suburb Hotel",      area: "Outskirts" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result     = selectHotel(makeContext([peripheral, central]) as any);
        expect(result.name).toBe("City Centre Hotel");
    });

    it("penalises $$$$ hotel when budget < 1500", () => {
        const luxury  = makeTestHotel({ name: "Luxury Palace",  priceRange: "$$$$" as const });
        const midRange= makeTestHotel({ name: "Mid Hotel",      priceRange: "$$" as const });

        const ctx = { ...makeContext([luxury, midRange]), preferences: { budget: 1000 } };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = selectHotel(ctx as any);
        expect(result.name).toBe("Mid Hotel");
    });

    it("applies style bonus when hotel tag matches travel style", () => {
        const styleHotel = makeTestHotel({ name: "Boutique Hotel", tags: ["cultural", "central"] });
        const plainHotel = makeTestHotel({ name: "Plain Hotel",    tags: [] });

        const ctx = {
            ...makeContext([plainHotel, styleHotel]),
            preferences: { style: "cultural" },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = selectHotel(ctx as any);
        expect(result.name).toBe("Boutique Hotel");
    });

    it("breaks ties by hotel name (alphabetical)", () => {
        // Two identical hotels — lexicographically first name wins
        const hotelA = makeTestHotel({ name: "Alpha Hotel" });
        const hotelB = makeTestHotel({ name: "Zeta Hotel" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = selectHotel(makeContext([hotelB, hotelA]) as any);
        expect(result.name).toBe("Alpha Hotel");
    });
});
