"use client";

/**
 * LogisticsMap.tsx
 *
 * Renders a Mapbox map centered on the actual trip destination,
 * with geocoded activity markers for the selected day.
 *
 * Key guarantees:
 *  - No hardcoded coordinates (Paris or otherwise)
 *  - Destination is geocoded on mount → correct initial center
 *  - Activity markers are geocoded per day and update when activeDay changes
 *  - fitBounds after markers are placed so all stops are visible
 *  - Loading overlay while geocoding is in progress
 *  - Dev-only debug panel (destination, lat/lng, marker count)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type mapboxgl from "mapbox-gl";
import { MapPin } from "lucide-react";
import type { OptimizedDay, HotelOption } from "@/agents/logistics/logisticsAgent";

// ─── Module-level geocoding cache (survives re-renders / HMR) ─────────────────

const GEO_CACHE = new Map<string, { lat: number; lng: number } | null>();

async function geocodeQuery(
    query: string,
    token: string,
): Promise<{ lat: number; lng: number } | null> {
    const key = query.toLowerCase().trim();
    if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;

    try {
        const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
            `${encodeURIComponent(key)}.json?access_token=${token}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) { GEO_CACHE.set(key, null); return null; }

        const data = (await res.json()) as {
            features?: Array<{ center: [number, number] }>;
        };
        const c = data.features?.[0]?.center;
        if (
            !c ||
            !isFinite(c[0]) || !isFinite(c[1]) ||
            (c[0] === 0 && c[1] === 0)
        ) {
            GEO_CACHE.set(key, null);
            return null;
        }

        const coords = { lng: c[0], lat: c[1] };
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
    destination: string;
    days: OptimizedDay[];
    activeDay: number;
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
    // Cancellation token: set to true when cleanup fires so async work stops.
    const cancelledRef  = useRef(false);

    const [mapLoaded,    setMapLoaded]    = useState(false);
    const [isGeocoding,  setIsGeocoding]  = useState(false);
    const [debugInfo, setDebugInfo] = useState<{
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

    // ── Geocode activities for one day and place markers ─────────────────────
    const placeMarkersForDay = useCallback(
        async (dayNum: number, cancelled: { value: boolean }) => {
            const map  = mapRef.current;
            const mbox = mboxRef.current;
            if (!map || !mbox || !token) return;

            clearMarkers();

            const dayData = days.find((d) => d.day === dayNum);
            if (!dayData) return;

            setIsGeocoding(true);

            const points: Array<{
                lat: number;
                lng: number;
                name: string;
                color: string;
            }> = [];

            // Geocode each activity in order
            for (const act of dayData.activities) {
                if (cancelled.value) return;
                const query  = `${act.name}, ${destination}`;
                const coords = await geocodeQuery(query, token);
                if (coords) {
                    points.push({
                        ...coords,
                        name:  act.name,
                        color: MARKER_COLORS[points.length % MARKER_COLORS.length],
                    });
                }
            }

            // Hotel marker (shown on every day for reference)
            if (selectedHotel?.name && !cancelled.value) {
                const hotelCoords = await geocodeQuery(
                    `${selectedHotel.name}, ${destination}`,
                    token,
                );
                if (hotelCoords) {
                    points.push({
                        ...hotelCoords,
                        name:  `🏨 ${selectedHotel.name}`,
                        color: "#a855f7",
                    });
                }
            }

            if (cancelled.value) return;
            setIsGeocoding(false);

            // Dev logging
            if (process.env.NODE_ENV === "development") {
                console.log(
                    `[LogisticsMap] ${destination} · Day ${dayNum} · ${points.length} markers`,
                    points.map((p) => `${p.name}: [${p.lng.toFixed(4)}, ${p.lat.toFixed(4)}]`),
                );
            }

            setDebugInfo((prev) => ({ ...prev!, markers: points.length }));

            if (points.length === 0) return;

            // Place markers
            for (let i = 0; i < points.length; i++) {
                if (cancelled.value) return;
                const pt = points[i];

                // Custom marker element
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
                    el.style.transform   = "scale(1.25)";
                    el.style.boxShadow   = `0 0 0 4px ${pt.color}40,0 4px 12px rgba(0,0,0,0.6)`;
                });
                el.addEventListener("mouseleave", () => {
                    el.style.transform = "scale(1)";
                    el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
                });

                // Popup
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
                        center: [pt.lng, pt.lat],
                        zoom: 14,
                        duration: 900,
                        essential: true,
                    });
                });

                markersRef.current.push(marker);
            }

            // ── Auto-fit bounds so all stops are visible ──────────────────
            if (points.length === 1) {
                map.flyTo({
                    center: [points[0].lng, points[0].lat],
                    zoom: 14,
                    duration: 1000,
                    essential: true,
                });
            } else {
                const bounds = new mbox.LngLatBounds();
                points.forEach((p) => bounds.extend([p.lng, p.lat]));
                map.fitBounds(bounds, {
                    padding: 60,
                    duration: 1000,
                    maxZoom: 14,
                    essential: true,
                });
            }
        },
        [days, destination, selectedHotel, token, clearMarkers],
    );

    // ── Initialise map (once per mount) ──────────────────────────────────────
    useEffect(() => {
        if (mountedRef.current || !containerRef.current || !token) return;
        mountedRef.current = true;

        const cancelled = { value: false };

        (async () => {
            // 1. Geocode destination first → correct initial centre (no Paris!)
            const destCoords = await geocodeQuery(destination, token);
            if (cancelled.value || !containerRef.current) return;

            if (process.env.NODE_ENV === "development") {
                console.log(
                    "[LogisticsMap] Map coords:",
                    destCoords?.lat,
                    destCoords?.lng,
                    destination,
                );
            }

            setDebugInfo({ destination, lat: destCoords?.lat, lng: destCoords?.lng, markers: 0 });

            // 2. Import Mapbox
            const mod = await import("mapbox-gl");
            if (cancelled.value || !containerRef.current) return;

            const mbox = mod.default;
            mbox.accessToken = token;
            mboxRef.current = mbox;

            // 3. Create map centered on actual destination
            const map = new mbox.Map({
                container: containerRef.current,
                style: "mapbox://styles/mapbox/dark-v11",
                // Use geocoded destination coords — NEVER hardcoded Paris!
                center: destCoords ? [destCoords.lng, destCoords.lat] : [0, 20],
                zoom:   destCoords ? 11 : 2,
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
                // Place markers for the initially selected day
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
            mapRef.current  = null;
            mboxRef.current = null;
            mountedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // ── Re-place markers when activeDay or result data changes ───────────────
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

            {/* Loading overlay — shown while map is loading or geocoding */}
            {(!mapLoaded || isGeocoding) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl z-10 pointer-events-none">
                    <div className="flex flex-col items-center gap-2">
                        <MapPin className="w-5 h-5 text-amber-400 animate-pulse" />
                        <p className="text-[11px] text-slate-400">
                            {!mapLoaded
                                ? "Loading map…"
                                : `Locating activities in ${destination}…`}
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
                    <div className="text-white/70">day: {activeDay} · markers: {debugInfo.markers}</div>
                </div>
            )}

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-[1] rounded-2xl bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(0,0,0,0.45)_100%)]" />
        </div>
    );
}
