/**
 * tests/lib/cache.test.ts
 *
 * Unit tests for the deterministic cache-key functions in src/lib/ai/cache.ts.
 * All key generators are pure functions — no Redis, no mocking required.
 *
 * Async get/set functions are tested with a mock Redis client to cover
 * both the hit path and the no-Redis fallback path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Redis so async cache functions don't make real network connections.
// Tests in the "no Redis" group use hasRedisConfig = false.
// Tests exercising the Redis path use a spy getRedisClient.
const { mockHasRedisConfig, mockGetRedisClient } = vi.hoisted(() => ({
    mockHasRedisConfig:  vi.fn(() => false as boolean),
    mockGetRedisClient:  vi.fn(() => null as unknown),
}));

vi.mock("@/lib/redis", () => ({
    hasRedisConfig:  mockHasRedisConfig,
    getRedisClient:  mockGetRedisClient,
}));
import {
    itineraryCacheKey,
    reoptimizeCacheKey,
    chatCacheKey,
    suggestionsCacheKey,
    destinationInfoCacheKey,
    getItineraryCached,
    setItineraryCached,
    getReoptimizeCached,
    setReoptimizeCached,
    getChatCached,
    setChatCached,
    getSuggestionsCached,
    setSuggestionsCached,
    getDestinationInfoCached,
    setDestinationInfoCached,
    acquireRefreshMutex,
    destinationsCacheKey,
    getDestinationsCached,
    setDestinationsCached,
    STALE_DESTINATIONS_MS,
    packingCacheKey,
    getPackingCached,
    setPackingCached,
    simulationCacheKey,
    getSimulationCached,
    setSimulationCached,
    compareCacheKey,
    getCompareCached,
    setCompareCached,
    mapDestinationKey,
    brightDataCacheKey,
    getBrightDataCached,
    setBrightDataCached,
    getBrightDataEmptyTTL,
    setBrightDataMisconfiguredCached,
    acquireBrightDataLock,
    releaseBrightDataLock,
    travelDNACacheKey,
    getTravelDNACached,
    setTravelDNACached,
    invalidateTravelDNACache,
    researchCacheKey,
    getResearchCached,
    setResearchCached,
} from "@/lib/ai/cache";

// ═════════════════════════════════════════════════════════════════════════════
// itineraryCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("itineraryCacheKey", () => {
    const base = {
        destination: "Tokyo, Japan",
        startDate:   "2026-07-01",
        endDate:     "2026-07-07",
        budget:      { total: 3000, currency: "USD" },
    };

    it("returns a string starting with 'ai:cache:itinerary:'", () => {
        const key = itineraryCacheKey(base);
        expect(key).toMatch(/^ai:cache:itinerary:[a-f0-9]+$/);
    });

    it("same inputs produce the same key (deterministic)", () => {
        expect(itineraryCacheKey(base)).toBe(itineraryCacheKey(base));
    });

    it("different destinations produce different keys", () => {
        const k1 = itineraryCacheKey(base);
        const k2 = itineraryCacheKey({ ...base, destination: "Paris, France" });
        expect(k1).not.toBe(k2);
    });

    it("different budgets produce different keys", () => {
        const k1 = itineraryCacheKey(base);
        const k2 = itineraryCacheKey({ ...base, budget: { total: 1000, currency: "USD" } });
        expect(k1).not.toBe(k2);
    });

    it("mustSeeAttractions sort order does not affect key", () => {
        const k1 = itineraryCacheKey({ ...base, mustSeeAttractions: ["A", "B"] });
        const k2 = itineraryCacheKey({ ...base, mustSeeAttractions: ["B", "A"] });
        expect(k1).toBe(k2);
    });

    it("omitting mustSeeAttractions is same as empty array", () => {
        const k1 = itineraryCacheKey(base);
        const k2 = itineraryCacheKey({ ...base, mustSeeAttractions: [] });
        expect(k1).toBe(k2);
    });

    it("avoidAttractions sort order does not affect key", () => {
        const k1 = itineraryCacheKey({ ...base, avoidAttractions: ["X", "Y"] });
        const k2 = itineraryCacheKey({ ...base, avoidAttractions: ["Y", "X"] });
        expect(k1).toBe(k2);
    });

    it("different avoidAttractions produce different keys", () => {
        const k1 = itineraryCacheKey({ ...base, avoidAttractions: ["crowds"] });
        const k2 = itineraryCacheKey({ ...base, avoidAttractions: [] });
        expect(k1).not.toBe(k2);
    });

    it("budget.flexibility affects the key", () => {
        const k1 = itineraryCacheKey({ ...base, budget: { ...base.budget, flexibility: "strict" } });
        const k2 = itineraryCacheKey({ ...base, budget: { ...base.budget, flexibility: "flexible" } });
        expect(k1).not.toBe(k2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// reoptimizeCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("reoptimizeCacheKey", () => {
    const base = {
        tripId:                "trip-abc",
        currentItinerary:      { day: 1 },
        reoptimizationReasons: ["budget_exceeded"],
        remainingBudget:       500,
        lockedDays:            [1, 2],
    };

    it("returns string starting with 'ai:cache:reoptimize:'", () => {
        const key = reoptimizeCacheKey(base);
        expect(key).toMatch(/^ai:cache:reoptimize:[a-f0-9]+$/);
    });

    it("is deterministic", () => {
        expect(reoptimizeCacheKey(base)).toBe(reoptimizeCacheKey(base));
    });

    it("reoptimizationReasons sort order does not affect key", () => {
        const k1 = reoptimizeCacheKey({ ...base, reoptimizationReasons: ["A", "B"] });
        const k2 = reoptimizeCacheKey({ ...base, reoptimizationReasons: ["B", "A"] });
        expect(k1).toBe(k2);
    });

    it("lockedDays sort order does not affect key", () => {
        const k1 = reoptimizeCacheKey({ ...base, lockedDays: [3, 1, 2] });
        const k2 = reoptimizeCacheKey({ ...base, lockedDays: [1, 2, 3] });
        expect(k1).toBe(k2);
    });

    it("different tripId produces different key", () => {
        const k1 = reoptimizeCacheKey(base);
        const k2 = reoptimizeCacheKey({ ...base, tripId: "trip-xyz" });
        expect(k1).not.toBe(k2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// chatCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("chatCacheKey", () => {
    const base = {
        tripId:   "trip-123",
        messages: [{ role: "user", content: "What should I pack?" }],
    };

    it("returns string starting with 'ai:cache:chat:'", () => {
        const key = chatCacheKey(base);
        expect(key).toMatch(/^ai:cache:chat:[a-f0-9]+$/);
    });

    it("is deterministic", () => {
        expect(chatCacheKey(base)).toBe(chatCacheKey(base));
    });

    it("different messages produce different keys", () => {
        const k1 = chatCacheKey(base);
        const k2 = chatCacheKey({ ...base, messages: [{ role: "user", content: "Different?" }] });
        expect(k1).not.toBe(k2);
    });

    it("omitting tripId is same as empty tripId", () => {
        const k1 = chatCacheKey({ messages: base.messages });
        const k2 = chatCacheKey({ tripId: "", messages: base.messages });
        expect(k1).toBe(k2);
    });

    it("different travelDNA produces different keys", () => {
        const k1 = chatCacheKey({ ...base, travelDNA: null });
        const k2 = chatCacheKey({ ...base, travelDNA: { style: "adventurous" } });
        expect(k1).not.toBe(k2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// suggestionsCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("suggestionsCacheKey", () => {
    it("embeds the tripId directly (no hashing)", () => {
        const key = suggestionsCacheKey("trip-xyz-123");
        expect(key).toContain("trip-xyz-123");
    });

    it("different tripIds produce different keys", () => {
        const k1 = suggestionsCacheKey("trip-a");
        const k2 = suggestionsCacheKey("trip-b");
        expect(k1).not.toBe(k2);
    });

    it("starts with ai:cache:suggestions:", () => {
        expect(suggestionsCacheKey("trip-1")).toMatch(/^ai:cache:suggestions:/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// destinationInfoCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("destinationInfoCacheKey", () => {
    it("returns string starting with 'ai:cache:destination-info:'", () => {
        const key = destinationInfoCacheKey("Tokyo");
        expect(key).toMatch(/^ai:cache:destination-info:[a-f0-9]+$/);
    });

    it("is case-insensitive ('Tokyo' === 'TOKYO')", () => {
        const k1 = destinationInfoCacheKey("Tokyo");
        const k2 = destinationInfoCacheKey("TOKYO");
        expect(k1).toBe(k2);
    });

    it("trims whitespace", () => {
        const k1 = destinationInfoCacheKey("  Tokyo  ");
        const k2 = destinationInfoCacheKey("Tokyo");
        expect(k1).toBe(k2);
    });

    it("different destinations produce different keys", () => {
        const k1 = destinationInfoCacheKey("Paris");
        const k2 = destinationInfoCacheKey("London");
        expect(k1).not.toBe(k2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// destinationsCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("destinationsCacheKey", () => {
    it("embeds userId in the key", () => {
        const key = destinationsCacheKey("user-abc");
        expect(key).toContain("user-abc");
    });

    it("different userIds produce different keys", () => {
        expect(destinationsCacheKey("user-1")).not.toBe(destinationsCacheKey("user-2"));
    });
});

describe("STALE_DESTINATIONS_MS", () => {
    it("is 5 hours in milliseconds", () => {
        expect(STALE_DESTINATIONS_MS).toBe(5 * 60 * 60 * 1000);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Async get/set — no Redis configured (short-circuit paths)
// ═════════════════════════════════════════════════════════════════════════════

describe("Async cache functions — no Redis configured", () => {
    it("getItineraryCached returns null when Redis is unavailable", async () => {
        const result = await getItineraryCached("test-key");
        expect(result).toBeNull();
    });

    it("setItineraryCached does not throw when Redis is unavailable", async () => {
        await expect(setItineraryCached("test-key", { data: 1 })).resolves.toBeUndefined();
    });

    it("getReoptimizeCached returns null when Redis is unavailable", async () => {
        expect(await getReoptimizeCached("key")).toBeNull();
    });

    it("setReoptimizeCached resolves without error", async () => {
        await expect(setReoptimizeCached("key", {})).resolves.toBeUndefined();
    });

    it("getChatCached returns null", async () => {
        expect(await getChatCached("key")).toBeNull();
    });

    it("setChatCached resolves without error", async () => {
        await expect(setChatCached("key", "response")).resolves.toBeUndefined();
    });

    it("getSuggestionsCached returns null", async () => {
        expect(await getSuggestionsCached("key")).toBeNull();
    });

    it("setSuggestionsCached resolves without error", async () => {
        await expect(setSuggestionsCached("key", {})).resolves.toBeUndefined();
    });

    it("getDestinationInfoCached returns null", async () => {
        expect(await getDestinationInfoCached("key")).toBeNull();
    });

    it("setDestinationInfoCached resolves without error", async () => {
        await expect(setDestinationInfoCached("key", {})).resolves.toBeUndefined();
    });

    it("acquireRefreshMutex returns true when Redis is unavailable", async () => {
        const result = await acquireRefreshMutex("user-1");
        expect(result).toBe(true);
    });

    it("getDestinationsCached returns null", async () => {
        expect(await getDestinationsCached("key")).toBeNull();
    });

    it("setDestinationsCached resolves without error", async () => {
        await expect(setDestinationsCached("key", [{ id: 1 }])).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Async get/set — Redis configured, cache hit / miss paths
// ═════════════════════════════════════════════════════════════════════════════

describe("Async cache functions — Redis available", () => {
    const mockRedisClient = {
        get:   vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
        set:   vi.fn(),
    };

    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockHasRedisConfig.mockReturnValue(true as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockGetRedisClient.mockReturnValue(mockRedisClient as any);
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockHasRedisConfig.mockReturnValue(false as any);
        mockGetRedisClient.mockReturnValue(null);
        vi.clearAllMocks();
    });

    it("getItineraryCached returns parsed data on cache hit", async () => {
        mockRedisClient.get.mockResolvedValue(JSON.stringify({ destination: "Tokyo" }));
        const result = await getItineraryCached("hit-key");
        expect(result).toEqual({ destination: "Tokyo" });
    });

    it("getItineraryCached returns null on cache miss", async () => {
        mockRedisClient.get.mockResolvedValue(null);
        const result = await getItineraryCached("miss-key");
        expect(result).toBeNull();
    });

    it("setItineraryCached calls setex with correct TTL", async () => {
        await setItineraryCached("key", { data: "test" });
        expect(mockRedisClient.setex).toHaveBeenCalledWith(
            "key",
            600, // TTL_ITINERARY = 600s
            JSON.stringify({ data: "test" })
        );
    });

    it("getChatCached returns cached data", async () => {
        mockRedisClient.get.mockResolvedValue(JSON.stringify({ msg: "cached" }));
        const result = await getChatCached("chat-key");
        expect(result).toEqual({ msg: "cached" });
    });

    it("getSuggestionsCached returns null on miss", async () => {
        mockRedisClient.get.mockResolvedValue(null);
        expect(await getSuggestionsCached("suggestions-key")).toBeNull();
    });

    it("getDestinationInfoCached returns cached data", async () => {
        mockRedisClient.get.mockResolvedValue(JSON.stringify({ info: "Paris" }));
        const result = await getDestinationInfoCached("dest-key");
        expect(result).toEqual({ info: "Paris" });
    });

    it("getItineraryCached returns null when Redis.get throws", async () => {
        mockRedisClient.get.mockRejectedValue(new Error("Redis connection lost"));
        const result = await getItineraryCached("err-key");
        expect(result).toBeNull();
    });

    it("setItineraryCached handles Redis setex error gracefully", async () => {
        mockRedisClient.setex.mockRejectedValue(new Error("Write failed"));
        await expect(setItineraryCached("key", {})).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// packingCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("packingCacheKey", () => {
    const base = {
        destination: "Bali",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        climate: "tropical",
    };

    it("returns string starting with 'ai:cache:packing:'", () => {
        expect(packingCacheKey(base)).toMatch(/^ai:cache:packing:[a-f0-9]+$/);
    });

    it("is deterministic", () => {
        expect(packingCacheKey(base)).toBe(packingCacheKey(base));
    });

    it("different climate produces different key", () => {
        const k1 = packingCacheKey(base);
        const k2 = packingCacheKey({ ...base, climate: "cold" });
        expect(k1).not.toBe(k2);
    });

    it("activities sort order does not affect key", () => {
        const k1 = packingCacheKey({ ...base, activities: ["surf", "hike"] });
        const k2 = packingCacheKey({ ...base, activities: ["hike", "surf"] });
        expect(k1).toBe(k2);
    });
});

describe("getPackingCached + setPackingCached — no Redis", () => {
    it("getPackingCached returns null", async () => {
        expect(await getPackingCached("key")).toBeNull();
    });
    it("setPackingCached resolves without error", async () => {
        await expect(setPackingCached("key", {})).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// simulationCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("simulationCacheKey", () => {
    const base = {
        tripId: "trip-sim-1",
        itinerary: { day: 1 },
        scenarios: ["rain", "flight_delay"],
    };

    it("returns string starting with 'ai:cache:simulation:'", () => {
        expect(simulationCacheKey(base)).toMatch(/^ai:cache:simulation:[a-f0-9]+$/);
    });

    it("scenarios sort order does not affect key", () => {
        const k1 = simulationCacheKey({ ...base, scenarios: ["rain", "flight_delay"] });
        const k2 = simulationCacheKey({ ...base, scenarios: ["flight_delay", "rain"] });
        expect(k1).toBe(k2);
    });

    it("different simulationDepth produces different key", () => {
        const k1 = simulationCacheKey({ ...base, simulationDepth: "quick" });
        const k2 = simulationCacheKey({ ...base, simulationDepth: "detailed" });
        expect(k1).not.toBe(k2);
    });
});

describe("getSimulationCached + setSimulationCached — no Redis", () => {
    it("returns null and resolves without error", async () => {
        expect(await getSimulationCached("key")).toBeNull();
        await expect(setSimulationCached("key", {})).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// compareCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("compareCacheKey", () => {
    const base = {
        destinationA: "Paris",
        destinationB: "Rome",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        budget: 2000,
    };

    it("returns string starting with 'ai:cache:compare:'", () => {
        expect(compareCacheKey(base)).toMatch(/^ai:cache:compare:[a-f0-9]+$/);
    });

    it("destination order does not matter (A-vs-B == B-vs-A)", () => {
        const k1 = compareCacheKey({ ...base, destinationA: "Paris", destinationB: "Rome" });
        const k2 = compareCacheKey({ ...base, destinationA: "Rome", destinationB: "Paris" });
        expect(k1).toBe(k2);
    });

    it("different budgets produce different keys", () => {
        const k1 = compareCacheKey(base);
        const k2 = compareCacheKey({ ...base, budget: 5000 });
        expect(k1).not.toBe(k2);
    });
});

describe("getCompareCached + setCompareCached — no Redis", () => {
    it("returns null and resolves without error", async () => {
        expect(await getCompareCached("key")).toBeNull();
        await expect(setCompareCached("key", {})).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// mapDestinationKey + brightDataCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("mapDestinationKey", () => {
    it("lowercases and trims", () => {
        expect(mapDestinationKey("  Tokyo  ")).toBe("tokyo");
    });

    it("strips trailing country suffix after comma", () => {
        expect(mapDestinationKey("Paris, France")).toBe("paris");
    });

    it("keeps multi-word destination intact", () => {
        expect(mapDestinationKey("New York")).toBe("new york");
    });
});

describe("brightDataCacheKey", () => {
    it("returns key prefixed with brightdata:", () => {
        const key = brightDataCacheKey("hotels", "Tokyo, Japan", "cheap hotels near Shibuya");
        expect(key).toMatch(/^brightdata:tokyo:/);
    });

    it("is deterministic for same inputs", () => {
        const k1 = brightDataCacheKey("restaurants", "Paris", "best croissants");
        const k2 = brightDataCacheKey("restaurants", "Paris", "best croissants");
        expect(k1).toBe(k2);
    });

    it("different queries produce different keys", () => {
        const k1 = brightDataCacheKey("restaurants", "Paris", "croissants");
        const k2 = brightDataCacheKey("restaurants", "Paris", "ramen");
        expect(k1).not.toBe(k2);
    });
});

describe("getBrightDataEmptyTTL", () => {
    it("returns 3600 (1 hour in seconds)", () => {
        expect(getBrightDataEmptyTTL()).toBe(3600);
    });
});

describe("getBrightDataCached + setBrightDataCached — no Redis", () => {
    it("returns null and resolves without error", async () => {
        expect(await getBrightDataCached("key")).toBeNull();
        await expect(setBrightDataCached("key", {})).resolves.toBeUndefined();
    });
});

describe("setBrightDataMisconfiguredCached — no Redis", () => {
    it("resolves without error when Redis is unavailable", async () => {
        await expect(setBrightDataMisconfiguredCached("key")).resolves.toBeUndefined();
    });
});

describe("acquireBrightDataLock + releaseBrightDataLock — no Redis", () => {
    it("acquireBrightDataLock returns true (fail open)", async () => {
        expect(await acquireBrightDataLock("key")).toBe(true);
    });

    it("releaseBrightDataLock resolves without error", async () => {
        await expect(releaseBrightDataLock("key")).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// travelDNACacheKey + related
// ═════════════════════════════════════════════════════════════════════════════

describe("travelDNACacheKey", () => {
    it("embeds userId in key", () => {
        const key = travelDNACacheKey("user-xyz");
        expect(key).toContain("user-xyz");
        expect(key).toMatch(/^user:dna:/);
    });

    it("different userIds produce different keys", () => {
        expect(travelDNACacheKey("user-1")).not.toBe(travelDNACacheKey("user-2"));
    });
});

describe("getTravelDNACached + setTravelDNACached + invalidateTravelDNACache — no Redis", () => {
    it("getTravelDNACached returns null", async () => {
        expect(await getTravelDNACached("key")).toBeNull();
    });

    it("setTravelDNACached resolves without error for non-null value", async () => {
        await expect(setTravelDNACached("key", { style: "adventurous" })).resolves.toBeUndefined();
    });

    it("setTravelDNACached returns immediately for null value", async () => {
        await expect(setTravelDNACached("key", null)).resolves.toBeUndefined();
    });

    it("invalidateTravelDNACache resolves without error", async () => {
        await expect(invalidateTravelDNACache("user-1")).resolves.toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// researchCacheKey
// ═════════════════════════════════════════════════════════════════════════════

describe("researchCacheKey", () => {
    const base = {
        destination: "Kyoto",
        durationDays: 5,
        dayThemes: ["culture", "temples"],
        style: "Culture, Food",
        pace: "relaxed",
    };

    it("returns string starting with 'ai:cache:research:v4:'", () => {
        expect(researchCacheKey(base)).toMatch(/^ai:cache:research:v4:[a-f0-9]+$/);
    });

    it("is deterministic", () => {
        expect(researchCacheKey(base)).toBe(researchCacheKey(base));
    });

    it("destination is case-insensitive", () => {
        const k1 = researchCacheKey({ ...base, destination: "Kyoto" });
        const k2 = researchCacheKey({ ...base, destination: "KYOTO" });
        expect(k1).toBe(k2);
    });

    it("style preference sort order does not affect key", () => {
        const k1 = researchCacheKey({ ...base, style: "Culture, Food" });
        const k2 = researchCacheKey({ ...base, style: "Food, Culture" });
        expect(k1).toBe(k2);
    });

    it("different durationDays produce different keys", () => {
        const k1 = researchCacheKey({ ...base, durationDays: 3 });
        const k2 = researchCacheKey({ ...base, durationDays: 7 });
        expect(k1).not.toBe(k2);
    });

    it("feedback busts the cache", () => {
        const k1 = researchCacheKey(base);
        const k2 = researchCacheKey({ ...base, feedback: "more food options" });
        expect(k1).not.toBe(k2);
    });

    it("budget affects the key", () => {
        const k1 = researchCacheKey({ ...base, budget: 1000 });
        const k2 = researchCacheKey({ ...base, budget: 5000 });
        expect(k1).not.toBe(k2);
    });
});

describe("getResearchCached + setResearchCached — no Redis", () => {
    it("returns null and resolves without error", async () => {
        expect(await getResearchCached("key")).toBeNull();
        await expect(setResearchCached("key", {})).resolves.toBeUndefined();
    });
});
