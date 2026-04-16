/**
 * Research Agent — Evan
 *
 * Enriches a TripContext with:
 *   - 3–5 activities per day (attractions, experiences, restaurants)
 *   - 3–5 hotel options total (MANDATORY — not per day)
 *
 * Data pipeline:
 *   1. Check Redis LLM-result cache → instant return on hit (6 h TTL).
 *   2. Parallel Bright Data searches ground the LLM in real-world results.
 *   3. Grounding context + trip structure fed to the LLM.
 *   4. LLM returns structured JSON conforming to EnrichedTripContext.
 *   5. Output validated + sanitized.
 *   6. attachCoordinates — precision-aware geocoding with geoConfidence:
 *       a. Geocode destination centroid.
 *       b. Country-level inference: if destination is a country, find the
 *          primary city from hotel areas (e.g. "Italy" → "Rome") and use
 *          that as the effective centroid with city-level (50 km) threshold.
 *       c. Batch-geocode all places with limit=3 + poi/address types.
 *       d. Attach geoConfidence: "high" | "medium" | "low".
 *   7. Geocoded result stored in cache.
 *
 * This agent MUST NOT: select a final hotel, optimise routes, calculate
 * cost totals, modify dates/duration, or call other agents.
 */

import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { selectModelConfig } from "../../lib/ai/modelRouter";
import { buildFullPrompt } from "../../lib/ai/prompts/index";
import { logError, logInfo, logStructured, trunc } from "@/infrastructure/logger";
import {
    geocodeCentroid,
    batchGeocode,
    isValidGeoCoord,
    maxDistanceForFeatureType,
    isDenseCityDestination,
} from "@/services/mapboxGeocoding";
import {
    searchAttractions,
    searchHotels,
    searchRestaurants,
    type BrightDataResultPayload,
} from "../../tools/brightDataTool";
import { isBrightDataDisabled } from "../../tools/brightDataHealthCheck";
import {
    RESEARCH_SYSTEM_PROMPT,
    RESEARCH_SCHEMA_INSTRUCTION,
} from "./researchPrompts";
import {
    researchCacheKey,
    getResearchCached,
    setResearchCached,
} from "@/lib/ai/cache";
import type {
    Activity,
    ActivityType,
    EnrichedDay,
    EnrichedTripContext,
    GeoConfidence,
    HotelOption,
    PriceRange,
    TripContext,
} from "@/agents/shared/tripPipelineTypes";

