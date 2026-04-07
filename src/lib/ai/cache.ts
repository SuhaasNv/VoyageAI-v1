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
const TTL_BRIGHT_DATA = 6 * 60 * 60;  // 6h
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

export function brightDataCacheKey(query: string): string {
    return `brightdata:${hash(query.toLowerCase().trim())}`;
}

export async function getBrightDataCached(key: string): Promise<string | null> {
    return getCached<string>(key);
}

export async function setBrightDataCached(key: string, value: string): Promise<void> {
    await setCached(key, value, TTL_BRIGHT_DATA);
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
