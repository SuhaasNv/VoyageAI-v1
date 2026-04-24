/**
 * tests/services/mapbox.test.ts
 *
 * Unit tests for src/services/mapbox.ts:
 *   - isInvalidCoord           (pure)
 *   - haversineDistanceMins    (pure)
 *   - getTravelTimeMatrix      (async — fetch + Redis mocked)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// ─── Mock Redis so we control cache hits/misses ────────────────────────────────
const { mockGetRedisClient } = vi.hoisted(() => ({
    mockGetRedisClient: vi.fn(() => null),
}));

vi.mock("@/lib/redis", () => ({
    getRedisClient: mockGetRedisClient,
    hasRedisConfig: vi.fn(() => false),
}));

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError:      vi.fn(),
    logInfo:       vi.fn(),
}));

vi.mock("@/infrastructure/env", () => ({
    env: { NEXT_PUBLIC_MAPBOX_TOKEN: undefined },
}));

import { isInvalidCoord, haversineDistanceMins, getTravelTimeMatrix } from "@/services/mapbox";

// ═════════════════════════════════════════════════════════════════════════════
// isInvalidCoord
// ═════════════════════════════════════════════════════════════════════════════

describe("isInvalidCoord — returns true (invalid) for", () => {
    it("undefined lat", () => {
        expect(isInvalidCoord(undefined, 10)).toBe(true);
    });

    it("undefined lng", () => {
        expect(isInvalidCoord(10, undefined)).toBe(true);
    });

    it("both undefined", () => {
        expect(isInvalidCoord(undefined, undefined)).toBe(true);
    });

    it("NaN lat", () => {
        expect(isInvalidCoord(NaN, 10)).toBe(true);
    });

    it("NaN lng", () => {
        expect(isInvalidCoord(10, NaN)).toBe(true);
    });

    it("Infinity lat", () => {
        expect(isInvalidCoord(Infinity, 10)).toBe(true);
    });

    it("-Infinity lng", () => {
        expect(isInvalidCoord(10, -Infinity)).toBe(true);
    });

    it("(0, 0) — null island", () => {
        expect(isInvalidCoord(0, 0)).toBe(true);
    });

    it("lat > 90", () => {
        expect(isInvalidCoord(91, 10)).toBe(true);
    });

    it("lat < -90", () => {
        expect(isInvalidCoord(-91, 10)).toBe(true);
    });

    it("lng > 180", () => {
        expect(isInvalidCoord(10, 181)).toBe(true);
    });

    it("lng < -180", () => {
        expect(isInvalidCoord(10, -181)).toBe(true);
    });
});

describe("isInvalidCoord — returns false (valid) for", () => {
    it("Paris: (48.8566, 2.3522)", () => {
        expect(isInvalidCoord(48.8566, 2.3522)).toBe(false);
    });

    it("Tokyo: (35.6762, 139.6503)", () => {
        expect(isInvalidCoord(35.6762, 139.6503)).toBe(false);
    });

    it("extreme valid values: lat=90, lng=180", () => {
        expect(isInvalidCoord(90, 180)).toBe(false);
    });

    it("extreme valid values: lat=-90, lng=-180", () => {
        expect(isInvalidCoord(-90, -180)).toBe(false);
    });

    it("small but non-zero: (0.001, 0.001)", () => {
        expect(isInvalidCoord(0.001, 0.001)).toBe(false);
    });

    it("negative coords (valid southern hemisphere)", () => {
        expect(isInvalidCoord(-33.8688, 151.2093)).toBe(false); // Sydney
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// haversineDistanceMins
// ═════════════════════════════════════════════════════════════════════════════

describe("haversineDistanceMins — distance calculation", () => {
    it("same point returns minimum 5 minutes", () => {
        const paris = { lat: 48.8566, lng: 2.3522 };
        expect(haversineDistanceMins(paris, paris)).toBe(5);
    });

    it("Paris → Eiffel Tower (~2 km) returns a reasonable short time", () => {
        const centreParis = { lat: 48.8566, lng: 2.3522 };
        const eiffelTower = { lat: 48.8584, lng: 2.2945 };
        const mins = haversineDistanceMins(centreParis, eiffelTower);
        // ~2 km at 35 km/h × 1.35 ≈ 5 min; minimum is 5
        expect(mins).toBeGreaterThanOrEqual(5);
        expect(mins).toBeLessThan(20); // should not be unreasonably long
    });

    it("London → Paris (~340 km) returns a large time (> 100 min)", () => {
        const london = { lat: 51.5074, lng: -0.1278 };
        const paris  = { lat: 48.8566, lng:  2.3522 };
        const mins   = haversineDistanceMins(london, paris);
        expect(mins).toBeGreaterThan(100);
    });

    it("is symmetric: A→B ≈ B→A (within rounding)", () => {
        const tokyo  = { lat: 35.6762, lng: 139.6503 };
        const kyoto  = { lat: 35.0116, lng: 135.7681 };
        const ab = haversineDistanceMins(tokyo, kyoto);
        const ba = haversineDistanceMins(kyoto, tokyo);
        // May differ by ±1 due to ceil and haversine formula
        expect(Math.abs(ab - ba)).toBeLessThanOrEqual(1);
    });

    it("result is always a positive integer (ceil)", () => {
        const a = { lat: 48.8566, lng: 2.3522 };
        const b = { lat: 48.9000, lng: 2.4000 };
        const mins = haversineDistanceMins(a, b);
        expect(Number.isInteger(mins)).toBe(true);
        expect(mins).toBeGreaterThan(0);
    });

    it("Nairobi → Cape Town (~4000 km) is capped only by downstream logic — raw value is large", () => {
        const nairobi  = { lat: -1.2921, lng:  36.8219 };
        const capeTown = { lat: -33.9249, lng: 18.4241 };
        const mins = haversineDistanceMins(nairobi, capeTown);
        // ~4000 km at 35 km/h × 1.35 = very large value
        expect(mins).toBeGreaterThan(5000);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getTravelTimeMatrix
// ═════════════════════════════════════════════════════════════════════════════

const PARIS  = { lat: 48.8566, lng: 2.3522 };
const LOUVRE = { lat: 48.8606, lng: 2.3376 };
const EIFFEL = { lat: 48.8584, lng: 2.2945 };

describe("getTravelTimeMatrix — fewer than 2 coords", () => {
    it("returns [[0]] without usedFallback when coords.length < 2", async () => {
        const result = await getTravelTimeMatrix([PARIS]);
        expect(result).toEqual({ matrix: [[0]], usedFallback: false });
    });
});

describe("getTravelTimeMatrix — no Mapbox token (Haversine fallback)", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("falls back to Haversine when MAPBOX_TOKEN is absent", async () => {
        vi.stubEnv("MAPBOX_TOKEN", "");
        const result = await getTravelTimeMatrix([PARIS, LOUVRE, EIFFEL]);
        expect(result.usedFallback).toBe(true);
        // 3 × 3 matrix
        expect(result.matrix).toHaveLength(3);
        expect(result.matrix[0]).toHaveLength(3);
    });
});

describe("getTravelTimeMatrix — Mapbox fetch succeeds", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubEnv("MAPBOX_TOKEN", "pk.test-token");
        vi.stubGlobal("fetch", mockFetch);
        mockFetch.mockReset();
        mockGetRedisClient.mockReturnValue(null);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        mockGetRedisClient.mockReturnValue(null);
    });

    it("returns the matrix from Mapbox on success", async () => {
        const durations = [[0, 120, 240], [120, 0, 180], [240, 180, 0]];
        mockFetch.mockResolvedValue({
            ok:   true,
            json: async () => ({ durations }),
        });

        const result = await getTravelTimeMatrix([PARIS, LOUVRE, EIFFEL]);
        expect(result.usedFallback).toBe(false);
        expect(result.matrix).toHaveLength(3);
        // Mapbox durations are in seconds — converted to minutes (ceil)
        expect(result.matrix[0]![1]).toBe(Math.ceil(120 / 60));
    });

    it("fills null cells with Haversine value", async () => {
        const durations = [[0, null], [120, 0]];
        mockFetch.mockResolvedValue({
            ok:   true,
            json: async () => ({ durations }),
        });

        const result = await getTravelTimeMatrix([PARIS, LOUVRE]);
        expect(result.usedFallback).toBe(false);
        // null cell should be Haversine estimate
        expect(result.matrix[0]![1]).toBeGreaterThanOrEqual(5);
    });

    it("falls back to Haversine on non-OK HTTP response", async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 429 });

        const result = await getTravelTimeMatrix([PARIS, LOUVRE, EIFFEL]);
        expect(result.usedFallback).toBe(true);
    });

    it("falls back to Haversine when response has no durations field", async () => {
        mockFetch.mockResolvedValue({
            ok:   true,
            json: async () => ({ message: "ok" }),
        });

        const result = await getTravelTimeMatrix([PARIS, LOUVRE, EIFFEL]);
        expect(result.usedFallback).toBe(true);
    });

    it("falls back to Haversine on network fetch error", async () => {
        mockFetch.mockRejectedValue(new Error("Network failure"));

        const result = await getTravelTimeMatrix([PARIS, LOUVRE, EIFFEL]);
        expect(result.usedFallback).toBe(true);
    });

    it("returns cached matrix on Redis hit (new format)", async () => {
        const cachedPayload = JSON.stringify({ matrix: [[0, 5], [5, 0]], usedFallback: false });
        const mockRedis = { get: vi.fn().mockResolvedValue(cachedPayload) };
        mockGetRedisClient.mockReturnValue(mockRedis);

        const result = await getTravelTimeMatrix([PARIS, LOUVRE]);
        expect(result.matrix).toEqual([[0, 5], [5, 0]]);
        expect(result.usedFallback).toBe(false);
        // Fetch should NOT have been called
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns cached matrix on Redis hit (legacy array format)", async () => {
        const legacyMatrix = [[0, 5], [5, 0]];
        const mockRedis = { get: vi.fn().mockResolvedValue(JSON.stringify(legacyMatrix)) };
        mockGetRedisClient.mockReturnValue(mockRedis);

        const result = await getTravelTimeMatrix([PARIS, LOUVRE]);
        expect(result.matrix).toEqual(legacyMatrix);
        expect(result.usedFallback).toBe(false);
    });
});