export type {
    Activity,
    ActivityType,
    EnrichedDay,
    EnrichedTripContext,
    HotelOption,
    PriceRange,
    TripContext,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Map a numeric budget hint to a Bright Data query budget string. */
function budgetHint(preferences?: TripContext["preferences"], durationDays = 1): string | undefined {
    if (!preferences?.budget) return undefined;
    const daily = preferences.budget / Math.max(1, durationDays);
    if (daily < 100) return "budget cheap";
    if (daily < 300) return "mid-range";
    return "luxury";
}

/** Map a style preference to a price range cap for hotel filtering. Supports comma-separated multi-style strings. */
function maxHotelPriceRange(style?: string): PriceRange {
    if (!style) return "$$$$";
    const styles = style.toLowerCase().split(",").map((s) => s.trim());
    if (styles.some((s) => s === "luxury")) return "$$$$";
    if (styles.some((s) => s === "adventure" || s === "relaxed")) return "$$$";
    return "$$$$";
}

const PRICE_RANK: Record<PriceRange, number> = { $: 1, "$$": 2, "$$$": 3, "$$$$": 4 };

/** True if priceRange is within the allowed maximum. */
function withinBudget(priceRange: PriceRange, max: PriceRange): boolean {
    return PRICE_RANK[priceRange] <= PRICE_RANK[max];
}

/** Normalise a string for deduplication comparison. */
function normaliseName(name: string): string {
    return name.toLowerCase().trim();
}

/**
 * For country-level destinations (e.g. "Italy"), the centroid lands in the
 * geographic centre of the country, causing place geocodes to scatter.
 *
 * This function extracts the most frequently mentioned city using three
 * signal sources (in descending reliability):
 *   1. Hotel area strings (weight ×3) — "Rome, Italy" → "rome"
 *   2. Activity descriptions — "Located in central Florence" → "florence"
 *   3. Activity names — "Colosseum Rome" → "rome"
 *
 * Returns null when no consistent city is found (effective score ≥ 3 required,
 * equivalent to at least two hotel mentions OR strong cross-source consensus).
 */
function inferPrimaryCity(
    hotels:      HotelOption[],
    days:        EnrichedDay[],
    destination: string,
): string | null {
    const destWords = new Set(destination.toLowerCase().split(/[\s,]+/).filter(Boolean));
    // Common stopwords that appear in area strings but are not city names
    const stopWords = new Set([
        ...destWords,
        "centro", "central", "city", "centre", "center", "district", "area",
        "north", "south", "east", "west", "old", "new", "historic",
    ]);
    const wordFreq = new Map<string, number>();

    const addTokens = (text: string, weight: number) => {
        const tokens = text
            .split(/[\s,\/\-]+/)
            .map((w) => w.toLowerCase().replace(/[^\w]/g, ""))
            .filter((w) => w.length > 2 && !stopWords.has(w));
        for (const token of tokens) {
            wordFreq.set(token, (wordFreq.get(token) ?? 0) + weight);
        }
    };

    // Source 1: hotel areas (most reliable — typically "City, Country" format)
    for (const hotel of hotels) {
        addTokens(hotel.area, 3);
    }

    // Source 2: activity descriptions — scan for city mentions after "in", "near", "at"
    for (const day of days) {
        for (const act of day.activities) {
            if (act.description) {
                // Pattern: "in Florence", "near Rome", "at the heart of Venice"
                const matches = act.description.match(
                    /\b(?:in|near|at)\s+([A-Z][a-záàèéìíòóùú]+(?:\s+[A-Z][a-záàèéìíòóùú]+)?)/g,
                ) ?? [];
                for (const match of matches) {
                    const city = match
                        .replace(/^(?:in|near|at)\s+/i, "")
                        .toLowerCase()
                        .replace(/[^\w]/g, "");
                    if (city.length > 2 && !stopWords.has(city)) {
                        wordFreq.set(city, (wordFreq.get(city) ?? 0) + 1);
                    }
                }
            }
            // Source 3: last word of activity name (e.g. "Colosseum Rome")
            // Only if activity name ends with a capitalised word not in destination
            const nameParts = act.name.split(/\s+/);
            const lastName  = nameParts[nameParts.length - 1]?.toLowerCase().replace(/[^\w]/g, "") ?? "";
            if (lastName.length > 2 && /^[A-Z]/.test(nameParts[nameParts.length - 1] ?? "") && !stopWords.has(lastName)) {
                wordFreq.set(lastName, (wordFreq.get(lastName) ?? 0) + 0.5);
            }
        }
    }

    const sorted = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]);
    const top    = sorted[0];
    // Score ≥ 3 means: 1 hotel mention (weight 3) OR multiple activity signals
    return top && top[1] >= 3 ? top[0] : null;
}

// ─── Restaurant metadata enrichment ──────────────────────────────────────────

/**
 * Keyword map: list of trigger words → cuisine label.
 * Checked in order — first match wins.
 */
const CUISINE_KEYWORDS: Array<[string[], string]> = [
    [["sushi", "ramen", "tempura", "udon", "yakitori", "sashimi"],          "Japanese"],
    [["pasta", "pizza", "risotto", "trattoria", "osteria", "carbonara"],    "Italian"],
    [["steak", "burger", "bbq", "barbecue", "american grill", "steakhouse"],"Western"],
    [["curry", "tandoor", "biryani", "naan", "masala", "chai"],             "Indian"],
    [["taco", "burrito", "quesadilla", "enchilada", "guacamole"],           "Mexican"],
    [["croissant", "brasserie", "patisserie", "french", "foie gras"],       "French"],
    [["dim sum", "wonton", "peking duck", "cantonese", "dumplings"],        "Chinese"],
    [["falafel", "shawarma", "hummus", "kebab", "lebanese", "mezze"],       "Middle Eastern"],
    [["tapas", "paella", "sangria", "spanish"],                             "Spanish"],
    [["oyster", "lobster", "clam", "seafood", "fish market"],               "Seafood"],
    [["vegan", "plant-based", "vegetarian", "tofu"],                        "Vegetarian"],
];

