/**
 * Mapbox Directions Matrix service — hardened
 *
 * Design guarantees:
 *  • isInvalidCoord rejects NaN, Infinity, (0,0), and out-of-range values.
 *  • Redis and Mapbox errors are caught in separate blocks — a Redis miss
 *    never triggers Haversine; only a Mapbox network/API error does.
 *  • 6 s timeout + 1 transparent retry before falling back to Haversine.
 *  • >25 coords: slices to 25 and logs matrix_truncated instead of throwing.
 *  • null durations from Mapbox are filled via Haversine for that cell.
 *  • Structured logs for every branch: cache_hit, matrix_fetch, failed, fallback_used.
 */

import { env } from "@/infrastructure/env";
import { getRedisClient } from "@/lib/redis";
import { logStructured, logError } from "@/infrastructure/logger";

export interface GeoCoordinate {
    lat: number;
    lng: number;
}

const MAPBOX_MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";
const MATRIX_CACHE_TTL_S = 86_400; // 24 h
const FETCH_TIMEOUT_MS   = 6_000;  // 6 s — raised from 3 s
const RETRY_DELAY_MS     = 400;
const MAX_COORDS         = 25;     // Mapbox hard limit

// ─── Coordinate validation ────────────────────────────────────────────────────

/**
 * Returns true if lat/lng are NOT usable for routing.
 * Catches: undefined, NaN, Infinity, (0,0), and out-of-range values.
 */
export function isInvalidCoord(lat?: number, lng?: number): boolean {
    return (
        lat  === undefined || lng  === undefined ||
        !Number.isFinite(lat)  || !Number.isFinite(lng) ||
        (lat === 0 && lng === 0) ||
        lat  < -90  || lat  > 90  ||
        lng  < -180 || lng  > 180
    );
}

// ─── Haversine fallback ───────────────────────────────────────────────────────

/**
 * Straight-line driving-time estimate between two coordinates.
 * Assumes 35 km/h average urban speed × 1.35 detour factor.
 * Returns at minimum 5 minutes (non-zero for adjacent places).
 */
export function haversineDistanceMins(c1: GeoCoordinate, c2: GeoCoordinate): number {
    const R    = 6_371;
    const dLat = (c2.lat - c1.lat) * (Math.PI / 180);
    const dLng = (c2.lng - c1.lng) * (Math.PI / 180);
    const a    =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(c1.lat * (Math.PI / 180)) *
        Math.cos(c2.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(5, Math.ceil((d / 35) * 60 * 1.35));
}

/** Build a full Haversine matrix (used when Mapbox is unavailable). */
function haversineMatrix(coords: GeoCoordinate[]): number[][] {
    return coords.map((c1) => coords.map((c2) => haversineDistanceMins(c1, c2)));
}

// ─── Fetch with one retry ─────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response> {
    const attempt = () => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    try {
        return await attempt();
    } catch {
        logStructured({
            layer: "service", service: "mapbox", step: "retry_attempt",
            data: { op: "matrix" },
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return attempt(); // throws if second attempt also fails
    }
}

// ─── Main matrix function ─────────────────────────────────────────────────────

/**
 * Returns an N×N matrix of driving times in minutes.
 *
 * Truncation: if more than 25 coords are supplied, the list is sliced to 25
 * and a matrix_truncated warning is logged.  Callers must build per-day
 * matrices (hotel + day activities ≤ 7 points) to avoid truncation entirely.
 *
 * Fallback: on any Mapbox API or network error, returns a full Haversine
 * matrix so routing can proceed (with lower accuracy).
 *
 * Never throws.
 */
export async function getTravelTimeMatrix(coords: GeoCoordinate[]): Promise<{ matrix: number[][]; usedFallback: boolean }> {
    if (coords.length < 2) return { matrix: [[0]], usedFallback: false };

    let workingCoords = coords;
    if (coords.length > MAX_COORDS) {
        logStructured({
            layer: "service", service: "mapbox", step: "matrix_truncated",
            data: { requested: coords.length, limit: MAX_COORDS },
        });
        workingCoords = coords.slice(0, MAX_COORDS);
    }

    // ── Cache key: order-independent coordinate fingerprint ───────────────
    const sortedTokens = workingCoords
        .map((c) => `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`)
        .sort();
    const cacheKey = `mapbox:matrix:v3:${sortedTokens.join(";")}`;

    // ── Redis block (non-fatal) ───────────────────────────────────────────
    // Redis failure ≠ Haversine trigger — it is simply a cache miss.
    let redis = getRedisClient();
    try {
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                logStructured({
                    layer: "service", service: "mapbox", step: "matrix_cache_hit",
                    data: { size: workingCoords.length },
                });
                const parsed = JSON.parse(cached) as number[][] | { matrix: number[][]; usedFallback: boolean };
                const isLegacy = Array.isArray(parsed);
                return {
                    matrix:      isLegacy ? parsed : parsed.matrix,
                    usedFallback: isLegacy ? false : (parsed.usedFallback ?? false),
                };
            }
        }
    } catch {
        // Cache unavailable — proceed to live API call
        redis = null;
    }

    // ── Mapbox fetch block ────────────────────────────────────────────────
    const token = process.env.MAPBOX_TOKEN ?? env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
        logStructured({
            layer: "service", service: "mapbox", step: "fallback_used",
            data: { reason: "no Mapbox token configured" },
        });
        return { matrix: haversineMatrix(workingCoords), usedFallback: true };
    }

    try {
        const coordStr = workingCoords
            .map((c) => `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`)
            .join(";");
        const url = `${MAPBOX_MATRIX_URL}/${coordStr}?annotations=duration&access_token=${token}`;

        const res = await fetchWithRetry(url);
        if (!res.ok) throw new Error(`Mapbox Matrix HTTP ${res.status}`);

        const body = (await res.json()) as { durations?: (number | null)[][] };
        if (!body.durations) throw new Error("Mapbox Matrix: no durations in response");

        // Convert seconds to minutes; null cells → Haversine for that pair
        const matrixMins: number[][] = body.durations.map((row, i) =>
            row.map((sec, j) => {
                if (sec === null) return haversineDistanceMins(workingCoords[i]!, workingCoords[j]!);
                return Math.max(0, Math.ceil(sec / 60));
            })
        );

        logStructured({
            layer: "service", service: "mapbox", step: "matrix_fetch",
            data: { size: workingCoords.length },
        });

        // Cache write (non-fatal)
        if (redis) {
            try {
                await redis.setex(cacheKey, MATRIX_CACHE_TTL_S, JSON.stringify({ matrix: matrixMins, usedFallback: false }));
            } catch {
                // Cache write failure is non-fatal
            }
        }

        return { matrix: matrixMins, usedFallback: false };
    } catch (err) {
        logError("mapbox.matrix_failed", { error: (err as Error).message });
        logStructured({
            layer: "service", service: "mapbox", step: "fallback_used",
            data: { reason: (err as Error).message },
        });
        return { matrix: haversineMatrix(workingCoords), usedFallback: true };
    }
}
