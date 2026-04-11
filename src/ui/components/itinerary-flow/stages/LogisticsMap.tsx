"use client";

/**
 * LogisticsMap.tsx
 *
 * Renders a Mapbox map centered on the actual trip destination,
 * with activity markers for the selected day.
 *
 * Coordinate strategy — in priority order:
 *  1. Use the lat/lng already embedded in each ScheduledActivity / HotelOption
 *     by the Research Agent.  These come from a properly validated geocoding
 *     pipeline (country filter + proximity bias + distance validation).
 *     → No extra API calls, no wrong-country matches.
 *  2. Fall back to a live Mapbox Geocoding call ONLY when an activity lacks
 *     coordinates (e.g. legacy data).  The fallback uses the destination
 *     centroid as a proximity bias to stay in the right country.
 *
 * Key guarantees:
 *  - Never ignores embedded coordinates in favour of raw re-geocoding.
 *  - No hardcoded coordinates anywhere.
 *  - Destination centroid geocoded once on mount → correct initial map centre.
 *  - fitBounds after markers are placed so all stops are visible.
 *  - Loading overlay while map is initialising.
 *  - Dev-only debug panel (destination, lat/lng, marker count).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type mapboxgl from "mapbox-gl";
import { MapPin } from "lucide-react";
import type { OptimizedDay, HotelOption } from "@/agents/logistics/logisticsAgent";

// ─── Coordinate helpers ──────────────────────────────────────────────────────

/**
 * Returns true when lat/lng are a plausible on-Earth coordinate.
 * Mirrors the server-side isValidGeoCoord — guards against (0,0),
 * NaN, Infinity and out-of-range values that would place markers
 * at wrong locations.
 */
function isValidCoord(lat?: number, lng?: number): boolean {
    return (
        lat !== undefined &&
        lng !== undefined &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        !(lat === 0 && lng === 0) &&
        lat >= -90  && lat <= 90 &&
        lng >= -180 && lng <= 180
    );
}

// ─── Fallback geocoder (only used when embedded coords are missing) ───────────

/**
 * Module-level cache — survives re-renders and HMR reloads.
 * Key: "placeName||destLng,destLat" so different destination trips
 * don't share the same cached result.
 */
const GEO_CACHE = new Map<string, { lat: number; lng: number } | null>();

/**
 * Geocodes a place name as a last resort when the activity has no
 * embedded lat/lng.  Always biased toward the destination centroid so
 * the result stays in the right country.
 */
async function geocodeFallback(
    placeName: string,
    destination: string,
    token: string,
    destCentroid?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number } | null> {
    const key = `${placeName.toLowerCase().trim()}||${destination.toLowerCase().trim()}`;
    if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;

    try {
        const params = new URLSearchParams({
            access_token: token,
            limit:        "1",
            types:        "poi,address",
            language:     "en",
        });

        // Proximity bias — push Mapbox toward the destination city.
        if (destCentroid) {
            params.set(
                "proximity",
                `${destCentroid.lng.toFixed(4)},${destCentroid.lat.toFixed(4)}`,
            );
        }

        const query = `${placeName}, ${destination}`;
        const url   = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) { GEO_CACHE.set(key, null); return null; }

        const data = (await res.json()) as {
            features?: Array<{ center: [number, number] }>;
        };
        const c = data.features?.[0]?.center;

        if (!c || !isValidCoord(c[1], c[0])) {
            GEO_CACHE.set(key, null);
            return null;
        }

        // Reject if the result is suspiciously far from the destination centroid
        // (> 200 km).  This prevents the very bug that caused North-America markers.
        if (destCentroid) {
            const dLat = (c[1] - destCentroid.lat) * (Math.PI / 180);
            const dLng = (c[0] - destCentroid.lng) * (Math.PI / 180);
            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(destCentroid.lat * (Math.PI / 180)) *
                Math.cos(c[1] * (Math.PI / 180)) *
                Math.sin(dLng / 2) ** 2;
            const km = 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (km > 200) {
                GEO_CACHE.set(key, null);
                return null;
            }
        }

        const coords = { lat: c[1], lng: c[0] };
        GEO_CACHE.set(key, coords);
        return coords;
    } catch {
        GEO_CACHE.set(key, null);
        return null;
    }
}