const PRICE_SIGNALS: Array<["$$$" | "$$", string[]]> = [
    ["$$$", ["fine dining", "luxury", "michelin", "upscale", "haute cuisine", "tasting menu", "gourmet"]],
    ["$$",  ["casual", "bistro", "cafe", "café", "brasserie", "mid-range", "neighbourhood"]],
];

const PRICE_MIDPOINT: Record<"$$$" | "$$" | "$", number> = {
    "$$$": 75,  // midpoint of 50–100 USD
    "$$":  30,  // midpoint of 20–40 USD
    "$":   12,  // midpoint of 10–15 USD
};

/**
 * Deterministically enriches a restaurant Activity with:
 *   - cuisine    — detected from name + description keywords; falls back to "Local"
 *   - shortDescription — first sentence of the description, capped at 120 chars
 *   - priceLevel — heuristic from price-signal keywords; falls back to "$"
 *   - estimatedCost — midpoint of the price band (only set when not already present)
 *
 * Pure function — no LLM calls, no async, no side effects.
 */
function enrichRestaurantMetadata(
    activity: Activity,
): Pick<Activity, "cuisine" | "shortDescription" | "priceLevel" | "estimatedCost"> {
    const text = `${activity.name} ${activity.description}`.toLowerCase();

    // ── Cuisine detection ────────────────────────────────────────────────────
    let cuisine = "Local";
    for (const [keywords, label] of CUISINE_KEYWORDS) {
        if (keywords.some((kw) => text.includes(kw))) {
            cuisine = label;
            break;
        }
    }

    // ── Price level ──────────────────────────────────────────────────────────
    let priceLevel: "$$$" | "$$" | "$" = "$";
    for (const [level, signals] of PRICE_SIGNALS) {
        if (signals.some((kw) => text.includes(kw))) {
            priceLevel = level;
            break;
        }
    }

    // ── Short description — first sentence, max 120 chars ────────────────────
    const firstSentence = activity.description
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s/)[0]
        ?.trim() ?? "";
    const shortDescription =
        firstSentence.length > 5 ? firstSentence.slice(0, 120) : undefined;

    // ── Estimated cost — only override if not already set by the LLM ────────
    const estimatedCost =
        typeof activity.estimatedCost === "number" && activity.estimatedCost >= 0
            ? activity.estimatedCost
            : PRICE_MIDPOINT[priceLevel];

    return { cuisine, shortDescription, priceLevel, estimatedCost };
}


/**
 * Validate, sanitise, and preference-filter raw LLM output.
 *
 * Throws if:
 *   - hotels array is missing or empty (mandatory)
 *   - any hotel has an empty name
 *   - any activity has an empty name
 */
