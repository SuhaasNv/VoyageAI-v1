/**
 * Redis-based AI response caching.
 * Itinerary, reoptimize, chat — TTL 5–10 min.
 * Scalability: reduces LLM calls for repeated prompts.
 */

import { createHash } from "crypto";
import { getRedisClient, hasRedisConfig } from "@/lib/redis";

const PREFIX = "ai:cache";
const TTL_ITINERARY = 600;             // 10 min
const TTL_REOPTIMIZE = 600;            // 10 min
const TTL_CHAT = 300;                  // 5 min
const TTL_SUGGESTIONS = 6 * 60 * 60;  // 6h
const TTL_PACKING = 6 * 60 * 60;      // 6h
const TTL_SIMULATION = 10 * 60;        // 10 min
const TTL_COMPARE = 60 * 60;           // 1h
const TTL_RESEARCH = 6 * 60 * 60;           // 6h — LLM-synthesized + geocoded research result
const TTL_BRIGHT_DATA = 24 * 60 * 60;       // 24h
const TTL_BRIGHT_DATA_EMPTY = 60 * 60;      // 1h — short TTL for empty/no-result destinations
const TTL_BRIGHT_DATA_MISCONFIGURED = 10 * 60; // 10 min — short TTL for permanent API failures (404/misconfigured)
const TTL_TRAVEL_DNA = 60 * 60;        // 1h
const TTL_REFRESH_MUTEX = 60;          // 60s — stale-while-revalidate lock

function hash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

async function getCached<T>(key: string): Promise<T | null> {
    if (!hasRedisConfig()) return null;
    try {
        const redis = getRedisClient();
        if (!redis) return null;
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

async function setCached(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!hasRedisConfig()) return;
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.setex(key, ttlSec, JSON.stringify(value));
    } catch {
        // Cache write failure is non-fatal
    }
}

// ─── Itinerary ───────────────────────────────────────────────────────────────

export function itineraryCacheKey(request: {
    destination: string;
    startDate: string;
    endDate: string;
    budget: { total: number; currency: string; flexibility?: string };
    mustSeeAttractions?: string[];
    avoidAttractions?: string[];
}): string {
    const payload = JSON.stringify({
        d: request.destination,
        s: request.startDate,
        e: request.endDate,
        b: request.budget.total,
        c: request.budget.currency,
        f: request.budget.flexibility ?? "flexible",
        m: (request.mustSeeAttractions ?? []).sort(),
        a: (request.avoidAttractions ?? []).sort(),
    });
    return `${PREFIX}:itinerary:${hash(payload)}`;
}

export async function getItineraryCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setItineraryCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_ITINERARY);
}

// ─── Reoptimize ─────────────────────────────────────────────────────────────

export function reoptimizeCacheKey(request: {
    tripId: string;
    currentItinerary: unknown;
    reoptimizationReasons: string[];
    remainingBudget: number;
    lockedDays: number[];
}): string {
    const payload = JSON.stringify({
        t: request.tripId,
        i: request.currentItinerary,
        r: request.reoptimizationReasons.sort(),
        b: request.remainingBudget,
        l: (request.lockedDays ?? []).sort(),
    });
    return `${PREFIX}:reoptimize:${hash(payload)}`;
}

export async function getReoptimizeCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setReoptimizeCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_REOPTIMIZE);
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export function chatCacheKey(request: {
    tripId?: string;
    messages: unknown[];
    travelDNA?: unknown;
    currentItinerary?: unknown;
    currentLocation?: unknown;
}): string {
    const payload = JSON.stringify({
        t: request.tripId ?? "",
        m: request.messages,
        d: request.travelDNA ?? null,
        i: request.currentItinerary ?? null,
        l: request.currentLocation ?? null,
    });
    return `${PREFIX}:chat:${hash(payload)}`;
}

export async function getChatCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setChatCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_CHAT);
}

// ─── Suggestions ────────────────────────────────────────────────────────────

export function suggestionsCacheKey(tripId: string): string {
    return `${PREFIX}:suggestions:${tripId}`;
}

export async function getSuggestionsCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setSuggestionsCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_SUGGESTIONS);
}

// ─── Destination info (LLM) ──────────────────────────────────────────────────

const TTL_DESTINATION_INFO = 24 * 60 * 60; // 24h — destination facts don't change

export function destinationInfoCacheKey(name: string): string {
    return `${PREFIX}:destination-info:${hash(name.toLowerCase().trim())}`;
}

export async function getDestinationInfoCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setDestinationInfoCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_DESTINATION_INFO);
}

