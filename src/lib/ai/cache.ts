/**
 * Redis-based AI response caching.
 * Itinerary, reoptimize, chat — TTL 5–10 min.
 * Scalability: reduces LLM calls for repeated prompts.
 */

import { createHash } from "crypto";

const PREFIX = "ai:cache";
const TTL_ITINERARY = 600;   // 10 min
const TTL_REOPTIMIZE = 600;  // 10 min
const TTL_CHAT = 300;        // 5 min
const TTL_SUGGESTIONS = 6 * 60 * 60;  // 6h

function hash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

async function getRedis() {
    const { Redis } = await import("@upstash/redis");
    return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
}

function hasRedis(): boolean {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getCached<T>(key: string): Promise<T | null> {
    if (!hasRedis()) return null;
    try {
        const redis = await getRedis();
        const raw = await redis.get<string>(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

async function setCached(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!hasRedis()) return;
    try {
        const redis = await getRedis();
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
