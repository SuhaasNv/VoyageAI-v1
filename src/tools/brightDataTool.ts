/**
 * Bright Data Search Tool
 *
 * Wraps Bright Data's SERP/web-search API to fetch real, grounded travel
 * information (attractions, hotels, restaurants).
 *
 * Performance optimized implementation with cache-first architecture, stampede locking,
 * stale caching re-warm, and Promise.race timeouts.
 */

import { logError, logInfo } from "@/infrastructure/logger";
import {
    brightDataCacheKey,
    getBrightDataCached,
    setBrightDataCached,
    setBrightDataMisconfiguredCached,
    getBrightDataEmptyTTL,
    acquireBrightDataLock,
    releaseBrightDataLock,
} from "@/lib/ai/cache";

export interface BrightDataEntity {
    name: string;
    category: "attraction" | "hotel" | "restaurant";
    rating?: number;
    source: string;
    snippet: string;
}

export interface BrightDataResultPayload {
    text: string;
    data: BrightDataEntity[];
    status: "success" | "failed" | "empty" | "timeout";
}

const BRIGHT_DATA_API_URL = "https://api.brightdata.com/request";
const BRIGHT_DATA_ZONE  = "voyageai_serp";
const MAX_SNIPPET_CHARS = 2000;
const STALE_THRESHOLD_MS = 20 * 60 * 60 * 1000; // 20 hours

function getApiKey(): string | undefined {
    return process.env.BRIGHT_DATA_API_KEY;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

/**
 * Parses BrightData HTTP response into structured Entities + generic 2000char fallback text
 */
function parseBrightDataResponse(data: Record<string, unknown>, category: "attraction" | "hotel" | "restaurant"): BrightDataResultPayload {
    // Real API response shape: { organic: [...], general: {...}, ... }
    // Each organic item: { title, description, link, source, rank, ... }
    const rawItems = ((data.organic ?? data.results) as unknown[] | undefined) ?? [];

    // 1. Cap raw data before processing
    const sliced = rawItems.slice(0, 20);

    // 2. Filter weak entries and map — use 'description' and 'link' (real field names)
    const entities: BrightDataEntity[] = sliced
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .filter((item) => !!item.title && !!(item.description || item.snippet))
        .map((item) => ({
            name: ((item.title as string) || "").trim(),
            category,
            source: (item.link ?? item.url ?? item.source ?? "Web Search") as string,
            snippet: (((item.description || item.snippet) as string) || "").trim(),
            ...(item.rating ? { rating: Number(item.rating) } : {}),
        }))
        .slice(0, 10); // Top-10

    // 3. Fallback text for backward compatibility with LLM grounding context
    const textSnippet = entities
        .map((e: BrightDataEntity) => `${e.name}: ${e.snippet}`)
        .join("\n")
        .slice(0, MAX_SNIPPET_CHARS);

    return {
        text: textSnippet,
        data: entities,
        status: entities.length > 0 ? "success" : "empty",
    };
}

/**
 * Safe fallback structure when all else fails ensuring zero downtime
 */
function getEmptyPayload(status: "failed" | "timeout" | "empty" = "failed"): BrightDataResultPayload {
    return { text: "", data: [], status };
}

/**
 * Underlying network call returning structured format.
 */
async function fetchBrightDataDirect(query: string, category: "attraction" | "hotel" | "restaurant"): Promise<BrightDataResultPayload> {
    const apiKey = getApiKey();
    if (!apiKey) return getEmptyPayload("failed");

    // Build a Google SERP URL from the freetext query and pass it via the
    // Bright Data Request API (zone-based, not SERP-product based).
    // Note: &num=N is stripped by Bright Data's SERP zone — omit it to avoid a warning header.
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    const response = await fetch(BRIGHT_DATA_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            zone: BRIGHT_DATA_ZONE,
            url: googleUrl,
            format: "raw",
        }),
        // AbortSignal covers network hangs; Promise.race timeout handles slow bodies
        signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
        if (response.status === 404) {
            // 404 = permanent misconfiguration (wrong zone / endpoint mismatch).
            // Bubble as typed error so caller can cache sentinel and skip all retries.
            const err = new Error("brightdata_404") as Error & { isMisconfigured: boolean; statusCode: number };
            err.isMisconfigured = true;
            err.statusCode = 404;
            throw err;
        }
        logError("[BrightData] API error", { status: response.status, query });
        return getEmptyPayload("failed");
    }

    const data = await response.json() as Record<string, unknown>;
    return parseBrightDataResponse(data, category);
}

/**
 * Non-blocking refresh triggered for heavily requested destinations that crossed the 20h threshold
 */
function refreshBrightDataInBackground(cacheKey: string, query: string, category: "attraction" | "hotel" | "restaurant", destination: string) {
    logInfo("brightdata.stale_refresh_triggered", { destination, type: category });
    
    (async () => {
        try {
            const result = await fetchBrightDataDirect(query, category);
            if (result.status === "success") {
                await setBrightDataCached(cacheKey, result);
            }
        } catch (_e) {
            // Silently absorb failures for background re-warm
        }
    })();
}

/**
 * Master handler uniting Redis caching, stampede locks, latency tracking, and advanced retry boundaries.
 */
