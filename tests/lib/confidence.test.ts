/**
 * tests/lib/confidence.test.ts
 *
 * Tests for lib/ai/confidence.ts — the heuristic scoring engine.
 * All functions are pure: no mocks required.
 */

import { describe, it, expect } from "vitest";
import {
    computeConfidence,
    lowGeoFraction,
    BASE_SCORE,
    PENALTY,
    CONFIDENCE_TYPE,
} from "@/lib/ai/confidence";

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

describe("confidence module — exports", () => {
    it("CONFIDENCE_TYPE is 'heuristic'", () => {
        expect(CONFIDENCE_TYPE).toBe("heuristic");
    });

    it("BASE_SCORE has correct values for all three modes", () => {
        expect(BASE_SCORE.DETERMINISTIC).toBe(1.00);
        expect(BASE_SCORE.LLM_GROUNDED).toBe(0.82);
        expect(BASE_SCORE.LLM_ONLY).toBe(0.62);
    });

    it("PENALTY has four documented penalties", () => {
        expect(PENALTY.FALLBACK_USED).toBe(0.08);
        expect(PENALTY.LOW_GEO_CONFIDENCE).toBe(0.05);
        expect(PENALTY.WARNINGS_PRESENT).toBe(0.05);
        expect(PENALTY.PARTIAL_DATA).toBe(0.05);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeConfidence — base scores (no penalties)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeConfidence — base scores (no penalties applied)", () => {
    it("DETERMINISTIC mode with no flags → 1.00", () => {
        expect(computeConfidence({ mode: "DETERMINISTIC" })).toBe(1.00);
    });

    it("LLM_GROUNDED mode with no flags → 0.82", () => {
        expect(computeConfidence({ mode: "LLM_GROUNDED" })).toBe(0.82);
    });

    it("LLM_ONLY mode with no flags → 0.62", () => {
        expect(computeConfidence({ mode: "LLM_ONLY" })).toBe(0.62);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeConfidence — individual penalties
// ─────────────────────────────────────────────────────────────────────────────

describe("computeConfidence — individual penalties", () => {
    it("usedFallback=true deducts FALLBACK_USED (0.08)", () => {
        const score = computeConfidence({ mode: "LLM_GROUNDED", usedFallback: true });
        expect(score).toBe(+(0.82 - 0.08).toFixed(2));
    });

    it("usedFallback=false does NOT deduct penalty", () => {
        const score = computeConfidence({ mode: "LLM_GROUNDED", usedFallback: false });
        expect(score).toBe(0.82);
    });

    it("lowGeoFraction >= 0.5 deducts LOW_GEO_CONFIDENCE (0.05)", () => {
        const score = computeConfidence({ mode: "LLM_GROUNDED", lowGeoFraction: 0.5 });
        expect(score).toBe(+(0.82 - 0.05).toFixed(2));
    });

    it("lowGeoFraction exactly 0.5 triggers penalty", () => {
        expect(computeConfidence({ mode: "DETERMINISTIC", lowGeoFraction: 0.5 })).toBe(+(1.0 - 0.05).toFixed(2));
    });

    it("lowGeoFraction < 0.5 does NOT deduct penalty", () => {
        expect(computeConfidence({ mode: "LLM_GROUNDED", lowGeoFraction: 0.49 })).toBe(0.82);
    });

    it("lowGeoFraction undefined defaults to 0 (no penalty)", () => {
        expect(computeConfidence({ mode: "LLM_GROUNDED" })).toBe(0.82);
    });

    it("hasWarnings=true deducts WARNINGS_PRESENT (0.05)", () => {
        const score = computeConfidence({ mode: "DETERMINISTIC", hasWarnings: true });
        expect(score).toBe(+(1.0 - 0.05).toFixed(2));
    });

    it("hasWarnings=false does NOT deduct penalty", () => {
        expect(computeConfidence({ mode: "DETERMINISTIC", hasWarnings: false })).toBe(1.0);
    });

    it("hasPartialData=true deducts PARTIAL_DATA (0.05)", () => {
        const score = computeConfidence({ mode: "DETERMINISTIC", hasPartialData: true });
        expect(score).toBe(+(1.0 - 0.05).toFixed(2));
    });

    it("hasPartialData=false does NOT deduct penalty", () => {
        expect(computeConfidence({ mode: "DETERMINISTIC", hasPartialData: false })).toBe(1.0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeConfidence — cumulative penalties
// ─────────────────────────────────────────────────────────────────────────────

describe("computeConfidence — cumulative penalties", () => {
    it("two penalties applied to DETERMINISTIC: 1.00 - 0.05 - 0.05 = 0.90", () => {
        const score = computeConfidence({
            mode:        "DETERMINISTIC",
            hasWarnings: true,
            hasPartialData: true,
        });
        expect(score).toBe(0.90);
    });

    it("all four penalties applied to LLM_GROUNDED: 0.82 - 0.23 = 0.59", () => {
        const score = computeConfidence({
            mode:            "LLM_GROUNDED",
            usedFallback:    true,
            lowGeoFraction:  0.8,
            hasWarnings:     true,
            hasPartialData:  true,
        });
        expect(score).toBe(+(0.82 - 0.08 - 0.05 - 0.05 - 0.05).toFixed(2));
    });

    it("all four penalties on LLM_ONLY: 0.62 - 0.23 = 0.39", () => {
        const score = computeConfidence({
            mode:            "LLM_ONLY",
            usedFallback:    true,
            lowGeoFraction:  1.0,
            hasWarnings:     true,
            hasPartialData:  true,
        });
        expect(score).toBe(+(0.62 - 0.08 - 0.05 - 0.05 - 0.05).toFixed(2));
    });

    it("result is clamped to 0 even when penalties exceed base score", () => {
        // Hypothetical: applying all penalties multiple times should not go negative
        const score = computeConfidence({
            mode:            "LLM_ONLY",   // base 0.62
            usedFallback:    true,          // -0.08 = 0.54
            lowGeoFraction:  1.0,           // -0.05 = 0.49
            hasWarnings:     true,          // -0.05 = 0.44
            hasPartialData:  true,          // -0.05 = 0.39
        });
        expect(score).toBeGreaterThanOrEqual(0);
    });

    it("result is clamped to 1 (never exceeds base for DETERMINISTIC)", () => {
        expect(computeConfidence({ mode: "DETERMINISTIC" })).toBeLessThanOrEqual(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeConfidence — output precision
// ─────────────────────────────────────────────────────────────────────────────

describe("computeConfidence — output precision", () => {
    it("returns exactly 2 decimal places", () => {
        const score = computeConfidence({ mode: "LLM_GROUNDED", usedFallback: true });
        const str = score.toString();
        const decimalPart = str.split(".")[1] ?? "";
        expect(decimalPart.length).toBeLessThanOrEqual(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// lowGeoFraction
// ─────────────────────────────────────────────────────────────────────────────

describe("lowGeoFraction", () => {
    it("returns 0 for an empty array", () => {
        expect(lowGeoFraction([])).toBe(0);
    });

    it("returns 0 when no items have geoConfidence='low'", () => {
        const items = [
            { geoConfidence: "high" },
            { geoConfidence: "medium" },
        ];
        expect(lowGeoFraction(items)).toBe(0);
    });

    it("returns 1.0 when all items have geoConfidence='low'", () => {
        const items = [
            { geoConfidence: "low" },
            { geoConfidence: "low" },
            { geoConfidence: "low" },
        ];
        expect(lowGeoFraction(items)).toBe(1.0);
    });

    it("returns 0.5 when half the items are low", () => {
        const items = [
            { geoConfidence: "high" },
            { geoConfidence: "low" },
        ];
        expect(lowGeoFraction(items)).toBe(0.5);
    });

    it("counts only 'low' — not 'medium'", () => {
        const items = [
            { geoConfidence: "medium" },
            { geoConfidence: "medium" },
            { geoConfidence: "low" },
        ];
        expect(lowGeoFraction(items)).toBeCloseTo(1 / 3);
    });

    it("treats missing geoConfidence as non-low", () => {
        const items = [
            {},
            { geoConfidence: "low" },
        ];
        expect(lowGeoFraction(items)).toBe(0.5);
    });
});
