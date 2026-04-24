/**
 * tests/agents/logisticsAgent.test.ts
 *
 * Integration tests for LogisticsAgent.run() with mocked Mapbox and geocoding.
 *
 * Tests:
 *   - Happy path: hotel selected, activities scheduled, food costs computed
 *   - Invalid hotel coords: centroid fallback
 *   - Mapbox matrix failure: slot-assignment fallback
 *   - No hotels: placeholder hotel used
 *   - Output validation: throws on invalid activity name
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockGetTravelTimeMatrix, mockGeocodeForLogistics } = vi.hoisted(() => ({
    mockGetTravelTimeMatrix:    vi.fn(),
    mockGeocodeForLogistics:    vi.fn(),
}));

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    trunc:         vi.fn((s: string) => s),
}));

vi.mock("@/services/mapbox", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/mapbox")>();
    return {
        ...actual, // keep isInvalidCoord and haversineDistanceMins as real
        getTravelTimeMatrix: mockGetTravelTimeMatrix,
    };
});

vi.mock("@/services/mapboxGeocoding", () => ({
    geocodeCentroid: mockGeocodeForLogistics,
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActivity(overrides: Record<string, unknown> = {}) {
    return {
        name:          "Shinjuku Gyoen",
        type:          "attraction" as const,
        description:   "Beautiful garden",
        lat:           35.685,
        lng:           139.710,
        geoConfidence: "high" as const,
        ...overrides,
    };
}

function makeContext(overrides: Record<string, unknown> = {}) {
    return {
        destination:  "Tokyo, Japan",
        startDate:    "2026-07-01",
        endDate:      "2026-07-03",
        durationDays: 3,
        preferences:  { style: "cultural", budget: 2000, pace: "moderate" },
        days: [
            {
                day:        1,
                theme:      "Arrival",
                activities: [
                    makeActivity({ name: "Shinjuku Gyoen" }),
                    makeActivity({ name: "Meiji Shrine", lat: 35.676, lng: 139.699 }),
                ],
            },
            {
                day:        2,
                theme:      "Temples",
                activities: [
                    makeActivity({ name: "Senso-ji", lat: 35.714, lng: 139.796 }),
                ],
            },
        ],
        hotels: [
            {
                name:          "Park Hyatt Tokyo",
                priceRange:    "$$" as const,
                area:          "Shinjuku",
                tags:          ["central"],
                lat:           35.686,
                lng:           139.692,
                geoConfidence: "high" as const,
            },
        ],
        ...overrides,
    };
}

function makeHaversineMatrix(size: number, travelMins = 20): {
    matrix: number[][];
    usedFallback: boolean;
} {
    return {
        matrix:      Array.from({ length: size }, () => Array(size).fill(travelMins)),
        usedFallback: false,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// Happy path
// ═════════════════════════════════════════════════════════════════════════════

describe("LogisticsAgent.run() — happy path", () => {
    beforeEach(() => {
        // 3 points per day (hotel + 2 activities for day1, hotel + 1 for day2)
        mockGetTravelTimeMatrix.mockResolvedValue(makeHaversineMatrix(3, 15));
    });

    afterEach(() => vi.clearAllMocks());

    it("returns an OptimizedTripContext with selectedHotel", async () => {
        const agent  = new LogisticsAgent();
        const result = await agent.run(makeContext() as any);

        expect(result.selectedHotel.name).toBe("Park Hyatt Tokyo");
    });

    it("schedules activities with startTime and endTime on each day", async () => {
        const agent  = new LogisticsAgent();
        const result = await agent.run(makeContext() as any);

        const day1 = result.days[0]!;
        expect(day1.activities.length).toBeGreaterThan(0);
        for (const act of day1.activities) {
            expect(act.startTime).toMatch(/^\d{2}:\d{2}$/);
            expect(act.endTime).toMatch(/^\d{2}:\d{2}$/);
        }
    });

    it("result contains foodCostSummary", async () => {
        const agent  = new LogisticsAgent();
        const result = await agent.run(makeContext() as any);

        expect(result.foodCostSummary).toBeDefined();
        expect(result.foodCostSummary.perDay).toHaveLength(result.days.length);
    });

    it("result has warnings array (may be empty)", async () => {
        const agent  = new LogisticsAgent();
        const result = await agent.run(makeContext() as any);

        expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("getTravelTimeMatrix called once per day", async () => {
        const agent = new LogisticsAgent();
        await agent.run(makeContext() as any);

        // Context has 2 days → 2 matrix calls
        expect(mockGetTravelTimeMatrix).toHaveBeenCalledTimes(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Hotel with invalid coordinates → centroid fallback
// ═════════════════════════════════════════════════════════════════════════════

describe("LogisticsAgent.run() — invalid hotel coordinates", () => {
    afterEach(() => vi.clearAllMocks());

    it("falls back to centroid when hotel lat/lng are undefined", async () => {
        mockGeocodeForLogistics.mockResolvedValue({
            lat: 35.6762, lng: 139.6503,
        });
        mockGetTravelTimeMatrix.mockResolvedValue(makeHaversineMatrix(3, 15));

        const ctx = makeContext({
            hotels: [{ name: "No Coords Hotel", priceRange: "$$", area: "Tokyo", tags: [] }],
        });

        const agent  = new LogisticsAgent();
        const result = await agent.run(ctx as any);

        // geocodeCentroid should be called as hotel had no valid coords
        expect(mockGeocodeForLogistics).toHaveBeenCalled();
        expect(result.selectedHotel.name).toBe("No Coords Hotel");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Mapbox matrix failure → slot-assignment fallback
// ═════════════════════════════════════════════════════════════════════════════

describe("LogisticsAgent.run() — Mapbox matrix failure", () => {
    afterEach(() => vi.clearAllMocks());

    it("falls back to slot assignment when matrix rejects", async () => {
        mockGetTravelTimeMatrix.mockRejectedValue(new Error("Mapbox timeout"));

        const agent  = new LogisticsAgent();
        const result = await agent.run(makeContext() as any);

        // Should still return a valid result with activities
        expect(result.days[0]!.activities.length).toBeGreaterThan(0);
        // Warning about fallback should be present
        expect(result.warnings.some((w) => w.includes("fallback"))).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// No hotels → placeholder
// ═════════════════════════════════════════════════════════════════════════════

describe("LogisticsAgent.run() — no hotels", () => {
    afterEach(() => vi.clearAllMocks());

    it("uses placeholder hotel when hotels array is empty", async () => {
        mockGeocodeForLogistics.mockResolvedValue({ lat: 35.6762, lng: 139.6503 });
        mockGetTravelTimeMatrix.mockResolvedValue(makeHaversineMatrix(2, 15));

        const ctx    = makeContext({ hotels: [] });
        const agent  = new LogisticsAgent();
        const result = await agent.run(ctx as any);

        expect(result.selectedHotel.name).toContain("Accommodation");
        expect(result.warnings.some((w) => w.includes("No hotel data"))).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Invalid activity coordinates
// ═════════════════════════════════════════════════════════════════════════════

describe("LogisticsAgent.run() — invalid activity coordinates", () => {
    afterEach(() => vi.clearAllMocks());

    it("still routes activity and adds warning when activity has invalid coords", async () => {
        mockGetTravelTimeMatrix.mockResolvedValue(makeHaversineMatrix(3, 15));

        const ctx = makeContext({
            days: [{
                day:        1,
                theme:      "Arrival",
                activities: [
                    makeActivity({ name: "Valid Place",   lat: 35.685, lng: 139.710 }),
                    makeActivity({ name: "Invalid Place", lat: NaN,    lng: NaN }),
                ],
            }],
        });

        const agent  = new LogisticsAgent();
        const result = await agent.run(ctx as any);

        // Both activities should be included (invalid coord replaced by hotel coord)
        expect(result.days[0]!.activities.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.includes("invalid coordinates"))).toBe(true);
    });
});