// ─── Destination suggestions ─────────────────────────────────────────────────

const TTL_DESTINATIONS = 6 * 60 * 60; // 6h
/** Background refresh threshold: serve cache and quietly refresh after 5h. */
export const STALE_DESTINATIONS_MS = 5 * 60 * 60 * 1000;

export interface DestinationsCacheEntry {
    data: unknown[];
    cachedAt: number; // Unix ms
}

export function destinationsCacheKey(userId: string): string {
    return `${PREFIX}:destinations:user:${userId}`;
}

export async function getDestinationsCached(key: string): Promise<DestinationsCacheEntry | null> {
    return getCached<DestinationsCacheEntry>(key);
}

export async function setDestinationsCached(key: string, data: unknown[]): Promise<void> {
    const entry: DestinationsCacheEntry = { data, cachedAt: Date.now() };
    await setCached(key, entry, TTL_DESTINATIONS);
}

// ─── Stale-while-revalidate mutex ────────────────────────────────────────────
// Prevents multiple concurrent background refreshes (thundering herd).

export async function acquireRefreshMutex(userId: string): Promise<boolean> {
    if (!hasRedisConfig()) return true; // No Redis — always allow
    try {
        const redis = getRedisClient();
        if (!redis) return true;
        const result = await redis.set(
            `dest:refresh:lock:${userId}`,
            "1",
            "EX",
            TTL_REFRESH_MUTEX,
            "NX"
        );
        return result === "OK"; // true = acquired, false = already locked
    } catch {
        return true; // Fail open — allow refresh on Redis error
    }
}

// ─── Packing list ─────────────────────────────────────────────────────────────

export function packingCacheKey(request: {
    destination: string;
    startDate: string;
    endDate: string;
    climate: string;
    activities?: string[];
    travelDNA?: unknown;
}): string {
    const payload = JSON.stringify({
        d: request.destination,
        s: request.startDate,
        e: request.endDate,
        c: request.climate,
        act: [...(request.activities ?? [])].sort(),
        dna: request.travelDNA ?? null,
    });
    return `${PREFIX}:packing:${hash(payload)}`;
}

export async function getPackingCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setPackingCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_PACKING);
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export function simulationCacheKey(request: {
    tripId?: string;
    itinerary: unknown;
    scenarios: string[];
    simulationDepth?: string;
}): string {
    const payload = JSON.stringify({
        t: request.tripId ?? "",
        i: request.itinerary,
        s: [...request.scenarios].sort(),
        d: request.simulationDepth ?? "detailed",
    });
    return `${PREFIX}:simulation:${hash(payload)}`;
}

export async function getSimulationCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setSimulationCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_SIMULATION);
}

// ─── Compare ──────────────────────────────────────────────────────────────────

export function compareCacheKey(request: {
    destinationA: string;
    destinationB: string;
    startDate: string;
    endDate: string;
    budget: number;
    currency?: string;
}): string {
    // Normalise dest order so A-vs-B == B-vs-A
    const [d1, d2] = [request.destinationA, request.destinationB].sort();
    const payload = JSON.stringify({
        a: d1,
        b: d2,
        s: request.startDate,
        e: request.endDate,
        bgt: request.budget,
        cur: request.currency ?? "USD",
    });
    return `${PREFIX}:compare:${hash(payload)}`;
}

export async function getCompareCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setCompareCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_COMPARE);
}

// ─── Bright Data SERP ─────────────────────────────────────────────────────────

export interface BrightDataCachePayload {
    data: unknown;
    cachedAt: number;
    /** Present only when the entry represents a permanent API failure. */
    status?: "success" | "failed" | "empty" | "timeout";
    /** Machine-readable failure reason for observability. */
    reason?: "misconfigured_api" | string;
}

export function mapDestinationKey(destination: string): string {
    return destination.toLowerCase().trim().replace(/,\s*\w+$/, "");
}

export function brightDataCacheKey(type: string, destination: string, query: string): string {
    return `brightdata:${mapDestinationKey(destination)}:${type}:${hash(query)}`;
}

export async function getBrightDataCached(key: string): Promise<BrightDataCachePayload | null> {
    return getCached<BrightDataCachePayload>(key);
}

export async function setBrightDataCached(key: string, value: unknown, ttlSec?: number): Promise<void> {
    const payload: BrightDataCachePayload = { data: value, cachedAt: Date.now() };
    await setCached(key, payload, ttlSec ?? TTL_BRIGHT_DATA);
}

/** Convenience: write an empty-result payload with the short (1h) TTL. */
export function getBrightDataEmptyTTL(): number {
    return TTL_BRIGHT_DATA_EMPTY;
}

