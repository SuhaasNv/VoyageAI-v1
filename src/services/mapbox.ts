import { env } from "@/infrastructure/env";
import { getRedisClient } from "@/lib/redis";
import { logStructured, logError } from "@/infrastructure/logger";

export interface GeoCoordinate {
    lat: number;
    lng: number;
}

const MAPBOX_MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";

export function haversineDistanceMins(c1: GeoCoordinate, c2: GeoCoordinate): number {
    const R = 6371; // km
    const dLat = (c2.lat - c1.lat) * (Math.PI / 180);
    const dLng = (c2.lng - c1.lng) * (Math.PI / 180);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(c1.lat * (Math.PI / 180)) * Math.cos(c2.lat * (Math.PI / 180)) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const d = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    return Math.max(5, Math.floor((d / 35) * 60 * 1.35)); 
}

export const isInvalidCoord = (lat?: number, lng?: number): boolean => {
    return lat === undefined || lng === undefined || (lat === 0 && lng === 0);
};

export async function getTravelTimeMatrix(coords: GeoCoordinate[]): Promise<number[][]> {
    if (coords.length < 2) return [[0]];
    if (coords.length > 25) throw new Error("Matrix call exceeds Mapbox length limit (25 max)");

    const sortedTokens = coords.map(c => `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`).sort();
    const cacheKey = `mapbox:matrix:v2:${sortedTokens.join(";")}`;

    try {
        const redisClient = getRedisClient();
        if (redisClient) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                logStructured({ layer: "service", service: "mapbox", step: "matrix_cache_hit", data: { hit: true } });
                return JSON.parse(cached);
            }
        }

        const tokenString = coords.map(c => `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`).join(";");
        const url = `${MAPBOX_MATRIX_URL}/${tokenString}?annotations=duration&access_token=${env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
        
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`Mapbox API HTTP ${res.status}`);
        
        const data = await res.json();
        const matrixMins = data.durations.map((row: number[]) => row.map((sec: number | null) => sec == null ? 20 : Math.ceil(sec / 60)));
        
        if (redisClient) {
            await redisClient.setex(cacheKey, 86400, JSON.stringify(matrixMins));
        }
        logStructured({ layer: "service", service: "mapbox", step: "matrix_fetch", data: { matrixSize: coords.length } });
        
        return matrixMins;

    } catch (err) {
        logError("Mapbox Matrix failed, using Haversine Fallback", err);
        logStructured({ layer: "service", service: "mapbox", step: "fallback_used", data: { reason: (err as Error).message } });
        
        return coords.map(c1 => coords.map(c2 => haversineDistanceMins(c1, c2)));
    }
}
