/**
 * Mapbox Geocoding Service — elite-grade precision
 *
 * Design guarantees:
 *  • Never throws — every public function returns null / fallback on failure.
 *  • Never returns (0,0) — callers receive null on failure.
 *  • Tiered distance thresholds:
 *      dense city  →  30 km  (Tokyo, NYC, London, Paris …)
 *      city        →  50 km
 *      region      → 120 km
 *      country     → 150 km  (was 300 — too permissive)
 *  • Country filter — pins queries to the right country at API level.
 *  • Anti-centroid rejection (dense cities): candidates within 0.3 km of the
 *    destination centroid are REJECTED on Query A, then retried with a POI-
 *    only Query B.  Prevents "Shibuya → Tokyo city centre" collapses.
 *  • Dual-query strategy (dense cities):
 *      Query A: "Place, InferredCity, Country" (poi,address, limit=3)
 *      Query B: "Place InferredCity" (poi only, limit=3) — if A all-centroid
 *  • Country-level inference: geocoding uses the inferred city (e.g. "Rome")
 *    instead of the country name ("Italy") for much tighter queries.
 *  • Multi-candidate selection — picks closest non-centroid match.
 *  • Precision scoring — GeocodedPlace carries "high" | "medium" | "low".
 *  • Stopword-normalised cache keys — improves cross-run cache reuse.
 *  • Cache key v3 — invalidates old centroid-heavy v2 entries for dense cities.
 *  • One retry — transient network failures trigger a single transparent retry.
 *  • 7-day Redis cache — warm cache = zero Mapbox calls per destination.
 *  • Parallel batch execution via Promise.allSettled.
 *  • Accuracy metrics logged on every batch completion.
 */

import { env } from "@/infrastructure/env";
import { getRedisClient } from "@/lib/redis";
import { logStructured, logError } from "@/infrastructure/logger";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const GEOCODE_CACHE_TTL_S  = 604_800; // 7 days
const FETCH_TIMEOUT_MS     = 4_000;
const RETRY_DELAY_MS       = 300;

/**
 * Tiered distance thresholds by destination feature type.
 *
 * Evidence from production audit (2026-04-11):
 *  • 300 km country cap: let through Orsay town (≠ Musée d'Orsay), Piazza Navona → Parma.
 *  • 50 km city cap: correct for Versailles (25 km from Paris centroid).
 *  • 30 km dense-city cap: Tokyo POIs within 30 km; prevents wrong-ward/suburb matches.
 *  • 0.3 km anti-centroid: any result within 0.3 km of city centre is city-centroid
 *    noise, not a real POI geocode — reject and retry with POI-only query.
 */
const MAX_DIST_DENSE_CITY  =  30;  // tight: Tokyo, NYC, London, Paris, Seoul …
const MAX_DIST_CITY        =  50;  // standard city trips
const MAX_DIST_REGION      = 120;  // state/province-level destinations
const MAX_DIST_COUNTRY     = 150;  // country-level (reduced from 300 — was too permissive)
const CENTROID_CLUSTER_KM  = 0.5; // within this → mark "low" precision (soft)
const ANTI_CENTROID_KM     = 0.3; // within this for dense cities → REJECT (hard)

/**
 * Travel/hospitality stopwords stripped from place names before cache key
 * generation.  The geocoding *query* always uses the original name.
 */
const CACHE_STOPWORDS = new Set([
    "a", "an", "the", "and", "of", "in", "at", "to", "by", "near",
    "hotel", "restaurant", "cafe", "café", "bar", "pub", "inn", "lodge",
    "museum", "gallery", "park", "church", "cathedral", "temple", "shrine",
    "tour", "visit", "trip", "experience", "walk", "stroll", "ride",
    "day", "night", "evening", "morning", "afternoon",
]);

/**
 * Dense cities where all geocoding uses a tighter 30 km threshold and
 * the anti-centroid rejection rule (< 0.3 km → reject, retry with POI query).
 *
 * These cities have very high POI density within a small area, so
 * city-centroid geocodes are useless for routing.
 */