async function retrieveBrightDataCategory(
    destination: string,
    query: string,
    category: "attraction" | "hotel" | "restaurant"
): Promise<BrightDataResultPayload> {
    const cacheKey = brightDataCacheKey(category, destination, query);

    // STEP 1/2: Cache-first + Stampede Wait Logic
    const cached = await getBrightDataCached(cacheKey);
    if (cached && typeof cached === "object" && "data" in cached && "cachedAt" in cached) {
        // Short-circuit immediately if this key is a known misconfigured sentinel —
        // no point fetching again until the 10-min TTL expires.
        if (cached.reason === "misconfigured_api") {
            logInfo("brightdata.misconfigured_cache_hit", { destination, type: category });
            return getEmptyPayload("failed");
        }

        logInfo("brightdata.cache_hit", { destination, type: category });
        
        // Stale check
        const ageMs = Date.now() - cached.cachedAt;
        if (ageMs > STALE_THRESHOLD_MS) {
            refreshBrightDataInBackground(cacheKey, query, category, destination);
        }
        
        return cached.data as BrightDataResultPayload;
    }

    logInfo("brightdata.cache_miss", { destination, type: category });
    const start = Date.now();

    // Second-chance check: close the race window between initial miss and lock acquisition.
    // Another request may have already fetched and stored the result in between.
    const secondCheck = await getBrightDataCached(cacheKey);
    if (secondCheck && secondCheck.data) {
        logInfo("brightdata.cache_hit", { destination, type: category });
        return secondCheck.data as BrightDataResultPayload;
    }

    const hasLock = await acquireBrightDataLock(cacheKey);
    
    if (!hasLock) {
        // Another request is already fetching — wait and poll cache
        for (let i = 0; i < 2; i++) {
            await sleep(150);
            const retry = await getBrightDataCached(cacheKey);
            if (retry && retry.data) {
                logInfo("brightdata.cache_recovered_after_wait", { destination, type: category, attempt: i + 1 });
                return retry.data as BrightDataResultPayload;
            }
        }
        return getEmptyPayload("timeout");
    }

    try {
        let result: BrightDataResultPayload;
        try {
            // Attempt 1
            // Real API takes ~5-7 s — first attempt 10 s
            result = await withTimeout(fetchBrightDataDirect(query, category), 10000);
        } catch (err: unknown) {
            const error = err as { isMisconfigured?: boolean; statusCode?: number; message?: string };
            // Permanent misconfiguration (404) — cache sentinel, log once, bail immediately.
            if (error.isMisconfigured) {
                logError("brightdata.misconfigured", {
                    destination,
                    type: category,
                    statusCode: error.statusCode ?? 404,
                });
                await setBrightDataMisconfiguredCached(cacheKey);
                return getEmptyPayload("failed");
            }
            if (error.message === "timeout") {
                logInfo("brightdata.timeout_retry", { destination, type: category, attempt: 1 });
                // Attempt 2 — timeouts only, never for 404; give a full second attempt
                result = await withTimeout(fetchBrightDataDirect(query, category), 8000);
            } else {
                throw err; // Strict retry condition (only timeout)
            }
        }

        if (result.status === "success") {
            await setBrightDataCached(cacheKey, result);
            logInfo("brightdata.partial_success", { destination, type: category, successCount: result.data.length });
        }

        if (result.status === "empty") {
            // Cache empty results with a short TTL to avoid hammering the API
            // for destinations that genuinely return no data.
            await setBrightDataCached(cacheKey, result, getBrightDataEmptyTTL());
            logInfo("brightdata.empty_result", { destination, type: category });
        }

        logInfo("brightdata.fetch_complete", {
            destination,
            type: category,
            durationMs: Date.now() - start,
            status: result.status
        });

        return result;
    } catch (err: unknown) {
        const isTimeout = (err as { message?: string }).message === "timeout";
        const finalStatus = isTimeout ? "timeout" : "failed";
        logInfo(isTimeout ? "brightdata.timeout" : "brightdata.fetch_error", { destination, type: category, durationMs: Date.now() - start });
        return getEmptyPayload(finalStatus);
    } finally {
        // ALWAYS release the lock if we had it
        await releaseBrightDataLock(cacheKey);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchAttractions(
    destination: string,
    durationDays: number = 1,
    theme?: string,
    pace?: string
): Promise<BrightDataResultPayload> {
    const paceStr = pace ? `pace ${pace}` : "";
    const themeStr = theme ? `${theme}` : "";
    const query = `top rated things to do in ${destination} for ${durationDays} days ${themeStr} ${paceStr} travel`;
    return retrieveBrightDataCategory(destination, query, "attraction");
}

export async function searchHotels(
    destination: string,
    budget?: string
): Promise<BrightDataResultPayload> {
    const budgetClause = budget ? ` ${budget}` : " best";
    const query = `best${budgetClause} hotels in ${destination} guest favorite highly rated`;
    return retrieveBrightDataCategory(destination, query, "hotel");
}

export async function searchRestaurants(
    destination: string
): Promise<BrightDataResultPayload> {
    const query = `best local restaurants in ${destination} highly rated`;
    return retrieveBrightDataCategory(destination, query, "restaurant");
}