function validateAndSanitize(
    raw: unknown,
    context: TripContext
): { days: EnrichedDay[]; hotels: HotelOption[] } {
    if (typeof raw !== "object" || raw === null) {
        throw new Error("[ResearchAgent] LLM output is not an object");
    }

    const obj = raw as Record<string, unknown>;
    const style = context.preferences?.style;
    const maxPrice = maxHotelPriceRange(style);

    // ── Hotels ──────────────────────────────────────────────────────────────
    if (!Array.isArray(obj.hotels) || (obj.hotels as unknown[]).length === 0) {
        throw new Error("[ResearchAgent] hotels array is empty — mandatory field");
    }

    const seenHotels = new Set<string>();
    const hotels: HotelOption[] = (obj.hotels as unknown[])
        .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
        .filter((h) => {
            const name = (h.name as string | undefined) ?? "";
            return name.trim().length > 0;
        })
        .filter((h) => {
            const pr = h.priceRange as PriceRange | undefined;
            return pr ? withinBudget(pr, maxPrice) : true;
        })
        .reduce<HotelOption[]>((acc, h) => {
            const key = normaliseName((h.name as string) ?? "");
            if (seenHotels.has(key)) return acc;
            seenHotels.add(key);

            acc.push({
                name: (h.name as string).trim(),
                priceRange: (h.priceRange as PriceRange) ?? "$$",
                area: typeof h.area === "string" ? h.area.trim() : "",
                tags: Array.isArray(h.tags)
                    ? (h.tags as unknown[])
                        .filter((t) => typeof t === "string" && t.trim().length > 0)
                        .map((t) => (t as string).trim())
                    : [],
                ...(typeof h.rating === "number" ? { rating: Math.min(5, Math.max(1, h.rating)) } : {}),
            });
            return acc;
        }, [])
        .slice(0, 5);

    if (hotels.length < 2) {
        throw new Error(
            `[ResearchAgent] hotels has only ${hotels.length} valid entries (minimum 2 required)`
        );
    }
    if (hotels.length < 3) {
        // Soft warning — 2 hotels is usable, but callers should retry with a
        // stronger prompt if possible.  We do NOT throw here; the system must
        // never 500 on valid user input.
        logStructured({
            layer: "agent", agent: "research", step: "low_hotel_count",
            data: { count: hotels.length, destination: context.destination },
        });
    }

    // ── Days / Activities ────────────────────────────────────────────────────
    const inputDays = new Map(context.days.map((d) => [d.day, d.theme]));
    const rawDays = Array.isArray(obj.days) ? (obj.days as unknown[]) : [];

    const seenActivities = new Set<string>();
    let restaurantEnrichedCount = 0;

    const days: EnrichedDay[] = rawDays
        .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
        .map((d) => {
            const dayNum = typeof d.day === "number" ? d.day : 0;
            const theme = (inputDays.get(dayNum) ?? (typeof d.theme === "string" ? d.theme : "")).trim();

            const rawActivities = Array.isArray(d.activities) ? (d.activities as unknown[]) : [];
            const styleTokens = style ? style.toLowerCase().split(",").map((s) => s.trim()) : [];
            const isAdventureStyle = styleTokens.includes("adventure");
            const isRelaxedStyle = styleTokens.includes("relaxed");

            const activities: Activity[] = rawActivities
                .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
                .filter((a) => {
                    const name = (a.name as string | undefined) ?? "";
                    return name.trim().length > 0;
                })
                .filter((a) => {
                    // For relaxed-only style, deprioritise adventure activities
                    if (isRelaxedStyle && !isAdventureStyle && a.type === "adventure") return false;
                    return true;
                })
                .reduce<Activity[]>((acc, a) => {
                    if (acc.length >= 8) return acc;
                    const key = normaliseName((a.name as string) ?? "");
                    if (seenActivities.has(key)) return acc;
                    seenActivities.add(key);

                    const validTypes: ActivityType[] = ["attraction", "experience", "restaurant"];
                    const type: ActivityType = validTypes.includes(a.type as ActivityType)
                        ? (a.type as ActivityType)
                        : "attraction";

                    const base: Activity = {
                        name: (a.name as string).trim(),
                        type,
                        description: typeof a.description === "string" ? a.description.trim() : "",
                        ...(typeof a.estimatedCost === "number" && a.estimatedCost >= 0
                            ? { estimatedCost: a.estimatedCost }
                            : {}),
                    };

                    if (type === "restaurant") {
                        const meta = enrichRestaurantMetadata(base);
                        restaurantEnrichedCount++;
                        acc.push({ ...base, ...meta });
                    } else {
                        acc.push(base);
                    }
                    return acc;
                }, []);

            // Adventure style: ensure at least one adventure/experience activity exists
            const hasExperience = activities.some((a) => a.type === "experience");
            if (isAdventureStyle && !hasExperience && activities.length > 0) {
                activities[0] = { ...activities[0], type: "experience" };
            }

            // Diversity guardrail: every day must have ≥2 non-restaurant activities.
            // If the LLM ignored the system prompt (e.g. on a "Food & Culinary" day),
            // reclassify the first restaurant(s) as "experience" so the Logistics Agent
            // has non-restaurant anchors for meal injection.
            const nonRestaurantCount = activities.filter((a) => a.type !== "restaurant").length;
            if (nonRestaurantCount < 2 && activities.length >= 2) {
                let promoted = 0;
                for (let i = 0; i < activities.length && promoted < (2 - nonRestaurantCount); i++) {
                    if (activities[i]!.type === "restaurant") {
                        activities[i] = { ...activities[i]!, type: "experience" };
                        promoted++;
                    }
                }
                if (promoted > 0) {
                    logStructured({
                        layer: "agent", agent: "research", step: "output",
                        data: { diversityFix: true, promoted, day: dayNum, theme },
                    });
                }
            }

            return { day: dayNum, theme, activities };
        });

    logStructured({
        layer: "agent",
        agent: "research",
        step:  "restaurant_enriched",
        data:  { count: restaurantEnrichedCount, destination: context.destination },
    });

    return { days, hotels };
}