const DENSE_CITY_NAMES = new Set([
    "tokyo", "osaka", "kyoto", "yokohama",
    "beijing", "shanghai", "guangzhou", "shenzhen",
    "new york", "new york city", "nyc", "manhattan",
    "london",
    "paris",
    "seoul", "busan",
    "bangkok", "jakarta",
    "istanbul",
    "hong kong", "singapore",
    "mumbai", "delhi", "bangalore",
    "mexico city",
    "são paulo", "sao paulo",
    "cairo",
    "amsterdam", "berlin", "rome", "madrid", "barcelona",
]);

// ─── Internal types ──────────────────────────────────────────────────────────

interface MapboxFeature {
    center:      [number, number];
    place_name:  string;
    place_type?: string[];
    context?:    Array<{ id: string; short_code?: string; text: string }>;
}

interface MapboxGeocodeResponse {
    features?: MapboxFeature[];
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Geocoding precision level:
 *  high   — result within 5 km of centroid AND not centroid-cluster-level.
 *  medium — result within threshold AND not centroid-cluster-level.
 *  low    — result is centroid-cluster-level (Mapbox returned the city, not
 *           the POI) OR this is a centroid fallback.
 */
export type GeocodePrecision = "high" | "medium" | "low";

/** Geocoded coordinates with precision metadata. */
export interface GeocodedPlace {
    lat:       number;
    lng:       number;
    precision: GeocodePrecision;
}

/** Full result of a centroid lookup — includes extracted country code. */
export interface CentroidResult {
    lat:         number;
    lng:         number;
    /** ISO 3166-1 alpha-2, lowercase (e.g. "gb", "fr", "jp"). Null when not returned. */
    countryCode: string | null;
    /**
     * Mapbox feature type for the destination:
     *   place   → 50 km threshold  (city-level)
     *   region  → 120 km threshold (state/province)
     *   country → 150 km threshold (coarse only)
     */
    featureType: "place" | "region" | "country";
}

/** Options forwarded to every individual place geocode. */
export interface GeocodeOptions {
    /** Biases ranking toward this coordinate. Pass centroid for best accuracy. */
    proximity?:     { lat: number; lng: number };
    /** ISO 3166-1 alpha-2 country filter — eliminates wrong-country matches. */
    country?:       string;
    /** Centroid for distance validation and precision scoring. */
    centroid?:      { lat: number; lng: number };
    /** Maximum allowed distance in km from centroid. Set from featureType. */
    maxDistanceKm?: number;
    /**
     * Set to true for dense cities (Tokyo, NYC, London …).
     * Enables the anti-centroid rejection rule (< 0.3 km → reject, retry POI).
     * Also uses the tighter 30 km threshold instead of 50 km.
     */
    denseCity?:     boolean;
    /**
     * For country-level destinations: the inferred primary city
     * (e.g. "rome" for destination "Italy").  Used to build tighter
     * queries: "Colosseum, Rome, Italy" instead of "Colosseum, Italy".
     */
    inferredCity?:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMapboxToken(): string | undefined {
    return env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

/**
 * Returns true when the destination is a dense city that needs the
 * anti-centroid rule and tighter distance threshold.
 */
export function isDenseCityDestination(destination: string): boolean {
    const d = destination.toLowerCase().trim();
    return [...DENSE_CITY_NAMES].some((name) => d.includes(name));
}

/**
 * Normalises a place name for cache key generation:
 *  1. Unicode decomposition → ASCII-safe form (Café → cafe).
 *  2. Lowercase + trim.
 *  3. Strip travel/hospitality stopwords.
 *  4. Append original UTF-8 byte-length to prevent collisions when two names
 *     strip to the same form ("Louvre Museum Tour" vs "Louvre").
 *
 * The geocoding *query* is never normalised — only the cache key.
 */
function normalizePlaceName(s: string): string {
    const decoded = s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    const words = decoded
        .split(/[\s\-\/,]+/)
        .map((w) => w.replace(/[^\w]/g, ""))
        .filter((w) => w.length > 1 && !CACHE_STOPWORDS.has(w));
    const core = words.length > 0
        ? words.join("_")
        : decoded.replace(/\s+/g, "_").replace(/[^\w_]/g, "");
    return `${core}_${Buffer.byteLength(s, "utf8")}`;
}

/** Returns true only for coordinates that are plausibly on Earth. */
export function isValidGeoCoord(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        !(lat === 0 && lng === 0) &&
        lat >= -90  && lat <= 90 &&
        lng >= -180 && lng <= 180
    );
}

/** Haversine distance in kilometres between two coordinates. */
function haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    const R    = 6_371;
    const dLat = (b.lat - a.lat) * (Math.PI / 180);
    const dLng = (b.lng - a.lng) * (Math.PI / 180);
    const sin2 =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * (Math.PI / 180)) *
        Math.cos(b.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

/**
 * Extracts ISO 3166-1 alpha-2 country code from a Mapbox feature's context.
 */
function extractCountryCode(feature: MapboxFeature): string | null {
    const entry = feature.context?.find((c) => c.id.startsWith("country."));
    return entry?.short_code?.toLowerCase() ?? null;
}

/**
 * Derives Mapbox destination type from `place_type[0]` (preferred) or context
 * depth (fallback). Used to select the appropriate distance validation threshold.
 */
function extractFeatureType(feature: MapboxFeature): "place" | "region" | "country" {
    const placeType = feature.place_type?.[0];
    if (placeType === "country") return "country";
    if (placeType === "region")  return "region";
    if (placeType === "place")   return "place";
    // Context-depth heuristic when place_type is absent:
    const contextLen = feature.context?.length ?? 0;
    if (contextLen === 0) return "country";
    if (contextLen === 1) return "region";
    return "place";
}

/**
 * Returns the km distance threshold appropriate for the destination's feature
 * type and density classification.
 *
 *   dense city →  30 km (Tokyo, NYC, London, Paris …)
 *   city       →  50 km
 *   region     → 120 km
 *   country    → 150 km
 */
export function maxDistanceForFeatureType(
    type: CentroidResult["featureType"],
    denseCity = false,
): number {
    if (type === "country") return MAX_DIST_COUNTRY;
    if (type === "region")  return MAX_DIST_REGION;
    return denseCity ? MAX_DIST_DENSE_CITY : MAX_DIST_CITY;
}

// ─── Internal: best-candidate selector ───────────────────────────────────────

/**
 * Selects the best geocoding candidate from a list given centroid constraints.
 *
 * @param candidates     Valid (lat, lng) pairs from Mapbox.
 * @param centroid       Destination centre. If absent, first candidate wins.
 * @param maxDistanceKm  Reject candidates farther than this.
 * @param antiCentroidKm Reject candidates closer than this (centroid-cluster).
 *                       Pass 0 to disable anti-centroid rejection.
 */
function selectBest(
    candidates: Array<{ lat: number; lng: number }>,
    centroid:      { lat: number; lng: number } | undefined,
    maxDistanceKm: number,
    antiCentroidKm: number,
): { lat: number; lng: number; distKm: number } | null {
    if (!centroid) {
        const first = candidates[0];
        return first ? { ...first, distKm: 0 } : null;
    }

    let best: { lat: number; lng: number } | null = null;
    let bestDistKm = Infinity;

    for (const c of candidates) {
        const dist = haversineKm(c, centroid);
        if (dist > maxDistanceKm)   continue; // too far from destination
        if (dist < antiCentroidKm)  continue; // centroid-cluster — reject
        if (dist < bestDistKm) {
            best       = c;
            bestDistKm = dist;
        }
    }

    return best ? { ...best, distKm: bestDistKm } : null;
}

// ─── Internal: single-URL fetch → candidate coordinates ──────────────────────

async function fetchCandidates(
    url: string,
    label: string,
): Promise<Array<{ lat: number; lng: number }>> {
    try {
        const res = await fetchWithRetry(url, label);
        if (!res.ok) return [];
        const data = (await res.json()) as MapboxGeocodeResponse;
        return (data?.features ?? [])
            .map((f) => ({ lat: f.center[1]!, lng: f.center[0]! }))
            .filter((c) => isValidGeoCoord(c.lat, c.lng));
    } catch {
        return [];
    }
}

// ─── Fetch with one retry ────────────────────────────────────────────────────

/**
 * Fetches a URL with a 4 s timeout.
 * On first failure waits RETRY_DELAY_MS and retries once; throws on second fail.
 */
async function fetchWithRetry(url: string, label: string): Promise<Response> {
    const attempt = () => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    try {
        return await attempt();
    } catch {
        logStructured({
            layer: "service", service: "geocoding", step: "retry_attempt",
            data: { place: label },
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return attempt();
    }
}

// ─── Cache helpers ───────────────────────────────────────────────────────────

async function cacheGet(redis: NonNullable<ReturnType<typeof getRedisClient>>, key: string) {
    try { return await redis.get(key); } catch { return null; }
}

async function cacheSet(
    redis: NonNullable<ReturnType<typeof getRedisClient>>,
    key: string,
    value: unknown,
) {
    try {
        await redis.setex(key, GEOCODE_CACHE_TTL_S, JSON.stringify(value));
    } catch {
        // Non-fatal — proceed without caching.
    }
}

// ─── Centroid geocoder ───────────────────────────────────────────────────────

/**
 * Geocodes the trip destination and returns its centroid + metadata.
 * Used once per trip to anchor all subsequent place geocodes.
 * Returns null if Mapbox is unconfigured or returns no results. Never throws.
 */
export async function geocodeCentroid(destination: string): Promise<CentroidResult | null> {
    const token = getMapboxToken();
    if (!token) {
        logStructured({
            layer: "service", service: "geocoding", step: "cache_disabled",
            data: { reason: "NEXT_PUBLIC_MAPBOX_TOKEN not configured" },
        });
        return null;
    }

    const cacheKey = `mapbox:geocode:centroid:${normalizePlaceName(destination)}`;
    const redis    = getRedisClient();

    if (redis) {
        const cached = await cacheGet(redis, cacheKey);
        if (cached) {
            logStructured({
                layer: "service", service: "geocoding", step: "cache_hit",
                data: { place: destination, type: "centroid" },
            });
            const parsed = JSON.parse(cached) as Partial<CentroidResult>;
            return {
                lat:         parsed.lat!,
                lng:         parsed.lng!,
                countryCode: parsed.countryCode ?? null,
                featureType: parsed.featureType ?? "place",
            };
        }
    }

    logStructured({
        layer: "service", service: "geocoding", step: "cache_miss",
        data: { place: destination, type: "centroid" },
    });

    try {
        const params = new URLSearchParams({
            limit:        "1",
            types:        "place,region,country",
            language:     "en",
            access_token: token,
        });
        const url = `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(destination)}.json?${params.toString()}`;
        const res = await fetchWithRetry(url, destination);

        if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);

        const data    = (await res.json()) as MapboxGeocodeResponse;
        const feature = data?.features?.[0];
        if (!feature) return null;

        const [lng, lat] = feature.center;
        if (!isValidGeoCoord(lat, lng)) return null;

        const countryCode = extractCountryCode(feature);
        const featureType = extractFeatureType(feature);
        const result: CentroidResult = { lat, lng, countryCode, featureType };

        logStructured({
            layer: "service", service: "geocoding", step: "success",
            data: { place: destination, lat, lng, countryCode, featureType, type: "centroid" },
        });

        if (redis) await cacheSet(redis, cacheKey, result);
        return result;
    } catch (err) {
        logError("geocode.centroid_failed", { destination, error: (err as Error).message });
        logStructured({
            layer: "service", service: "geocoding", step: "failed",
            data: { place: destination, error: (err as Error).message, type: "centroid" },
        });
        return null;
    }
}

// ─── Single place geocoder ───────────────────────────────────────────────────

/**
 * Geocodes a single place name with multi-candidate selection and precision scoring.
 *
 * Accuracy layers applied in order:
 *  1. Cache key v3 (stopword-stripped + inferredCity slot) — cross-run cache reuse.
 *  2. Query A: "Place, EffectiveDest" — comma-separated with country code filter.
 *     EffectiveDest = inferredCity ?? destination  (e.g. "Colosseum, Rome, Italy").
 *  3. Best-candidate selection: pick result closest to centroid, within threshold.
 *     For dense cities: reject candidates < 0.3 km from centroid (centroid-cluster).
 *  4. Query B (dense cities only, when Query A has all-centroid results):
 *     Space-separated with types=poi  →  targets specific venues more reliably.
 *  5. Last-resort accept: if Query B also fails, accept the closest Query A candidate
 *     without the anti-centroid rule (better than returning null).
 *  6. Precision scoring:
 *       high   → < 5 km from centroid, not cluster-level
 *       medium → within threshold, not cluster-level
 *       low    → within CENTROID_CLUSTER_KM (city returned instead of POI)
 *  7. country= filter — eliminates wrong-country matches at API level.
 *  8. proximity= bias — pushes ranking toward destination city.
 *
 * Never throws. Returns null on failure or if all candidates exceed threshold.
 */
export async function geocodePlace(
    placeName: string,
    destination: string,
    options: GeocodeOptions = {},
): Promise<GeocodedPlace | null> {
    const token = getMapboxToken();
    if (!token) return null;

    const {
        proximity,
        country,
        centroid,
        maxDistanceKm = MAX_DIST_COUNTRY,
        denseCity = false,
        inferredCity,
    } = options;

    // For country-level trips: use the inferred city name in queries.
    // "Colosseum, Rome, Italy" is far more accurate than "Colosseum, Italy".
    const effectiveDest = inferredCity
        ? `${inferredCity}, ${destination.trim()}`
        : destination.trim();

    // Cache key v3: includes inferredCity slot, invalidates old centroid-heavy v2 entries
    const cacheKey = `mapbox:geocode3:${normalizePlaceName(placeName)}:${normalizePlaceName(inferredCity ?? destination)}`;

    // Anti-centroid threshold: dense cities reject results within 0.3 km of city centre.
    // For non-dense cities: 0 = no anti-centroid rejection (all valid distances accepted).
    const antiCentroidKm = denseCity ? ANTI_CENTROID_KM : 0;

    // ── 1. Cache check ────────────────────────────────────────────────────
    const redis = getRedisClient();
    if (redis) {
        const cached = await cacheGet(redis, cacheKey);
        if (cached) {
            logStructured({
                layer: "service", service: "geocoding", step: "cache_hit",
                data: { place: placeName },
            });
            const parsed = JSON.parse(cached) as Partial<GeocodedPlace>;
            return {
                lat:       parsed.lat!,
                lng:       parsed.lng!,
                precision: parsed.precision ?? "medium",
            };
        }
    }

    logStructured({
        layer: "service", service: "geocoding", step: "cache_miss",
        data: { place: placeName },
    });

    try {
        // Base params shared between Query A and Query B
        const baseParams = new URLSearchParams({
            limit:        "3",
            language:     "en",
            access_token: token,
        });
        if (country)   baseParams.set("country",   country);
        if (proximity) baseParams.set("proximity", `${proximity.lng.toFixed(4)},${proximity.lat.toFixed(4)}`);

        // ── 2. Query A — comma-separated with effective destination ────────
        // "Tsukiji Fish Market, Tokyo, jp" beats "Tsukiji Fish Market Tokyo"
        // because Mapbox's comma parsing treats each segment as a filter.
        const queryA = [placeName, effectiveDest].join(", ");
        const paramsA = new URLSearchParams(baseParams);
        paramsA.set("types", "poi,address");

        const urlA    = `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(queryA)}.json?${paramsA.toString()}`;
        const coordsA = await fetchCandidates(urlA, placeName);

        // ── 3. Best candidate from Query A (with anti-centroid rejection) ──
        let best = selectBest(coordsA, centroid, maxDistanceKm, antiCentroidKm);
        let usedSecondPass = false;

        // ── 4. Query B — dense cities, when Query A was all-centroid ───────
        // Mapbox often returns city-level matches for English POI names
        // (e.g. "Shibuya Crossing" → Tokyo centre).  A POI-typed query with
        // space-separated terms often resolves the actual venue.
        if (!best && denseCity) {
            const queryB  = `${placeName} ${inferredCity ?? destination}`;
            const paramsB = new URLSearchParams(baseParams);
            paramsB.set("types", "poi");
            paramsB.set("limit", "3");

            const urlB    = `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(queryB)}.json?${paramsB.toString()}`;
            const coordsB = await fetchCandidates(urlB, placeName);

            best = selectBest(coordsB, centroid, maxDistanceKm, antiCentroidKm);
            usedSecondPass = true;

            // 5. Last-resort accept: if Query B also all-centroid, accept
            //    closest Query A/B candidate without the anti-centroid rule.
            //    A slightly-wrong centroid-level coord is still better than null.
            if (!best) {
                best = selectBest([...coordsA, ...coordsB], centroid, maxDistanceKm, 0);
                if (best) {
                    logStructured({
                        layer: "service", service: "geocoding", step: "second_pass",
                        data: { place: placeName, accepted: "centroid_fallback", distKm: Math.round(best.distKm) },
                    });
                }
            } else {
                logStructured({
                    layer: "service", service: "geocoding", step: "second_pass",
                    data: { place: placeName, distKm: Math.round(best.distKm) },
                });
            }
        }

        if (!best) return null;

        // ── 6. Precision scoring ───────────────────────────────────────────
        // Centroid-cluster: result is within the "city returned, not POI" range.
        // For dense cities we use the tighter ANTI_CENTROID_KM threshold;
        // for normal cities, CENTROID_CLUSTER_KM (0.5 km).
        const clusterKm = denseCity ? ANTI_CENTROID_KM : CENTROID_CLUSTER_KM;
        let precision: GeocodePrecision;

        if (!centroid || best.distKm < clusterKm) {
            precision = "low";   // Mapbox returned city, not the specific POI
        } else if (best.distKm < 5) {
            precision = "high";  // Very precise — within 5 km of expected location
        } else {
            precision = "medium";
        }

        const result: GeocodedPlace = { lat: best.lat, lng: best.lng, precision };

        logStructured({
            layer: "service", service: "geocoding", step: "success",
            data: {
                place:               placeName,
                lat:                 result.lat,
                lng:                 result.lng,
                precision,
                distKm:              centroid ? Math.round(best.distKm) : null,
                candidatesEvaluated: coordsA.length,
                usedSecondPass,
                denseCity,
            },
        });

        if (redis) await cacheSet(redis, cacheKey, result);
        return result;
    } catch (err) {
        logError("geocode.failed", { place: placeName, error: (err as Error).message });
        logStructured({
            layer: "service", service: "geocoding", step: "failed",
            data: { place: placeName, error: (err as Error).message },
        });
        return null;
    }
}

// ─── Batch geocoder ──────────────────────────────────────────────────────────

/**
 * Geocodes a list of place names in parallel, returning a precision-aware map.
 *
 * - Promise.allSettled — one failure never blocks others.
 * - Deduplicates names before Mapbox calls.
 * - Fallback entries (null result / exception) receive precision: "low".
 * - Emits a geocode_accuracy log after the batch completes.
 */
export async function batchGeocode(
    names:       string[],
    destination: string,
    fallback:    { lat: number; lng: number },
    options:     GeocodeOptions = {},
): Promise<Map<string, GeocodedPlace>> {
    const unique = [...new Set(names)];

    const results = await Promise.allSettled(
        unique.map((name) => geocodePlace(name, destination, options)),
    );

    const map = new Map<string, GeocodedPlace>();
    let highCount     = 0;
    let mediumCount   = 0;
    let lowCount      = 0;
    let fallbackCount = 0;

    results.forEach((result, i) => {
        const name = unique[i]!;
        if (result.status === "fulfilled" && result.value) {
            map.set(name, result.value);
            if      (result.value.precision === "high")   highCount++;
            else if (result.value.precision === "medium") mediumCount++;
            else                                          lowCount++;
        } else {
            logStructured({
                layer: "service", service: "geocoding", step: "fallback_used",
                data: { place: name },
            });
            map.set(name, { ...fallback, precision: "low" });
            fallbackCount++;
        }
    });

    const total       = unique.length;
    const usableCount = highCount + mediumCount;

    logStructured({
        layer: "service", service: "geocoding", step: "geocoding_complete",
        data: {
            total,
            highCount,
            mediumCount,
            lowCount,
            fallbackCount,
            usableRate:    total > 0 ? `${Math.round((usableCount / total) * 100)}%` : "n/a",
            countryFilter: options.country ?? "none",
            maxDistanceKm: options.maxDistanceKm ?? MAX_DIST_COUNTRY,
            denseCity:     options.denseCity ?? false,
        },
    });

    // Emit a dedicated accuracy-metrics event for dashboards / alerting
    logStructured({
        layer: "service", service: "geocoding", step: "geocode_accuracy",
        data: {
            destination,
            total,
            highCount,
            mediumCount,
            lowCount,
            fallbackCount,
            precisionRate: total > 0 ? Math.round((usableCount / total) * 100) : 0,
        },
    });

    return map;
}
