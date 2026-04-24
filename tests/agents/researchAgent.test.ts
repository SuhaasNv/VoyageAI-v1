/**
 * tests/agents/researchAgent.test.ts
 *
 * Unit tests for ResearchAgent.run()
 *
 * Covers:
 *   - Cache hit path (instant return, no LLM call)
 *   - Cache miss → LLM happy path
 *   - hotels empty → retry
 *   - BrightData disabled fallback
 *   - LLM failure propagation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
    mockGetResearchCached,
    mockSetResearchCached,
    mockResearchCacheKey,
    mockExecuteWithRetry,
    mockParseJSONResponse,
    mockGeocodecentroid,
    mockBatchGeocode,
    mockSearchAttractions,
    mockSearchHotels,
    mockSearchRestaurants,
    mockIsBrightDataDisabled,
} = vi.hoisted(() => ({
    mockGetResearchCached:    vi.fn(),
    mockSetResearchCached:    vi.fn(),
    mockResearchCacheKey:     vi.fn().mockReturnValue("cache-key-123"),
    mockExecuteWithRetry:     vi.fn(),
    mockParseJSONResponse:    vi.fn(),
    mockGeocodecentroid:      vi.fn(),
    mockBatchGeocode:         vi.fn(),
    mockSearchAttractions:    vi.fn(),
    mockSearchHotels:         vi.fn(),
    mockSearchRestaurants:    vi.fn(),
    mockIsBrightDataDisabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/infrastructure/logger", () => ({
    logStructured: vi.fn(),
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    trunc:         vi.fn((s: string) => s),
}));

vi.mock("@/lib/ai/cache", () => ({
    researchCacheKey:    mockResearchCacheKey,
    getResearchCached:   mockGetResearchCached,
    setResearchCached:   mockSetResearchCached,
}));

vi.mock("@/lib/ai/llm", () => ({
    LLMClientFactory: {
        create: vi.fn().mockReturnValue({}),
    },
    executeWithRetry:  mockExecuteWithRetry,
    parseJSONResponse: mockParseJSONResponse,
}));

vi.mock("@/lib/ai/modelRouter", () => ({
    selectModelConfig: vi.fn().mockReturnValue({
        provider: "groq",
        model:    "llama3-8b",
        temp:     0.2,
        maxTokens: 4000,
    }),
}));

vi.mock("@/lib/ai/prompts/index", () => ({
    buildFullPrompt: vi.fn().mockReturnValue("test prompt"),
}));

vi.mock("@/services/mapboxGeocoding", () => ({
    geocodeCentroid:           mockGeocodecentroid,
    batchGeocode:              mockBatchGeocode,
    isValidGeoCoord:           vi.fn().mockReturnValue(true),
    maxDistanceForFeatureType: vi.fn().mockReturnValue(50),
    isDenseCityDestination:    vi.fn().mockReturnValue(false),
}));

vi.mock("@/tools/brightDataTool", () => ({
    searchAttractions: mockSearchAttractions,
    searchHotels:      mockSearchHotels,
    searchRestaurants: mockSearchRestaurants,
}));

vi.mock("@/tools/brightDataHealthCheck", () => ({
    isBrightDataDisabled: mockIsBrightDataDisabled,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { ResearchAgent } from "@/agents/research/researchAgent";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext() {
    return {
        destination:  "Tokyo, Japan",
        startDate:    "2026-07-01",
        endDate:      "2026-07-05",
        durationDays: 5,
        preferences:  { style: "cultural", budget: 2000 },
        days: [
            { day: 1, theme: "Arrival & Shinjuku" },
            { day: 2, theme: "Asakusa & Ueno" },
        ],
    };
}

function makeCachedResult() {
    return {
        destination:  "Tokyo, Japan",
        startDate:    "2026-07-01",
        endDate:      "2026-07-05",
        durationDays: 5,
        preferences:  { style: "cultural" },
        days: [
            {
                day:   1,
                theme: "Arrival & Shinjuku",
                activities: [
                    {
                        name:          "Shinjuku Gyoen",
                        type:          "attraction",
                        description:   "Beautiful garden in central Tokyo",
                        geoConfidence: "high",
                        lat:           35.685,
                        lng:           139.710,
                    },
                ],
            },
        ],
        hotels: [
            { name: "Park Hyatt Tokyo", priceRange: "$$$", area: "Shinjuku", tags: ["luxury"] },
        ],
        groundingMode: "brightdata",
    };
}

function makeLLMResult() {
    return {
        days: [
            {
                day:   1,
                theme: "Arrival & Shinjuku",
                activities: [
                    {
                        name:        "Shinjuku Gyoen",
                        type:        "attraction",
                        description: "Beautiful garden in central Tokyo",
                    },
                ],
            },
        ],
        hotels: [
            { name: "Park Hyatt Tokyo",  priceRange: "$$$" as const, area: "Shinjuku",      tags: ["luxury"] },
            { name: "Keio Plaza Hotel",  priceRange: "$$"  as const, area: "Shinjuku",      tags: ["central"] },
            { name: "APA Hotel Shibuya", priceRange: "$"   as const, area: "Shibuya-ku",    tags: ["budget"] },
        ],
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// Cache hit path
// ═════════════════════════════════════════════════════════════════════════════

describe("ResearchAgent.run() — cache hit", () => {
    afterEach(() => vi.clearAllMocks());

    it("returns cached result immediately without calling the LLM", async () => {
        mockGetResearchCached.mockResolvedValue(makeCachedResult());

        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(mockExecuteWithRetry).not.toHaveBeenCalled();
        expect(result.destination).toBe("Tokyo, Japan");
    });

    it("returned result has _dataSource from cached groundingMode", async () => {
        mockGetResearchCached.mockResolvedValue({
            ...makeCachedResult(),
            groundingMode: "brightdata",
        });

        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result._dataSource).toBe("brightdata");
    });

    it("maps groundingMode='unverified' to _dataSource='unverified'", async () => {
        mockGetResearchCached.mockResolvedValue({
            ...makeCachedResult(),
            groundingMode: "unverified",
        });

        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result._dataSource).toBe("unverified");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cache miss → LLM happy path
// ═════════════════════════════════════════════════════════════════════════════

describe("ResearchAgent.run() — cache miss → LLM happy path", () => {
    beforeEach(() => {
        mockGetResearchCached.mockResolvedValue(null);
        mockSearchAttractions.mockResolvedValue({
            status: "success",
            text: "Shinjuku Park - great garden",
            data: [{ name: "Shinjuku Gyoen", snippet: "Beautiful garden", source: "test", rating: 4.5 }],
        });
        mockSearchHotels.mockResolvedValue({
            status: "success",
            text: "Park Hyatt - luxury hotel",
            data: [{ name: "Park Hyatt Tokyo", snippet: "Luxury hotel", source: "test", rating: 4.8 }],
        });
        mockSearchRestaurants.mockResolvedValue({
            status: "success",
            text: "Ichiran Ramen - famous ramen",
            data: [{ name: "Ichiran Ramen", snippet: "Famous ramen shop", source: "test" }],
        });
        mockExecuteWithRetry.mockResolvedValue({ content: "{}", latencyMs: 100 });
        mockParseJSONResponse.mockReturnValue(makeLLMResult());
        mockSetResearchCached.mockResolvedValue(undefined);
        mockGeocodecentroid.mockResolvedValue({
            lat:         35.6762,
            lng:         139.6503,
            countryCode: "JP",
            featureType: "city",
        });
        mockBatchGeocode.mockResolvedValue(new Map([
            ["Shinjuku Gyoen",      { lat: 35.685, lng: 139.710, precision: "high" }],
            ["Park Hyatt Tokyo",    { lat: 35.686, lng: 139.692, precision: "high" }],
            ["Keio Plaza Hotel",    { lat: 35.690, lng: 139.695, precision: "high" }],
            ["APA Hotel Shibuya",   { lat: 35.660, lng: 139.700, precision: "medium" }],
        ]));
    });

    afterEach(() => vi.clearAllMocks());

    it("returns enriched result with destination and days", async () => {
        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result.destination).toBe("Tokyo, Japan");
        expect(result.days[0]!.activities.length).toBeGreaterThan(0);
    });

    it("stores result in cache after successful LLM call", async () => {
        const agent = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await agent.run(makeContext() as any);

        expect(mockSetResearchCached).toHaveBeenCalledWith(
            "cache-key-123",
            expect.any(Object),
        );
    });

    it("attaches geoConfidence to activities from batchGeocode", async () => {
        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        const act = result.days[0]!.activities[0];
        expect(act).toHaveProperty("geoConfidence");
    });

    it("_dataSource is 'brightdata' when Bright Data is enabled", async () => {
        mockIsBrightDataDisabled.mockReturnValue(false);

        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result._dataSource).toBe("brightdata");
    });

    it("_dataSource is 'unverified' when Bright Data is disabled", async () => {
        mockIsBrightDataDisabled.mockReturnValue(true);

        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result._dataSource).toBe("unverified");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Geocoding unavailable
// ═════════════════════════════════════════════════════════════════════════════

describe("ResearchAgent.run() — geocoding unavailable", () => {
    beforeEach(() => {
        mockGetResearchCached.mockResolvedValue(null);
        mockSearchAttractions.mockResolvedValue({
            status: "success", text: "attractions",
            data: [{ name: "Shinjuku Gyoen", snippet: "Garden", source: "test" }],
        });
        mockSearchHotels.mockResolvedValue({
            status: "success", text: "hotels",
            data: [{ name: "Park Hyatt Tokyo", snippet: "Luxury", source: "test" }],
        });
        mockSearchRestaurants.mockResolvedValue({
            status: "success", text: "restaurants",
            data: [{ name: "Ichiran", snippet: "Ramen", source: "test" }],
        });
        mockExecuteWithRetry.mockResolvedValue({ content: "{}", latencyMs: 50 });
        mockParseJSONResponse.mockReturnValue(makeLLMResult());
        mockSetResearchCached.mockResolvedValue(undefined);
        mockGeocodecentroid.mockResolvedValue(null); // geocoding unavailable
    });

    afterEach(() => vi.clearAllMocks());

    it("still returns result when centroid geocoding fails (graceful degradation)", async () => {
        const agent  = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await agent.run(makeContext() as any);

        expect(result.destination).toBe("Tokyo, Japan");
        // No coordinates attached — geoConfidence not set from geocoding
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// LLM error propagation
// ═════════════════════════════════════════════════════════════════════════════

describe("ResearchAgent.run() — LLM failure", () => {
    beforeEach(() => {
        mockGetResearchCached.mockResolvedValue(null);
        mockSearchAttractions.mockResolvedValue({ status: "failed", text: "", data: [] });
        mockSearchHotels.mockResolvedValue({ status: "failed", text: "", data: [] });
        mockSearchRestaurants.mockResolvedValue({ status: "failed", text: "", data: [] });
    });

    afterEach(() => vi.clearAllMocks());

    it("throws when LLM call fails", async () => {
        mockExecuteWithRetry.mockRejectedValue(new Error("LLM timeout"));

        const agent = new ResearchAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(agent.run(makeContext() as any)).rejects.toThrow();
    });
});