/** Merge sanitised LLM output back into the original context, preserving all fields. */
function mergeIntoContext(
    context: TripContext,
    enriched: { days: EnrichedDay[]; hotels: HotelOption[] }
): EnrichedTripContext {
    const enrichedDayMap = new Map(enriched.days.map((d) => [d.day, d]));

    const mergedDays: EnrichedDay[] = context.days.map((inputDay) => {
        const enrichedDay = enrichedDayMap.get(inputDay.day);
        return {
            day: inputDay.day,
            theme: inputDay.theme,
            activities: enrichedDay?.activities ?? [],
        };
    });

    return {
        ...context,
        days: mergedDays,
        hotels: enriched.hotels,
    };
}

// ─── Geocoding enrichment ─────────────────────────────────────────────────────

/**
 * Attaches real lat/lng + geoConfidence to every Activity and HotelOption.
 *
 * Strategy:
 *  1. Geocode destination centroid → extract ISO country code + featureType.
 *  2. Country-level override: when featureType === "country" (e.g. "Italy"),
 *     infer the primary city from hotel area strings and re-geocode that city
 *     as the effective centroid (with city-level 50 km threshold).
 *  3. Batch-geocode all unique place names in parallel (Promise.allSettled).
 *     Each call uses limit=3 + poi/address types + best-candidate selection.
 *  4. Attach geoConfidence: high (<5 km) / medium (within threshold) / low (fallback).
 *
 * Never throws.
 */
