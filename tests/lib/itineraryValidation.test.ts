/**
 * tests/lib/itineraryValidation.test.ts
 *
 * Unit tests for src/lib/ai/itineraryValidation.ts:
 *   - validateItineraryStructure — budget, empty days, coord bounds
 *   - ItineraryValidationError — error shape and codes
 */

import { describe, it, expect } from "vitest";
import {
    validateItineraryStructure,
    ItineraryValidationError,
} from "@/lib/ai/itineraryValidation";
import type { Itinerary } from "@/lib/ai/schemas";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeActivity(name: string, lat?: number, lng?: number) {
    return {
        id:               `act-${name}`,
        name,
        type:             "sightseeing" as const,
        description:      "Description",
        startTime:        "09:00",
        endTime:          "11:00",
        duration_minutes: 120,
        location: { name, lat, lng },
        estimatedCost:    { amount: 50, currency: "USD" },
        aiGenerated:      true,
        tags:             [],
    };
}

function makeItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
    return {
        tripId:      "trip-1",
        destination: "Tokyo, Japan",
        startDate:   "2026-07-01",
        endDate:     "2026-07-03",
        totalDays:   2,
        days: [
            {
                day:               1,
                date:              "2026-07-01",
                theme:             "Arrival",
                activities:        [makeActivity("Shinjuku Gyoen", 35.685, 139.710)],
                totalCost:         { amount: 200, currency: "USD" },
                dailyFatigueScore: 5,
                tips:              [],
            },
            {
                day:               2,
                date:              "2026-07-02",
                theme:             "Culture",
                activities:        [makeActivity("Senso-ji", 35.714, 139.796)],
                totalCost:         { amount: 150, currency: "USD" },
                dailyFatigueScore: 4,
                tips:              [],
            },
        ],
        totalEstimatedCost: { amount: 350, currency: "USD", breakdown: {} },
        aiInsights:         [],
        pacingAnalysis:     { overallScore: 7, warnings: [], suggestions: [] },
        generatedAt:        new Date().toISOString(),
        modelVersion:       "test-1.0",
        ...overrides,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// ItineraryValidationError
// ═════════════════════════════════════════════════════════════════════════════

describe("ItineraryValidationError", () => {
    it("is an instanceof Error", () => {
        const e = new ItineraryValidationError("msg", "STRUCTURE_INVALID");
        expect(e).toBeInstanceOf(Error);
    });

    it("name is 'ItineraryValidationError'", () => {
        const e = new ItineraryValidationError("msg", "BUDGET_EXCEEDED");
        expect(e.name).toBe("ItineraryValidationError");
    });

    it("carries the code property", () => {
        const e = new ItineraryValidationError("msg", "EMPTY_DAY");
        expect(e.code).toBe("EMPTY_DAY");
    });

    it("carries the message property", () => {
        const e = new ItineraryValidationError("Test message", "INVALID_COORDINATES");
        expect(e.message).toBe("Test message");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// validateItineraryStructure — happy path
// ═════════════════════════════════════════════════════════════════════════════

describe("validateItineraryStructure — valid itinerary does not throw", () => {
    it("does not throw for a well-formed itinerary within budget", () => {
        const itinerary = makeItinerary();
        expect(() =>
            validateItineraryStructure(itinerary, { maxBudget: 1000 })
        ).not.toThrow();
    });

    it("accepts exact budget with flexible tolerance (20% over allowed)", () => {
        const itinerary = makeItinerary({
            totalEstimatedCost: { amount: 1190, currency: "USD", breakdown: {} },
        });
        // 1190 < 1000 * 1.2 = 1200 → OK
        expect(() =>
            validateItineraryStructure(itinerary, { maxBudget: 1000, flexibility: "flexible" })
        ).not.toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURE_INVALID — zero activities
// ═════════════════════════════════════════════════════════════════════════════

describe("validateItineraryStructure — STRUCTURE_INVALID (0 activities)", () => {
    it("throws when all days have 0 activities combined", () => {
        // Bypass Zod min(1) constraint by casting
        const itinerary = makeItinerary({
            days: [
                {
                    day: 1, date: "2026-07-01", theme: "Empty",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    activities: [] as any,
                    totalCost: { amount: 0, currency: "USD" },
                    dailyFatigueScore: 0, tips: [],
                },
            ],
        });
        expect(() =>
            validateItineraryStructure(itinerary, { maxBudget: 1000 })
        ).toThrow(ItineraryValidationError);
    });

    it("error code is STRUCTURE_INVALID for zero activities", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Empty",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                activities: [] as any,
                totalCost: { amount: 0, currency: "USD" },
                dailyFatigueScore: 0, tips: [],
            }],
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
        } catch (e) {
            expect(e).toBeInstanceOf(ItineraryValidationError);
            expect((e as ItineraryValidationError).code).toBe("STRUCTURE_INVALID");
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// EMPTY_DAY — a specific day has no activities
// ═════════════════════════════════════════════════════════════════════════════

describe("validateItineraryStructure — EMPTY_DAY", () => {
    it("throws EMPTY_DAY when one day has no activities", () => {
        const itinerary = makeItinerary({
            days: [
                {
                    day: 1, date: "2026-07-01", theme: "Arrival",
                    activities: [makeActivity("Place A")],
                    totalCost: { amount: 100, currency: "USD" },
                    dailyFatigueScore: 5, tips: [],
                },
                {
                    day: 2, date: "2026-07-02", theme: "Rest",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    activities: [] as any, // empty
                    totalCost: { amount: 0, currency: "USD" },
                    dailyFatigueScore: 0, tips: [],
                },
            ],
            totalEstimatedCost: { amount: 100, currency: "USD", breakdown: {} },
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
            expect.fail("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(ItineraryValidationError);
            expect((e as ItineraryValidationError).code).toBe("EMPTY_DAY");
            expect((e as ItineraryValidationError).message).toContain("2");
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// BUDGET_EXCEEDED
// ═════════════════════════════════════════════════════════════════════════════

describe("validateItineraryStructure — BUDGET_EXCEEDED", () => {
    it("throws when total cost exceeds flexible ceiling (1.2x)", () => {
        const itinerary = makeItinerary({
            totalEstimatedCost: { amount: 1201, currency: "USD", breakdown: {} },
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000, flexibility: "flexible" });
            expect.fail("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(ItineraryValidationError);
            expect((e as ItineraryValidationError).code).toBe("BUDGET_EXCEEDED");
        }
    });

    it("throws when total cost exceeds strict ceiling (1.05x)", () => {
        const itinerary = makeItinerary({
            totalEstimatedCost: { amount: 1060, currency: "USD", breakdown: {} },
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000, flexibility: "strict" });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("BUDGET_EXCEEDED");
        }
    });

    it("throws when total cost exceeds very-flexible ceiling (1.35x)", () => {
        const itinerary = makeItinerary({
            totalEstimatedCost: { amount: 1360, currency: "USD", breakdown: {} },
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000, flexibility: "very-flexible" });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("BUDGET_EXCEEDED");
        }
    });

    it("does NOT throw when exactly at the flexible ceiling (1200 ≤ 1000*1.2)", () => {
        const itinerary = makeItinerary({
            totalEstimatedCost: { amount: 1200, currency: "USD", breakdown: {} },
        });
        expect(() =>
            validateItineraryStructure(itinerary, { maxBudget: 1000, flexibility: "flexible" })
        ).not.toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVALID_COORDINATES
// ═════════════════════════════════════════════════════════════════════════════

describe("validateItineraryStructure — INVALID_COORDINATES", () => {
    it("throws for lat > 90", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Day 1",
                activities: [makeActivity("Bad Place", 91, 10)],
                totalCost: { amount: 100, currency: "USD" },
                dailyFatigueScore: 5, tips: [],
            }],
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("INVALID_COORDINATES");
        }
    });

    it("throws for lat < -90", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Day 1",
                activities: [makeActivity("Bad Place", -91, 10)],
                totalCost: { amount: 100, currency: "USD" },
                dailyFatigueScore: 5, tips: [],
            }],
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("INVALID_COORDINATES");
        }
    });

    it("throws for lng > 180", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Day 1",
                activities: [makeActivity("Bad Place", 35, 181)],
                totalCost: { amount: 100, currency: "USD" },
                dailyFatigueScore: 5, tips: [],
            }],
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("INVALID_COORDINATES");
        }
    });

    it("throws for lng < -180", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Day 1",
                activities: [makeActivity("Bad Place", 35, -181)],
                totalCost: { amount: 100, currency: "USD" },
                dailyFatigueScore: 5, tips: [],
            }],
        });
        try {
            validateItineraryStructure(itinerary, { maxBudget: 1000 });
            expect.fail("Should have thrown");
        } catch (e) {
            expect((e as ItineraryValidationError).code).toBe("INVALID_COORDINATES");
        }
    });

    it("does NOT throw for undefined lat/lng (omitted coordinates)", () => {
        const itinerary = makeItinerary({
            days: [{
                day: 1, date: "2026-07-01", theme: "Day 1",
                activities: [makeActivity("No Coords", undefined, undefined)],
                totalCost: { amount: 100, currency: "USD" },
                dailyFatigueScore: 5, tips: [],
            }],
        });
        expect(() =>
            validateItineraryStructure(itinerary, { maxBudget: 1000 })
        ).not.toThrow();
    });
});
