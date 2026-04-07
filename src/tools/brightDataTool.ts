/**
 * Bright Data Search Tool
 *
 * Wraps Bright Data's SERP/web-search API to fetch real, grounded travel
 * information (attractions, hotels, restaurants) for a given destination.
 *
 * Each function returns raw text snippets (≤ 2000 chars) suitable for use
 * as grounding context in an LLM prompt. They never return parsed JSON.
 *
 * Graceful degradation: if BRIGHT_DATA_API_KEY is absent or the network
 * call fails, the function logs a warning and returns an empty string so
 * the calling agent can fall back to LLM-only generation without crashing.
 */

import { logError } from "@/infrastructure/logger";
import { brightDataCacheKey, getBrightDataCached, setBrightDataCached } from "@/lib/ai/cache";

// ─── Config ───────────────────────────────────────────────────────────────────

const BRIGHT_DATA_API_URL = "https://api.brightdata.com/serp/google";
const MAX_SNIPPET_CHARS = 2000;

interface BrightDataResult {
    title?: string;
    description?: string;
    snippet?: string;
    url?: string;
}

interface BrightDataResponse {
    results?: BrightDataResult[];
    organic?: BrightDataResult[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getApiKey(): string | undefined {
    return process.env.BRIGHT_DATA_API_KEY;
}

/**
 * Execute a single Bright Data SERP query and return concatenated text
 * snippets truncated to MAX_SNIPPET_CHARS. Returns "" on any failure.
 */
async function queryBrightData(query: string): Promise<string> {
    const apiKey = getApiKey();

    if (!apiKey) {
        return "";
    }

    // ── Redis cache check ─────────────────────────────────────────────────────
    const cacheKey = brightDataCacheKey(query);
    const cached = await getBrightDataCached(cacheKey);
    if (cached !== null) {
        return cached;
    }

    try {
        const response = await fetch(BRIGHT_DATA_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query, num: 10 }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            logError("[BrightData] API error", {
                status: response.status,
                query,
            });
            return "";
        }

        const data = (await response.json()) as BrightDataResponse;
        const items: BrightDataResult[] = data.organic ?? data.results ?? [];

        const snippets = items
            .map((item) => {
                const title = item.title ?? "";
                const body = item.snippet ?? item.description ?? "";
                return title && body ? `${title}: ${body}` : title || body;
            })
            .filter(Boolean)
            .join("\n");

        const result = snippets.slice(0, MAX_SNIPPET_CHARS);
        // Only cache non-empty results — don't persist API failures for 6h
        if (result) await setBrightDataCached(cacheKey, result);
        return result;
    } catch (err) {
        logError("[BrightData] fetch failed", { query, err });
        return "";
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search for top attractions and experiences in a destination.
 * Optionally scoped to a specific day theme (e.g. "cultural", "outdoor").
 */
export async function searchAttractions(
    destination: string,
    theme?: string
): Promise<string> {
    const themeClause = theme ? ` ${theme}` : "";
    const query = `Top attractions and experiences ${destination}${themeClause} travel guide`;
    return queryBrightData(query);
}

/**
 * Search for hotels and accommodation options in a destination.
 * Optionally filtered by a budget hint (e.g. "budget", "luxury").
 */
export async function searchHotels(
    destination: string,
    budget?: string
): Promise<string> {
    const budgetClause = budget ? ` ${budget}` : "";
    const query = `Best hotels${budgetClause} ${destination} accommodation`;
    return queryBrightData(query);
}

/**
 * Search for top restaurants and dining options in a destination.
 */
export async function searchRestaurants(destination: string): Promise<string> {
    const query = `Best restaurants local food ${destination} dining`;
    return queryBrightData(query);
}
