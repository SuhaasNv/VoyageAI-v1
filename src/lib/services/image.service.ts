/**
 * Image service — Pexels destination image retrieval with Redis caching.
 * Server-side only. Never expose API key to client.
 * PEXELS_API_KEY must never be NEXT_PUBLIC_* — that would leak the key to the browser.
 */

import { logInfo, logError } from "@/lib/logger";

if (typeof window !== "undefined") {
    throw new Error("[image.service] Must not run in browser — PEXELS_API_KEY would be exposed");
}

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const CACHE_PREFIX = "destination-image:";
const CACHE_TTL_SEC = 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 5000;
const NULL_SENTINEL = "__NULL__";
const MIN_WIDTH = 1200;
const MAX_DESTINATION_LENGTH = 100;

/**
 * Validates and sanitizes destination: trim, length limit, letters/spaces/hyphen only.
 */
function sanitizeDestination(destination: string): string | null {
    const trimmed = destination.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_DESTINATION_LENGTH) return null;
    const stripped = trimmed.replace(/[^a-zA-Z\s-]/g, "").trim();
    return stripped.length > 0 ? stripped : null;
}

interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    src: { landscape?: string };
}

interface PexelsResponse {
    photos?: PexelsPhoto[];
}

/**
 * Normalizes destination for cache key: lowercase, trim, collapse spaces, replace with hyphen.
 * All resolve to same key: "  Dubai ", "dubai", "DuBaI" → "dubai"; "Abu  Dhabi" → "abu-dhabi"
 */
function normalizeDestination(destination: string): string {
    return (
        destination
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")   // collapse multiple spaces, replace with hyphen
            .replace(/-+/g, "-")   // collapse multiple hyphens
            .replace(/^-|-$/g, "") // trim leading/trailing hyphens
            || "travel"
    );
}

function hasRedis(): boolean {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getRedis() {
    const { Redis } = await import("@upstash/redis");
    return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
}

async function getCached(key: string): Promise<string | null | "MISS"> {
    if (!hasRedis()) return "MISS";
    try {
        const redis = await getRedis();
        const val = await redis.get<string>(key);
        if (val === NULL_SENTINEL) return null;
        if (val && typeof val === "string") return val;
        return "MISS";
    } catch {
        return "MISS";
    }
}

async function setCached(key: string, value: string | null, ttlSec: number): Promise<void> {
    if (!hasRedis()) return;
    try {
        const redis = await getRedis();
        await redis.setex(key, ttlSec, value ?? NULL_SENTINEL);
    } catch {
        // non-fatal
    }
}

/**
 * Per-request dedupe: if same destination is requested multiple times in one request,
 * only one Pexels API call is made. Pass this map from the caller (e.g. GET /api/trips).
 */
export type RequestImageCache = Map<string, Promise<string | null>>;

async function fetchAndCacheImage(
    destination: string,
    cacheKey: string,
    apiKey: string
): Promise<string | null> {
    const cached = await getCached(cacheKey);
    if (cached !== "MISS") {
        logInfo("[image] cache hit", { destination });
        return cached;
    }
    logInfo("[image] cache miss", { destination });

    const query = `${destination.trim()} skyline city`;
    const params = new URLSearchParams({
        query,
        per_page: "5",
        orientation: "landscape",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(`${PEXELS_SEARCH_URL}?${params}`, {
            headers: { Authorization: apiKey },
            signal: controller.signal,
            cache: "no-store",
        });

        clearTimeout(timeout);

        if (res.status === 401) {
            logError("[image] unauthorized (401)", { destination });
            return null;
        }

        if (res.status === 429) {
            logError("[image] rate limit (429)", { destination });
            await setCached(cacheKey, null, CACHE_TTL_SEC);
            return null;
        }

        if (!res.ok) {
            logError("[image] API error", { destination, status: res.status });
            await setCached(cacheKey, null, CACHE_TTL_SEC);
            return null;
        }

        const data = (await res.json()) as PexelsResponse;
        const photos = data?.photos ?? [];

        const chosen = photos.find(
            (p) => (p?.width ?? 0) >= MIN_WIDTH && p?.src?.landscape
        );

        if (!chosen?.src?.landscape) {
            logInfo("[image] empty or no valid photo", { destination });
            await setCached(cacheKey, null, CACHE_TTL_SEC);
            return null;
        }

        const url = chosen.src.landscape;
        logInfo("[image] selected", { destination });
        await setCached(cacheKey, url, CACHE_TTL_SEC);
        return url;
    } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).name === "AbortError") {
            logError("[image] timeout", { destination });
        }
        await setCached(cacheKey, null, CACHE_TTL_SEC);
        return null;
    }
}

/**
 * Cache-only lookup: returns cached image URL or null. Never calls Pexels.
 * Use for fast response; call getDestinationImage in background on miss.
 */
export type CachedImageResult =
    | { type: "hit"; url: string | null }
    | { type: "miss" };

export async function getDestinationImageCachedOnly(
    destination: string
): Promise<CachedImageResult> {
    const sanitized = sanitizeDestination(destination);
    if (!sanitized) return { type: "hit", url: null };

    const normalizedDestination = normalizeDestination(sanitized);
    const cacheKey = `${CACHE_PREFIX}${normalizedDestination}`;
    const cached = await getCached(cacheKey);
    if (cached === "MISS") return { type: "miss" };
    return { type: "hit", url: cached };
}

export async function getDestinationImage(
    destination: string,
    requestCache?: RequestImageCache
): Promise<string | null> {
    const sanitized = sanitizeDestination(destination);
    if (!sanitized) return null;

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey?.trim()) {
        logError("[image] PEXELS_API_KEY missing");
        return null;
    }

    const normalizedDestination = normalizeDestination(sanitized);
    const cacheKey = `${CACHE_PREFIX}${normalizedDestination}`;

    if (requestCache) {
        let promise = requestCache.get(cacheKey);
        if (!promise) {
            promise = fetchAndCacheImage(sanitized, cacheKey, apiKey);
            requestCache.set(cacheKey, promise);
        }
        return promise;
    }

    return fetchAndCacheImage(sanitized, cacheKey, apiKey);
}