async function attachCoordinates(
    result: EnrichedTripContext,
    requestId?: string,
): Promise<EnrichedTripContext> {
    // ── Step 1: destination centroid ──────────────────────────────────────
    const centroidResult = await geocodeCentroid(result.destination);

    if (!centroidResult) {
        logStructured({
            layer: "agent", agent: "research", step: "geocoding_complete", requestId,
            data: {
                destination: result.destination,
                skipped:     true,
                reason:      "centroid geocode unavailable",
                totalPlaces: 0,
            },
        });
        return result;
    }

    let { lat: centLat, lng: centLng, countryCode, featureType } = centroidResult;

    // ── Step 2: country-level city inference ──────────────────────────────
    // When the destination is an entire country, the centroid lands in the
    // geographic centre (e.g. middle of Italy), causing place geocodes to
    // scatter across the country.  Infer the primary city from hotel areas
    // AND activity descriptions, then re-geocode it as the effective centroid.
    let inferredCity: string | undefined;

    if (featureType === "country") {
        const cityCandidate = inferPrimaryCity(result.hotels, result.days, result.destination);
        if (cityCandidate) {
            inferredCity = cityCandidate;
            logStructured({
                layer: "agent", agent: "research", step: "geocoding_complete", requestId,
                data: {
                    destination:      result.destination,
                    countryInference: true,
                    inferredCity:     cityCandidate,
                    message:          "country-level destination — using inferred primary city as centroid",
                },
            });

            const cityResult = await geocodeCentroid(`${cityCandidate}, ${result.destination}`);
            if (cityResult && cityResult.featureType !== "country") {
                centLat     = cityResult.lat;
                centLng     = cityResult.lng;
                countryCode = cityResult.countryCode ?? countryCode;
                featureType = cityResult.featureType;
            }
        }
    }

    // Detect dense city (Tokyo, NYC, London …) — enables anti-centroid rule
    const isDense = isDenseCityDestination(
        inferredCity ?? result.destination,
    );

    const centroid = { lat: centLat, lng: centLng };
    const fallback = centroid; // (0,0) is never used as a fallback

    // ── Step 3: collect unique names + batch geocode ──────────────────────
    const activityNames = result.days.flatMap((d) => d.activities.map((a) => a.name));
    const hotelNames    = result.hotels.map((h) => h.name);
    const allNames      = [...activityNames, ...hotelNames];

    const maxDistanceKm = maxDistanceForFeatureType(featureType, isDense);

    const geocodeOptions = {
        proximity:    centroid,
        centroid,
        maxDistanceKm,
        denseCity:    isDense,
        ...(countryCode  ? { country: countryCode }   : {}),
        ...(inferredCity ? { inferredCity }            : {}),
    };

    const coordMap = await batchGeocode(allNames, result.destination, fallback, geocodeOptions);

    logStructured({
        layer: "agent", agent: "research", step: "geocoding_complete", requestId,
        data: {
            destination:   result.destination,
            totalPlaces:   allNames.length,
            countryFilter: countryCode ?? "none",
            featureType,
            maxDistanceKm,
            skipped:       false,
        },
    });

    // ── Step 4: attach coords + geoConfidence ─────────────────────────────
    // Map GeocodedPlace.precision → GeoConfidence on the entity.
    // Falls back to centroid with geoConfidence: "low" when geocoding failed.
    const resolveCoord = (name: string): { lat: number; lng: number; geoConfidence: GeoConfidence } => {
        const geocoded = coordMap.get(name);
        if (geocoded && isValidGeoCoord(geocoded.lat, geocoded.lng)) {
            return { lat: geocoded.lat, lng: geocoded.lng, geoConfidence: geocoded.precision };
        }
        return { lat: fallback.lat, lng: fallback.lng, geoConfidence: "low" };
    };

    const days = result.days.map((day) => ({
        ...day,
        activities: day.activities.map((act) => {
            const { lat, lng, geoConfidence } = resolveCoord(act.name);
            return { ...act, lat, lng, geoConfidence };
        }),
    }));

    const hotels = result.hotels.map((hotel) => {
        const { lat, lng, geoConfidence } = resolveCoord(hotel.name);
        return { ...hotel, lat, lng, geoConfidence };
    });

    return { ...result, days, hotels };
}

// ─── ResearchAgent ────────────────────────────────────────────────────────────