/** Geocode just the destination to get its centroid (used for map centre + proximity). */
async function geocodeDestination(
    destination: string,
    token: string,
): Promise<{ lat: number; lng: number } | null> {
    const key = `__dest__${destination.toLowerCase().trim()}`;
    if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;

    try {
        const params = new URLSearchParams({
            access_token: token,
            limit: "1",
            types: "place,region,country",
            language: "en",
        });
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destination)}.json?${params.toString()}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) { GEO_CACHE.set(key, null); return null; }

        const data = (await res.json()) as {
            features?: Array<{ center: [number, number] }>;
        };
        const c = data.features?.[0]?.center;
        if (!c || !isValidCoord(c[1], c[0])) { GEO_CACHE.set(key, null); return null; }

        const coords = { lat: c[1], lng: c[0] };
        GEO_CACHE.set(key, coords);
        return coords;
    } catch {
        GEO_CACHE.set(key, null);
        return null;
    }
}

// ─── Marker colours ───────────────────────────────────────────────────────────

const MARKER_COLORS = [
    "#6366f1", // indigo
    "#14b8a6", // teal
    "#f59e0b", // amber
    "#a855f7", // purple
    "#f43f5e", // rose
    "#10b981", // emerald
    "#f97316", // orange
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogisticsMapProps {
    destination:   string;
    days:          OptimizedDay[];
    activeDay:     number;
    selectedHotel?: HotelOption | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LogisticsMap({
    destination,
    days,
    activeDay,
    selectedHotel,
}: LogisticsMapProps) {
    const containerRef  = useRef<HTMLDivElement>(null);
    const mapRef        = useRef<mapboxgl.Map | null>(null);
    const mboxRef       = useRef<typeof mapboxgl | null>(null);
    const markersRef    = useRef<mapboxgl.Marker[]>([]);
    const mountedRef    = useRef(false);
    const destCentroid  = useRef<{ lat: number; lng: number } | undefined>(undefined);
    const cancelledRef  = useRef(false);

    const [mapLoaded,   setMapLoaded]   = useState(false);
    const [isLocating,  setIsLocating]  = useState(false);
    const [debugInfo,   setDebugInfo]   = useState<{
        destination: string;
        lat?: number;
        lng?: number;
        markers: number;
    } | null>(null);

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    // ── Clear all current markers ────────────────────────────────────────────
    const clearMarkers = useCallback(() => {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
    }, []);

    // ── Resolve coordinates for one activity / hotel ─────────────────────────
    /**
     * Returns the best available coordinates for a named place.
     *
     * Order of preference:
     *  1. Embedded lat/lng (from Research Agent geocoding pipeline) — fast, accurate.
     *  2. Live Mapbox geocode with proximity bias (fallback only).
     *  3. null — marker is skipped.
     */
    const resolveCoords = useCallback(
        async (
            name: string,
            embeddedLat?: number,
            embeddedLng?: number,
        ): Promise<{ lat: number; lng: number } | null> => {
            // Priority 1: use embedded, validated coordinates
            if (isValidCoord(embeddedLat, embeddedLng)) {
                return { lat: embeddedLat!, lng: embeddedLng! };
            }
            // Priority 2: fallback geocode with proximity bias
            if (!token) return null;
            return geocodeFallback(name, destination, token, destCentroid.current);
        },
        [destination, token],
    );

    // ── Place markers for one day ────────────────────────────────────────────
    const placeMarkersForDay = useCallback(
        async (dayNum: number, cancelled: { value: boolean }) => {
            const map  = mapRef.current;
            const mbox = mboxRef.current;
            if (!map || !mbox || !token) return;

            clearMarkers();

            const dayData = days.find((d) => d.day === dayNum);
            if (!dayData) return;

            setIsLocating(true);

            const points: Array<{
                lat:   number;
                lng:   number;
                name:  string;
                color: string;
            }> = [];

            // ── Activity markers ─────────────────────────────────────────────
            for (const act of dayData.activities) {
                if (cancelled.value) return;

                const coords = await resolveCoords(act.name, act.lat, act.lng);
                if (coords) {
                    points.push({
                        ...coords,
                        name:  act.name,
                        color: MARKER_COLORS[points.length % MARKER_COLORS.length]!,
                    });
                }
            }

            // ── Hotel marker ─────────────────────────────────────────────────
            if (selectedHotel?.name && !cancelled.value) {
                const coords = await resolveCoords(
                    selectedHotel.name,
                    selectedHotel.lat,
                    selectedHotel.lng,
                );
                if (coords) {
                    points.push({
                        ...coords,
                        name:  `🏨 ${selectedHotel.name}`,
                        color: "#a855f7",
                    });
                }
            }

            if (cancelled.value) return;
            setIsLocating(false);

            if (process.env.NODE_ENV === "development") {
                console.log(
                    `[LogisticsMap] ${destination} · Day ${dayNum} · ${points.length} markers`,
                    points.map((p) =>
                        `${p.name}: [${p.lng.toFixed(4)}, ${p.lat.toFixed(4)}]`
                    ),
                );
            }

            setDebugInfo((prev) => ({ ...prev!, markers: points.length }));

            if (points.length === 0) return;

            // ── Place markers on map ──────────────────────────────────────────
            for (let i = 0; i < points.length; i++) {
                if (cancelled.value) return;
                const pt = points[i]!;

                const el = document.createElement("div");
                el.style.cssText = `
                    width:28px;height:28px;border-radius:50%;
                    background:${pt.color};color:#fff;
                    display:flex;align-items:center;justify-content:center;
                    font-size:11px;font-weight:800;
                    border:2px solid rgba(255,255,255,0.3);
                    box-shadow:0 2px 10px rgba(0,0,0,0.5);
                    cursor:pointer;
                    transition:transform 0.15s ease,box-shadow 0.15s ease;
                `;
                el.textContent = String(i + 1);

                el.addEventListener("mouseenter", () => {
                    el.style.transform = "scale(1.25)";
                    el.style.boxShadow = `0 0 0 4px ${pt.color}40,0 4px 12px rgba(0,0,0,0.6)`;
                });
                el.addEventListener("mouseleave", () => {
                    el.style.transform = "scale(1)";
                    el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
                });

                const popup = new mbox.Popup({
                    offset: [0, -16],
                    closeButton: false,
                    maxWidth: "200px",
                    focusAfterOpen: false,
                    // @ts-expect-error — autoPan not in types
                    autoPan: false,
                }).setHTML(`
                    <div style="font-family:ui-sans-serif,system-ui;background:#0E1318;
                        border:1px solid rgba(255,255,255,0.08);border-radius:8px;
                        padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                        <div style="font-size:9px;font-weight:800;text-transform:uppercase;
                            letter-spacing:.12em;color:#10B981;margin-bottom:3px;">
                            Stop ${i + 1}
                        </div>
                        <div style="font-size:13px;font-weight:700;color:#fff;line-height:1.3;">
                            ${pt.name}
                        </div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px;">
                            ${destination}
                        </div>
                    </div>
                `);

                const marker = new mbox.Marker({ element: el, anchor: "center" })
                    .setLngLat([pt.lng, pt.lat])
                    .addTo(map);

                el.addEventListener("mouseenter", () => {
                    if (!popup.isOpen()) popup.setLngLat([pt.lng, pt.lat]).addTo(map);
                });
                el.addEventListener("mouseleave", () => popup.remove());
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    map.easeTo({
                        center:   [pt.lng, pt.lat],
                        zoom:     14,
                        duration: 900,
                        essential: true,
                    });
                });

                markersRef.current.push(marker);
            }

            // ── Auto-fit bounds so all stops are visible ──────────────────────
            if (points.length === 1) {
                map.flyTo({
                    center:   [points[0]!.lng, points[0]!.lat],
                    zoom:     14,
                    duration: 1_000,
                    essential: true,
                });
            } else {
                const bounds = new mbox.LngLatBounds();
                points.forEach((p) => bounds.extend([p.lng, p.lat]));
                map.fitBounds(bounds, {
                    padding:  60,
                    duration: 1_000,
                    maxZoom:  14,
                    essential: true,
                });
            }
        },
        [days, destination, selectedHotel, token, clearMarkers, resolveCoords],
    );

    // ── Initialise map once per mount ────────────────────────────────────────
    useEffect(() => {
        if (mountedRef.current || !containerRef.current || !token) return;
        mountedRef.current = true;

        const cancelled = { value: false };
        cancelledRef.current = false;

        (async () => {
            // 1. Geocode the destination to get a reliable centroid.
            //    This centroid serves two roles:
            //      a) Initial map centre (so the map opens over the right city).
            //      b) Proximity bias for any fallback geocoding of activities
            //         that lack embedded coordinates.
            const dc = await geocodeDestination(destination, token);
            if (cancelled.value || !containerRef.current) return;

            destCentroid.current = dc ?? undefined;

            if (process.env.NODE_ENV === "development") {
                console.log("[LogisticsMap] Destination centroid:", dc, destination);
            }

            setDebugInfo({
                destination,
                lat: dc?.lat,
                lng: dc?.lng,
                markers: 0,
            });

            // 2. Import Mapbox GL JS
            const mod = await import("mapbox-gl");
            if (cancelled.value || !containerRef.current) return;

            const mbox = mod.default;
            mbox.accessToken = token;
            mboxRef.current  = mbox;

            // 3. Create map centred on the destination
            const map = new mbox.Map({
                container:         containerRef.current,
                style:             "mapbox://styles/mapbox/dark-v11",
                center:            dc ? [dc.lng, dc.lat] : [0, 20],
                zoom:              dc ? 11 : 2,
                attributionControl: false,
            });

            mapRef.current = map;
            map.addControl(
                new mbox.NavigationControl({ showCompass: false }),
                "top-right",
            );

            map.on("load", async () => {
                if (cancelled.value) { map.remove(); return; }
                setMapLoaded(true);
                await placeMarkersForDay(activeDay, cancelled);
            });

            map.on("error", (e) => {
                if (process.env.NODE_ENV === "development") {
                    console.error("[LogisticsMap] Mapbox error:", e.error);
                }
            });
        })();

        return () => {
            cancelled.value = true;
            clearMarkers();
            mapRef.current?.remove();
            mapRef.current   = null;
            mboxRef.current  = null;
            mountedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // ── Re-place markers when day changes ────────────────────────────────────
    useEffect(() => {
        if (!mapLoaded) return;
        const cancelled = { value: false };
        placeMarkersForDay(activeDay, cancelled);
        return () => { cancelled.value = true; };
    }, [activeDay, mapLoaded, placeMarkersForDay]);

    // ─── No token ────────────────────────────────────────────────────────────
    if (!token) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.03] rounded-2xl border border-white/[0.06]">
                <p className="text-xs text-slate-500">Mapbox token not configured</p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            {/* Map container */}
            <div
                ref={containerRef}
                className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden"
            />

            {/* Loading overlay */}
            {(!mapLoaded || isLocating) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl z-10 pointer-events-none">
                    <div className="flex flex-col items-center gap-2">
                        <MapPin className="w-5 h-5 text-amber-400 animate-pulse" />
                        <p className="text-[11px] text-slate-400">
                            {!mapLoaded
                                ? "Loading map…"
                                : `Mapping ${destination}…`}
                        </p>
                    </div>
                </div>
            )}

            {/* Dev-only debug panel */}
            {process.env.NODE_ENV === "development" && mapLoaded && debugInfo && (
                <div className="absolute bottom-2 left-2 z-20 bg-black/80 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-[9px] font-mono leading-relaxed pointer-events-none border border-white/10 select-none">
                    <div className="text-amber-400 font-bold mb-0.5">MAP DEBUG</div>
                    <div className="text-white/70">dest: {debugInfo.destination}</div>
                    <div className="text-white/70">
                        lat: {debugInfo.lat?.toFixed(4) ?? "—"} &nbsp;
                        lng: {debugInfo.lng?.toFixed(4) ?? "—"}
                    </div>
                    <div className="text-white/70">
                        day: {activeDay} · markers: {debugInfo.markers}
                    </div>
                </div>
            )}

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-[1] rounded-2xl bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(0,0,0,0.45)_100%)]" />
        </div>
    );
}