/**
 * Write a "misconfigured_api" sentinel with a short (10 min) TTL.
 * Called when Bright Data returns HTTP 404 or signals a hard endpoint mismatch.
 * Prevents repeated useless calls for the same key during the cooldown window.
 */
export async function setBrightDataMisconfiguredCached(key: string): Promise<void> {
    if (!hasRedisConfig()) return;
    try {
        const redis = getRedisClient();
        if (!redis) return;
        const payload: BrightDataCachePayload = {
            data: [],
            cachedAt: Date.now(),
            status: "failed",
            reason: "misconfigured_api",
        };
        await redis.setex(key, TTL_BRIGHT_DATA_MISCONFIGURED, JSON.stringify(payload));
    } catch {
        // Cache write failure is non-fatal
    }
}

export async function acquireBrightDataLock(key: string): Promise<boolean> {
    if (!hasRedisConfig()) return true; // Fail open
    try {
        const redis = getRedisClient();
        if (!redis) return true;
        const result = await redis.set(`lock:${key}`, "1", "EX", 10, "NX");
        return result === "OK";
    } catch {
        return true; // Fail open
    }
}

export async function releaseBrightDataLock(key: string): Promise<void> {
    if (!hasRedisConfig()) return;
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.del(`lock:${key}`);
    } catch {
        // Non-fatal
    }
}

// ─── Travel DNA preference ────────────────────────────────────────────────────

export function travelDNACacheKey(userId: string): string {
    return `user:dna:${userId}`;
}

export async function getTravelDNACached(
    key: string
): Promise<Record<string, unknown> | null> {
    return getCached<Record<string, unknown>>(key);
}

export async function setTravelDNACached(
    key: string,
    value: Record<string, unknown> | null
): Promise<void> {
    if (value === null) return;
    await setCached(key, value, TTL_TRAVEL_DNA);
}

export async function invalidateTravelDNACache(userId: string): Promise<void> {
    if (!hasRedisConfig()) return;
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.del(travelDNACacheKey(userId));
    } catch {
        // Non-fatal
    }
}

// ─── Research Agent result ─────────────────────────────────────────────────────
//
// Caches the full Research Agent output (validated + geocoded EnrichedTripContext)
// so repeated requests for the same trip parameters skip the 15–20 s LLM call.
//
// Key inputs:
//   destination  — normalised to lowercase
//   durationDays — day count
//   dayThemes    — sorted list of Planner-assigned day themes
//   style, pace  — preference axes (budget excluded to avoid over-splitting keys)
//
// TTL: 6 h — balances freshness vs. cost savings.

/**
 * Buckets trip duration so nearby day counts share a cache key.
 * Rationale: a 3-day and 4-day Paris trip have nearly identical Research
 * Agent outputs.  Sharing a key doubles cache effectiveness without
 * meaningfully degrading result quality.
 *
 *   1–2 days  → "1-2"
 *   3–4 days  → "3-4"
 *   5–7 days  → "5-7"
 *   8+ days   → "8+"
 */
function bucketDays(n: number): string {
    if (n <= 2) return "1-2";
    if (n <= 4) return "3-4";
    if (n <= 7) return "5-7";
    return "8+";
}

/**
 * Normalises a preference string for stable cache keys:
 *   "Culture, Food" → "culture,food"  (sorted, lowercase, no extra spaces)
 */
function normalizePreference(pref: string | undefined): string {
    if (!pref) return "";
    return pref
        .toLowerCase()
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .sort()
        .join(",");
}

export function researchCacheKey(params: {
    destination:  string;
    durationDays: number;
    dayThemes:    string[];
    style?:       string;
    pace?:        string;
}): string {
    const payload = JSON.stringify({
        d:  params.destination.toLowerCase().trim(),
        // Bucket days: 3-day and 4-day trips share the same key
        n:  bucketDays(params.durationDays),
        // Sort themes so ordering differences from LLM don't fragment the cache
        t:  [...params.dayThemes].map((t) => t.toLowerCase().trim()).sort(),
        // Normalize multi-word preferences ("Culture, Food" == "food,culture")
        s:  normalizePreference(params.style),
        p:  normalizePreference(params.pace),
    });
    return `${PREFIX}:research:v2:${hash(payload)}`;
}

export async function getResearchCached(key: string): Promise<unknown | null> {
    return getCached(key);
}

export async function setResearchCached(key: string, value: unknown): Promise<void> {
    await setCached(key, value, TTL_RESEARCH);
}