export class ResearchAgent {
    /**
     * Enrich a TripContext with attractions, experiences, restaurants, and
     * mandatory hotel options sourced from Bright Data + LLM structuring.
     *
     * @throws if hotels cannot be populated after one retry
     */
    async run(context: TripContext, requestId?: string): Promise<EnrichedTripContext> {
        logStructured({ layer: "agent", agent: "research", step: "start", requestId });
        logStructured({
            layer: "agent", agent: "research", step: "input", requestId,
            data: { destination: context.destination, durationDays: context.durationDays, style: context.preferences?.style },
        });
        logInfo("[ResearchAgent] starting enrichment", {
            destination: context.destination,
            days: context.durationDays,
        });

        // ── Step 0: LLM result cache check ────────────────────────────────
        // Skip the entire LLM + Bright Data pipeline when we have a recent
        // geocoded result.  TTL = 6 h so a second request within the same
        // session is instant.  Cache key includes day themes so different
        // itinerary structures are not conflated.
        const cacheKey = researchCacheKey({
            destination:  context.destination,
            durationDays: context.durationDays,
            dayThemes:    context.days.map((d) => d.theme),
            style:        context.preferences?.style,
            pace:         context.preferences?.pace,
        });

        const cached = await getResearchCached(cacheKey);
        if (cached) {
            logStructured({
                layer: "agent", agent: "research", step: "cache_hit", requestId,
                data: { destination: context.destination, source: "research_result_cache" },
            });
            logInfo("[ResearchAgent] returning cached result — skipping LLM call");
            return cached as EnrichedTripContext;
        }

        logStructured({
            layer: "agent", agent: "research", step: "cache_miss", requestId,
            data: { destination: context.destination },
        });

        // ── Step 1: Parallel Bright Data searches ──────────────────────────
        const budget = budgetHint(context.preferences, context.durationDays);
        const themes = context.days.map((d) => d.theme).join(", ");

        let attractions: BrightDataResultPayload | null = null;
        let hotels: BrightDataResultPayload | null = null;
        let restaurants: BrightDataResultPayload | null = null;
        let dataSource: "brightdata" | "unverified" = "brightdata";

        if (isBrightDataDisabled()) {
            logError("brightdata.integration_disabled", {
                destination: context.destination,
                message: "Skipping Bright Data calls — BRIGHTDATA_DISABLED flag is set. Operating in LLM-only mode.",
            });
            dataSource = "unverified";
        } else {
            const [attractionsRes, hotelsRes, restaurantsRes] = await Promise.allSettled([
                searchAttractions(context.destination, context.durationDays, themes, context.preferences?.pace),
                searchHotels(context.destination, budget),
                searchRestaurants(context.destination),
            ]);

            const getRes = (r: PromiseSettledResult<BrightDataResultPayload>) =>
                r.status === "fulfilled" ? r.value : null;
            attractions  = getRes(attractionsRes);
            hotels       = getRes(hotelsRes);
            restaurants  = getRes(restaurantsRes);

            const allFailed = [attractions, hotels, restaurants].every(
                (r) => !r || r.status === "failed"
            );
            if (allFailed) {
                dataSource = "unverified";
                logError("brightdata.all_searches_failed", {
                    destination: context.destination,
                    message: "All Bright Data searches returned failed status. Operating in LLM-only mode.",
                });
            }
        }

        const hasGrounding =
            (attractions?.data?.length || 0) +
            (hotels?.data?.length      || 0) +
            (restaurants?.data?.length || 0) > 0;
        if (!hasGrounding) {
            logInfo("[ResearchAgent] no Bright Data results — proceeding with LLM-only generation");
        }
        logStructured({
            layer: "agent", agent: "research", step: "input", requestId,
            data: {
                groundingAttractions: !!attractions?.data?.length,
                groundingHotels:      !!hotels?.data?.length,
                groundingRestaurants: !!restaurants?.data?.length,
                dataSource,
            },
        });

        // ── Step 2: Build grounding context ───────────────────────────────
        const groundingParts: string[] = [];
        const formatEntities = (entities: BrightDataResultPayload["data"]) =>
            entities
                .map((e) => `- ${e.name}${e.rating ? ` (Rating: ${e.rating})` : ""}: ${e.snippet} [Source: ${e.source}]`)
                .join("\n");

        if (attractions?.data?.length) groundingParts.push(`## Attractions & Experiences\n${formatEntities(attractions.data)}`);
        if (hotels?.data?.length)      groundingParts.push(`## Hotels & Accommodation\n${formatEntities(hotels.data)}`);
        if (restaurants?.data?.length) groundingParts.push(`## Restaurants & Dining\n${formatEntities(restaurants.data)}`);
        const groundingContext = groundingParts.join("\n\n");

        // ── Step 3: Shared prompt context (outside attempt closure) ──────────
        const daysList = context.days.map((d) => `  - Day ${d.day}: ${d.theme}`).join("\n");

        const prefSummary = context.preferences
            ? [
                context.preferences.budget != null ? `Budget: $${context.preferences.budget}/day` : null,
                context.preferences.style  ? `Style: ${context.preferences.style}` : null,
                context.preferences.pace   ? `Pace: ${context.preferences.pace}` : null,
              ]
                .filter(Boolean)
                .join(", ")
            : "No specific preferences";

        const client      = LLMClientFactory.create({ agent: "research" });
        const modelConfig = selectModelConfig({ endpoint: "research" });
        const llmOptions  = {
            ...modelConfig,
            responseFormat: "json" as const,
            retries: 1,
        };

        // ── Step 4: LLM call ───────────────────────────────────────────────
        // `enforceHotelCount` appends a CRITICAL override instruction when the
        // first attempt returns fewer than 3 hotels (NYC / low-signal edge case).
        // This avoids a full 500 on valid user input — the system must never crash.
        const attempt = async (enforceHotelCount = false): Promise<EnrichedTripContext> => {
            const hotelOverride = enforceHotelCount
                ? `\n\nCRITICAL OVERRIDE — HOTELS: You MUST include AT LEAST 3 hotels in the "hotels" array. Include one budget option, one mid-range, and one upscale hotel. Returning fewer than 3 hotels is not acceptable.`
                : "";

            const task = `
## Task
Enrich this trip plan with realistic options for activities and hotels.

Destination: ${context.destination}
Duration: ${context.durationDays} days (${context.startDate} → ${context.endDate})
Traveler preferences: ${prefSummary}

Days to enrich:
${daysList}

Instructions:
- Use the web search results above as your primary source of places.
- Provide 3–5 activities per day matching each day's theme.
- Provide exactly 3–5 hotel options total (shared across all days).
- Hotels are MANDATORY — you must include them.
- Return ONLY the JSON object. No markdown, no commentary.${hotelOverride}
`.trim();

            const fullPromptForAttempt = buildFullPrompt({
                system:  RESEARCH_SYSTEM_PROMPT,
                context: groundingContext,
                schema:  RESEARCH_SCHEMA_INSTRUCTION,
                task,
            });

            logStructured({
                layer: "agent", agent: "research", step: "llm-call", requestId,
                data: { model: modelConfig.model, maxTokens: llmOptions.maxTokens, enforceHotelCount },
            });
            const llmResponse = await executeWithRetry(
                client,
                [{ role: "user", content: fullPromptForAttempt }],
                llmOptions
            );
            logStructured({
                layer: "agent", agent: "research", step: "llm-response", requestId,
                data: { contentLength: llmResponse.content.length, latencyMs: llmResponse.latencyMs },
            });
            const raw       = parseJSONResponse<unknown>(llmResponse.content);
            const sanitized = validateAndSanitize(raw, context);
            const result    = mergeIntoContext(context, sanitized);
            logStructured({
                layer: "agent", agent: "research", step: "output", requestId,
                data: {
                    days:            result.days.length,
                    hotels:          result.hotels.length,
                    totalActivities: result.days.reduce((s, d) => s + d.activities.length, 0),
                    dataSource,
                    enforceHotelCount,
                },
            });
            return result;
        };

        const runWithGeocode = async (enforceHotelCount = false): Promise<EnrichedTripContext> => {
            const result   = await attempt(enforceHotelCount);
            const enriched = await attachCoordinates(result, requestId);

            // Store the geocoded result so the next identical request is instant
            await setResearchCached(cacheKey, enriched);
            logStructured({
                layer: "agent", agent: "research", step: "end", requestId,
                data: { destination: context.destination, cached: true },
            });

            // Warning is run-specific (Bright Data may be available on next request)
            // so it is added after caching to avoid polluting cached results.
            if (dataSource === "unverified") {
                return {
                    ...enriched,
                    warnings: [
                        ...(enriched.warnings ?? []),
                        "Some activities are AI-generated and may not reflect real-world data.",
                    ],
                };
            }
            return enriched;
        };

        try {
            return await runWithGeocode(false);
        } catch (firstErr) {
            const firstErrMsg = (firstErr as Error).message;
            // If first failure was a hotel-count error, retry with an explicit
            // override instruction so the LLM knows it MUST produce 3+ hotels.
            const isHotelCountError = firstErrMsg.includes("hotels has only");
            logStructured({
                layer: "agent", agent: "research", step: "error", requestId,
                data: { attempt: 1, error: trunc(firstErrMsg), willEnforceHotels: isHotelCountError },
            });
            logError("[ResearchAgent] first attempt failed — retrying once", firstErr);
            try {
                return await runWithGeocode(isHotelCountError);
            } catch (secondErr) {
                logStructured({
                    layer: "agent", agent: "research", step: "error", requestId,
                    data: { attempt: 2, error: trunc((secondErr as Error).message), fatal: true },
                });
                logError("[ResearchAgent] failed after retry — hotels could not be populated", secondErr);
                throw secondErr;
            }
        }
    }
}
