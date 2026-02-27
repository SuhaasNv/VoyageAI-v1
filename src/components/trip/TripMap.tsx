"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { Itinerary } from "@/lib/ai/schemas";
import { Map as MapIcon, RefreshCw } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MapPoint {
    lng: number;
    lat: number;
    label: string;
    index: number;
}

interface TripMapProps {
    rawItinerary: Itinerary | null;
    selectedDay?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractPoints(raw: Itinerary | null, selectedDay?: number): MapPoint[] {
    if (!raw?.days) return [];
    const days = selectedDay ? raw.days.filter((d) => d.day === selectedDay) : raw.days;

    const points: MapPoint[] = [];
    let idx = 0;
    for (const day of days) {
        for (const act of day.activities) {
            const lat = act.location?.lat;
            const lng = act.location?.lng;
            if (
                typeof lat === "number" && isFinite(lat) && lat !== 0 &&
                typeof lng === "number" && isFinite(lng) && lng !== 0
            ) {
                points.push({ lat, lng, label: act.name, index: idx });
            }
            idx++;
        }
    }
    return points;
}

function makeMarkerEl(index: number, isFirst: boolean): HTMLDivElement {
    const parent = document.createElement("div");
    // The parent must have dimensions for Mapbox to anchor it, but it stays neutral.
    parent.style.width = "30px";
    parent.style.height = "30px";
    parent.style.cursor = "pointer";

    const inner = document.createElement("div");
    inner.style.cssText = `
        width: 100%; height: 100%; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800;
        font-family: ui-sans-serif, system-ui, sans-serif;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease;
        ${isFirst
            ? "background: #10B981; color: #fff; box-shadow: 0 0 0 4px rgba(16,185,129,0.25), 0 0 20px rgba(16,185,129,0.4);"
            : "background: rgba(255,255,255,0.07); border: 1.5px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.85); backdrop-filter: blur(8px);"
        }
    `;
    inner.textContent = String(index + 1);
    parent.appendChild(inner);

    // We'll return the whole parent, but we need to track the 'inner' for scaling
    // We can store a reference to the inner on the parent to access it during events
    (parent as any)._inner = inner;

    return parent;
}

// ─── Component ─────────────────────────────────────────────────────────────────

// Mapbox v11 styles can fail with CORS/fetch errors; v10 is more reliable
const MAP_STYLES = [
    "mapbox://styles/mapbox/dark-v10",
    "mapbox://styles/mapbox/light-v10",
    "mapbox://styles/mapbox/streets-v10",
] as const;

export function TripMap({ rawItinerary, selectedDay }: TripMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mboxRef = useRef<typeof mapboxgl | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const mountedRef = useRef(false);
    const animRef = useRef<number | null>(null);
    const cameraTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const idleAnimRef = useRef<number | null>(null);
    const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    // ─── Draw points + route ─────────────────────────────────────────────────
    const draw = useCallback((map: mapboxgl.Map, mbox: typeof mapboxgl, points: MapPoint[]) => {
        // Clear markers
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        // Clear layers/source
        for (const id of ["route-glow", "route-dash", "route-main"]) {
            if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource("route")) map.removeSource("route");

        if (points.length === 0) return;

        // Markers
        points.forEach((pt, i) => {
            const el = makeMarkerEl(i, i === 0);
            const popup = new mbox.Popup({
                offset: [0, -10],
                closeButton: false,
                maxWidth: "220px",
                className: "voyage-popup pointer-events-none",
                anchor: 'bottom',
                focusAfterOpen: false,
                // @ts-ignore - autoPan exists in runtime but may be missing in some type definitions
                autoPan: false
            }).setHTML(`
                <div style="pointer-events:none; padding:8px 10px;font-family:ui-sans-serif,system-ui;background:#0E1318;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#10B981;margin-bottom:4px;">Stop ${i + 1}</div>
                    <div style="font-size:13px;font-weight:700;line-height:1.3;">${pt.label}</div>
                </div>
            `);
            const marker = new mbox.Marker({ element: el, anchor: "center" })
                .setLngLat([pt.lng, pt.lat])
                .addTo(map);

            // Hover logic (CSS transform + popup)
            el.addEventListener("mouseenter", () => {
                const inner = (el as any)._inner;
                if (inner) inner.style.transform = "scale(1.2)";
                if (!popup.isOpen()) {
                    popup.setLngLat([pt.lng, pt.lat]).addTo(map);
                }
            });
            el.addEventListener("mouseleave", () => {
                const inner = (el as any)._inner;
                if (inner) inner.style.transform = "scale(1)";
                if (popup.isOpen()) {
                    popup.remove();
                }
            });

            // Click logic (fly to point)
            el.addEventListener("click", () => {
                map.flyTo({
                    center: [pt.lng, pt.lat],
                    zoom: 15,
                    speed: 1.2,
                    essential: true
                });
            });

            markersRef.current.push(marker);
        });

        // Route line source
        const coords = points.map((p) => [p.lng, p.lat]);
        map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [coords[0]] } },
        });

        // Glow layer
        map.addLayer({
            id: "route-glow",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#10B981", "line-width": 8, "line-opacity": 0, "line-blur": 6, "line-opacity-transition": { duration: 1000 } },
        });

        // Main line
        map.addLayer({
            id: "route-main",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#10B981", "line-width": 2, "line-opacity": 0, "line-opacity-transition": { duration: 1000 } },
        });

        // Trigger opacity transition
        setTimeout(() => {
            if (map.getLayer("route-glow")) map.setPaintProperty("route-glow", "line-opacity", 0.18);
            if (map.getLayer("route-main")) map.setPaintProperty("route-main", "line-opacity", 0.8);
        }, 50);

        // Animation setup
        if (animRef.current) cancelAnimationFrame(animRef.current);
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion || coords.length < 2) {
            (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
                type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords }
            });
        } else {
            const startTime = performance.now();
            const duration = 2000;
            const animateLine = (timestamp: number) => {
                const progress = Math.min((timestamp - startTime) / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic

                const totalSegments = coords.length - 1;
                const currentSegmentFloat = easeProgress * totalSegments;
                const currentSegment = Math.floor(currentSegmentFloat);
                const segmentProgress = currentSegmentFloat - currentSegment;

                const animatedCoords = coords.slice(0, currentSegment + 1);

                if (currentSegment < totalSegments) {
                    const p1 = coords[currentSegment];
                    const p2 = coords[currentSegment + 1];
                    animatedCoords.push([
                        p1[0] + (p2[0] - p1[0]) * segmentProgress,
                        p1[1] + (p2[1] - p1[1]) * segmentProgress
                    ]);
                }

                const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
                if (source) {
                    source.setData({
                        type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: animatedCoords }
                    });
                }

                if (progress < 1) {
                    animRef.current = requestAnimationFrame(animateLine);
                }
            };
            animRef.current = requestAnimationFrame(animateLine);
        }

        // Camera
        if (points.length === 1) {
            map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14, speed: 1.1, essential: true });
        } else {
            const bounds = points.reduce(
                (b, p) => b.extend([p.lng, p.lat] as mapboxgl.LngLatLike),
                new mbox.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
            );
            map.fitBounds(bounds, { padding: 80, maxZoom: 14, speed: 1.1, essential: true });
        }

        // Apply cinematic 3D camera after route loads
        if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
        if (!prefersReducedMotion && !(map as any)._introDone) {
            (map as any)._introDone = true;
            cameraTimeoutRef.current = setTimeout(() => {
                if (!map) return;
                const isMobile = window.innerWidth < 768;
                map.easeTo({
                    pitch: isMobile ? 45 : 60,
                    bearing: 20,
                    duration: 2000,
                    easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t, // easeInOutQuad
                    essential: true
                });
            }, 800);
        }
    }, []);

    // ─── Init map ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (mountedRef.current || !containerRef.current || !token) return;
        mountedRef.current = true;
        setLoadError(null);

        let cancelled = false;
        let currentMap: mapboxgl.Map | null = null;

        const tryStyle = (idx: number) => {
            if (cancelled || !containerRef.current || idx >= MAP_STYLES.length) {
                if (idx >= MAP_STYLES.length) {
                    setLoadError("Map failed to load. Check your token or try again.");
                }
                return;
            }

            import("mapbox-gl").then((mod) => {
                if (cancelled || !containerRef.current) return;

                const mbox = mod.default;
                mbox.accessToken = token;
                mboxRef.current = mbox;

                const map = new mbox.Map({
                    container: containerRef.current,
                    style: MAP_STYLES[idx],
                    zoom: 2,
                    center: [0, 20],
                    attributionControl: false,
                    logoPosition: "bottom-left",
                    pitchWithRotate: true,
                    dragRotate: true,
                    touchZoomRotate: true,
                    touchPitch: true,
                    scrollZoom: true,
                    boxZoom: false,
                    keyboard: true,
                });
                currentMap = map;

                map.on("error", (e) => {
                    if (cancelled) return;
                    const err = e.error;
                    if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Could not load style")) {
                        currentMap?.remove();
                        currentMap = null;
                        tryStyle(idx + 1);
                    }
                });

                map.on("load", () => {
                    if (cancelled) { map.remove(); return; }
                    mapRef.current = map;

                    const isMobile = window.innerWidth < 768;
                    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

                    if (!isMobile && !prefersReducedMotion) {
                        try {
                            if (!map.getSource("mapbox-dem")) {
                                map.addSource("mapbox-dem", {
                                    type: "raster-dem",
                                    url: "mapbox://mapbox.terrain-rgb",
                                    tileSize: 512,
                                    maxzoom: 14
                                });
                            }
                            map.setTerrain({ source: "mapbox-dem", exaggeration: 1.25 });
                        } catch (e) { /* ignore */ }
                    }

                    try {
                        map.setFog({
                            color: "#0b0f1a",
                            "high-color": "#1a2233",
                            "horizon-blend": 0.2,
                            "space-color": "#000000",
                            "star-intensity": 0.15
                        });
                    } catch (e) { /* ignore */ }

                    const pts = extractPoints(rawItinerary, selectedDay);
                    draw(map, mbox, pts);

                    const stopIdle = () => {
                        if (idleAnimRef.current) cancelAnimationFrame(idleAnimRef.current);
                        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
                    };

                    const startIdle = () => {
                        stopIdle();
                        if (isMobile || prefersReducedMotion) return;
                        idleTimeoutRef.current = setTimeout(() => {
                            const drift = () => {
                                if (!mapRef.current) return;
                                mapRef.current.setBearing(mapRef.current.getBearing() + 0.05);
                                idleAnimRef.current = requestAnimationFrame(drift);
                            };
                            idleAnimRef.current = requestAnimationFrame(drift);
                        }, 6000);
                    };

                    const handleInteractionEnd = () => {
                        startIdle();
                        if (isMobile || prefersReducedMotion) return;
                        const currPts = extractPoints(rawItinerary, selectedDay);
                        if (currPts.length > 1) {
                            const p1 = currPts[0];
                            const p2 = currPts[currPts.length - 1];
                            const dy = p2.lat - p1.lat;
                            const dx = p2.lng - p1.lng;
                            const targetBearing = Math.atan2(dx, dy) * (180 / Math.PI);
                            const currentBearing = map.getBearing();
                            let diff = targetBearing - currentBearing;
                            while (diff > 180) diff -= 360;
                            while (diff < -180) diff += 360;
                            if (Math.abs(diff) > 5) diff = diff > 0 ? 5 : -5;

                            map.easeTo({
                                bearing: currentBearing + diff,
                                duration: 2000,
                                easing: (t) => t * (2 - t)
                            });
                        }
                    };

                    map.on("mousedown", stopIdle);
                    map.on("touchstart", stopIdle);
                    map.on("dragstart", stopIdle);
                    map.on("zoomstart", stopIdle);
                    map.on("pitchstart", stopIdle);
                    map.on("wheel", () => { stopIdle(); startIdle(); });

                    map.on("dragend", handleInteractionEnd);
                    map.on("zoomend", handleInteractionEnd);
                    map.on("pitchend", handleInteractionEnd);

                    startIdle();
                });

                map.addControl(new mbox.NavigationControl({ showCompass: false }), "top-right");
                const isMobile = window.innerWidth < 768;
                map.setMaxPitch(isMobile ? 60 : 75);
                map.touchZoomRotate.enable();
                map.touchZoomRotate.enableRotation();
                map.dragRotate.enable();
            });
        };

        tryStyle(0);

        return () => {
            cancelled = true;
            if (animRef.current) cancelAnimationFrame(animRef.current);
            if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
            if (idleAnimRef.current) cancelAnimationFrame(idleAnimRef.current);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
            mountedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, retryCount]);

    // ─── Handle Resize when visibility changes (Mobile Toggle) ────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !mapRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // Force multiple resizes to handle animation frames
                setTimeout(() => mapRef.current?.resize(), 50);
                setTimeout(() => mapRef.current?.resize(), 150);
                setTimeout(() => {
                    mapRef.current?.resize();
                    const pts = extractPoints(rawItinerary, selectedDay);
                    if (pts.length > 0 && mapRef.current && mboxRef.current) {
                        draw(mapRef.current, mboxRef.current, pts);
                    }
                }, 300);
            }
        }, { threshold: 0.1 });

        observer.observe(container);
        return () => observer.disconnect();
    }, [rawItinerary, selectedDay, draw]);

    // ─── Redraw on data / day change ─────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        const mbox = mboxRef.current;
        if (!map || !mbox || !map.isStyleLoaded()) return;
        draw(map, mbox, extractPoints(rawItinerary, selectedDay));
    }, [rawItinerary, selectedDay, draw]);

    // ─── Missing token ───────────────────────────────────────────────────────
    if (!token) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-950">
                <MapIcon className="w-8 h-8 text-zinc-600" />
                <p className="text-sm font-medium text-zinc-500">NEXT_PUBLIC_MAPBOX_TOKEN is not configured</p>
            </div>
        );
    }

    const hasCoords = rawItinerary && extractPoints(rawItinerary, selectedDay).length > 0;

    return (
        <div className="relative w-full h-full">
            <div ref={containerRef} className="absolute inset-0 w-full h-full" />

            {/* Map load error overlay */}
            {loadError && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                    <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-6 flex flex-col items-center gap-4 text-center max-w-sm shadow-2xl">
                        <MapIcon className="w-10 h-10 text-amber-500/80" />
                        <div>
                            <p className="text-sm font-semibold text-white">{loadError}</p>
                            <p className="text-xs text-zinc-400 mt-1">
                                Ensure NEXT_PUBLIC_MAPBOX_TOKEN is valid and allows your domain.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setRetryCount((c) => c + 1)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* No-coords overlay */}
            {rawItinerary && !hasCoords && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-5 flex flex-col items-center gap-2 text-center max-w-xs shadow-2xl">
                        <MapIcon className="w-6 h-6 text-zinc-400" />
                        <p className="text-sm font-semibold text-white">No map coordinates</p>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            The AI did not return lat/lng for these activities. Try regenerating the itinerary.
                        </p>
                    </div>
                </div>
            )}

            {/* Vignette overlay */}
            <div className="absolute inset-0 pointer-events-none z-[1] bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(0,0,0,0.6)_100%)]" />
        </div>
    );
}
