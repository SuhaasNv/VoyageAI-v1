/**
 * tests/lib/prompts.test.ts
 *
 * Unit tests for exported functions in src/lib/ai/prompts/index.ts:
 *   - buildFullPrompt
 *   - estimateTokenCount
 *   - truncateContext
 *   - buildTravelDNAContext (smoke test)
 *   - buildItineraryContext (smoke test)
 *   - SYSTEM_PROMPTS and SCHEMA_INSTRUCTIONS constants exist
 */

import { describe, it, expect } from "vitest";
import {
    buildFullPrompt,
    estimateTokenCount,
    truncateContext,
    buildTravelDNAContext,
    buildItineraryContext,
    SYSTEM_PROMPTS,
    SCHEMA_INSTRUCTIONS,
    MAX_CONTEXT_TOKENS,
} from "@/lib/ai/prompts";

// ═════════════════════════════════════════════════════════════════════════════
// buildFullPrompt
// ═════════════════════════════════════════════════════════════════════════════

describe("buildFullPrompt", () => {
    const layers = {
        system:  "You are a travel planner.",
        context: "Trip to Tokyo.",
        schema:  '{"type":"object"}',
        task:    "Generate a 3-day itinerary.",
    };

    it("returns a non-empty string", () => {
        const result = buildFullPrompt(layers);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });

    it("includes all four layers in the output", () => {
        const result = buildFullPrompt(layers);
        expect(result).toContain(layers.system);
        expect(result).toContain(layers.context);
        expect(result).toContain(layers.schema);
        expect(result).toContain(layers.task);
    });

    it("separates sections with '---'", () => {
        const result = buildFullPrompt(layers);
        expect(result).toContain("---");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// estimateTokenCount
// ═════════════════════════════════════════════════════════════════════════════

describe("estimateTokenCount", () => {
    it("returns a positive integer for non-empty text", () => {
        const count = estimateTokenCount("Hello, world!");
        expect(count).toBeGreaterThan(0);
        expect(Number.isInteger(count)).toBe(true);
    });

    it("returns 0 for an empty string", () => {
        expect(estimateTokenCount("")).toBe(0);
    });

    it("approximates ~1 token per 4 chars (10 chars → ceil(10/4) = 3)", () => {
        expect(estimateTokenCount("1234567890")).toBe(3);
    });

    it("scales linearly with text length", () => {
        const short  = estimateTokenCount("abcd");
        const double = estimateTokenCount("abcdabcd");
        expect(double).toBe(short * 2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// truncateContext
// ═════════════════════════════════════════════════════════════════════════════

describe("truncateContext", () => {
    it("returns the original string if shorter than maxChars", () => {
        const short = "Short context.";
        expect(truncateContext(short, 100)).toBe(short);
    });

    it("truncates to maxChars and appends [Context truncated]", () => {
        const long   = "a".repeat(50001);
        const result = truncateContext(long, 50000);
        expect(result).toContain("[Context truncated to fit token limit]");
        expect(result.length).toBeGreaterThan(50000);
        expect(result.startsWith("a".repeat(50000))).toBe(true);
    });

    it("uses default 48000 chars when maxChars is not specified", () => {
        const long   = "x".repeat(50000);
        const result = truncateContext(long);
        expect(result).toContain("[Context truncated to fit token limit]");
    });

    it("returns string unchanged when exactly at limit", () => {
        const exact = "e".repeat(48000);
        expect(truncateContext(exact)).toBe(exact);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildTravelDNAContext
// ═════════════════════════════════════════════════════════════════════════════

describe("buildTravelDNAContext", () => {
    it("returns a string when called with undefined", () => {
        const result = buildTravelDNAContext(undefined);
        expect(typeof result).toBe("string");
    });

    it("includes DNA style when provided", () => {
        const result = buildTravelDNAContext({
            travelStyles:          ["cultural", "foodie"],
            pacePreference:        "moderate",
            interests:             ["food", "culture"],
            preferredAccommodation: "mid-range",
            budgetTier:            "mid-range",
            dietaryRestrictions:   [],
            mobilityConsiderations: [],
            avoidanceList:         [],
            languages:             ["English"],
            previousDestinations:  [],
        } as any);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildItineraryContext
// ═════════════════════════════════════════════════════════════════════════════

describe("buildItineraryContext", () => {
    it("returns a string when called with undefined", () => {
        const result = buildItineraryContext(undefined);
        expect(typeof result).toBe("string");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

describe("SYSTEM_PROMPTS", () => {
    it("ITINERARY_GENERATOR is a non-empty string", () => {
        expect(typeof SYSTEM_PROMPTS.ITINERARY_GENERATOR).toBe("string");
        expect(SYSTEM_PROMPTS.ITINERARY_GENERATOR.length).toBeGreaterThan(100);
    });
});

describe("SCHEMA_INSTRUCTIONS", () => {
    it("is a non-empty object", () => {
        expect(typeof SCHEMA_INSTRUCTIONS).toBe("object");
        expect(Object.keys(SCHEMA_INSTRUCTIONS).length).toBeGreaterThan(0);
    });
});

describe("MAX_CONTEXT_TOKENS", () => {
    it("is 32000", () => {
        expect(MAX_CONTEXT_TOKENS).toBe(32000);
    });
});
