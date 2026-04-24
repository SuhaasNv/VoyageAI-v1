/**
 * tests/services/geocoding.test.ts
 *
 * Unit tests for pure/exported functions in src/services/mapboxGeocoding.ts:
 *   - isDenseCityDestination
 *   - isValidGeoCoord
 *   - maxDistanceForFeatureType
 *
 * No mocking needed — all three are pure functions.
 */

import { describe, it, expect } from "vitest";
import {
    isDenseCityDestination,
    isValidGeoCoord,
    maxDistanceForFeatureType,
} from "@/services/mapboxGeocoding";

// ═════════════════════════════════════════════════════════════════════════════
// isDenseCityDestination
// ═════════════════════════════════════════════════════════════════════════════

describe("isDenseCityDestination — returns true for known dense cities", () => {
    const denseCities = [
        "Tokyo",
        "Osaka, Japan",
        "3 days in tokyo",
        "New York City",
        "New York",
        "London, UK",
        "Paris",
        "Seoul",
        "Singapore",
        "Hong Kong",
        "Bangkok",
        "Mumbai",
        "Berlin",
        "Barcelona",
        "Amsterdam",
        "Istanbul",
        "Mexico City",
        "Kyoto, Japan",
        "Rome",
        "Madrid",
        "Cairo",
    ];

    for (const city of denseCities) {
        it(`recognises "${city}"`, () => {
            expect(isDenseCityDestination(city)).toBe(true);
        });
    }
});

describe("isDenseCityDestination — returns false for non-dense destinations", () => {
    const sparse = [
        "Bali",
        "Maldives",
        "Iceland",
        "Tuscany",
        "Costa Rica",
        "Patagonia",
        "Queenstown",
    ];

    for (const dest of sparse) {
        it(`rejects "${dest}"`, () => {
            expect(isDenseCityDestination(dest)).toBe(false);
        });
    }
});

describe("isDenseCityDestination — edge cases", () => {
    it("is case-insensitive (TOKYO)", () => {
        expect(isDenseCityDestination("TOKYO")).toBe(true);
    });

    it("handles leading/trailing whitespace", () => {
        expect(isDenseCityDestination("  london  ")).toBe(true);
    });

    it("returns false for empty string", () => {
        expect(isDenseCityDestination("")).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// isValidGeoCoord
// ═════════════════════════════════════════════════════════════════════════════

describe("isValidGeoCoord — returns true for valid coordinates", () => {
    it("Paris (48.8566, 2.3522)", () => {
        expect(isValidGeoCoord(48.8566, 2.3522)).toBe(true);
    });

    it("Sydney (-33.8688, 151.2093)", () => {
        expect(isValidGeoCoord(-33.8688, 151.2093)).toBe(true);
    });

    it("boundary: lat=90, lng=180", () => {
        expect(isValidGeoCoord(90, 180)).toBe(true);
    });

    it("boundary: lat=-90, lng=-180", () => {
        expect(isValidGeoCoord(-90, -180)).toBe(true);
    });

    it("small non-zero (0.001, 0.001)", () => {
        expect(isValidGeoCoord(0.001, 0.001)).toBe(true);
    });
});

describe("isValidGeoCoord — returns false for invalid coordinates", () => {
    it("(0, 0) — null island", () => {
        expect(isValidGeoCoord(0, 0)).toBe(false);
    });

    it("NaN lat", () => {
        expect(isValidGeoCoord(NaN, 10)).toBe(false);
    });

    it("NaN lng", () => {
        expect(isValidGeoCoord(10, NaN)).toBe(false);
    });

    it("Infinity lat", () => {
        expect(isValidGeoCoord(Infinity, 10)).toBe(false);
    });

    it("lat > 90", () => {
        expect(isValidGeoCoord(91, 10)).toBe(false);
    });

    it("lat < -90", () => {
        expect(isValidGeoCoord(-91, 10)).toBe(false);
    });

    it("lng > 180", () => {
        expect(isValidGeoCoord(10, 181)).toBe(false);
    });

    it("lng < -180", () => {
        expect(isValidGeoCoord(10, -181)).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// maxDistanceForFeatureType
// ═════════════════════════════════════════════════════════════════════════════

describe("maxDistanceForFeatureType", () => {
    it("country type returns 150 km", () => {
        expect(maxDistanceForFeatureType("country")).toBe(150);
    });

    it("region type returns 120 km", () => {
        expect(maxDistanceForFeatureType("region")).toBe(120);
    });

    it("place type (non-dense) returns 50 km", () => {
        expect(maxDistanceForFeatureType("place")).toBe(50);
    });

    it("place type + denseCity=true returns 30 km", () => {
        expect(maxDistanceForFeatureType("place", true)).toBe(30);
    });

    it("place type + denseCity=false returns 50 km", () => {
        expect(maxDistanceForFeatureType("place", false)).toBe(50);
    });

    it("country ignores denseCity flag", () => {
        expect(maxDistanceForFeatureType("country", true)).toBe(150);
    });

    it("region ignores denseCity flag", () => {
        expect(maxDistanceForFeatureType("region", true)).toBe(120);
    });

    it("dense city threshold (30) < standard city (50) < region (120) < country (150)", () => {
        const dense    = maxDistanceForFeatureType("place", true);
        const city     = maxDistanceForFeatureType("place", false);
        const region   = maxDistanceForFeatureType("region");
        const country  = maxDistanceForFeatureType("country");
        expect(dense).toBeLessThan(city);
        expect(city).toBeLessThan(region);
        expect(region).toBeLessThan(country);
    });
});
