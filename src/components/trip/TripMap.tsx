"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ItineraryEvent } from "@/lib/services/trips";
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
    focusedActivity?: ItineraryEvent | null;
    eventOrder?: Record<number, string[]>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractPoints(
    raw: Itinerary | null,
    selectedDay?: number,
    eventOrder?: Record<number, string[]>
): MapPoint[] {
    if (!raw?.days) return [];
    const days = selectedDay ? raw.days.filter((d) => d.day === selectedDay) : raw.days;

    const points: MapPoint[] = [];
    for (const day of days) {
        const order = eventOrder?.[day.day];
        const activities = order?.length
            ? [...day.activities].sort((a, b) => {
                const ai = order.indexOf(a.id);
                const bi = order.indexOf(b.id);
                return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
              })
            : day.activities;

        let idx = 0;
        for (const act of activities) {
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
    (parent as HTMLDivElement & { _inner: HTMLDivElement })._inner = inner;

    return parent;
}

function pulseMarker(
    markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
    idx: number
) {
    const markerEl = markersRef.current[idx]?.getElement();
    if (!markerEl) return null;
    const inner = (markerEl as HTMLDivElement & { _inner?: HTMLDivElement })._inner;
    if (!inner) return null;

    inner.style.transition = "transform 0.2s cubic-bezier(0.2,0,0,1), box-shadow 0.2s ease";
    inner.style.transform = "scale(1.5)";
    inner.style.boxShadow = "0 0 0 6px rgba(16,185,129,0.3), 0 0 28px rgba(16,185,129,0.6)";

    return () => {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = idx === 0
            ? "0 0 0 4px rgba(16,185,129,0.25), 0 0 20px rgba(16,185,129,0.4)"
            : "none";
    };
}

// ─── Component ─────────────────────────────────────────────────────────────────

const MAP_STYLES = [
    "mapbox://styles/mapbox/dark-v10",
    "mapbox://styles/mapbox/light-v10",
    "mapbox://styles/mapbox/streets-v10",
] as const;

export function TripMap({ rawItinerary, selectedDay, focusedActivity, eventOrder }: TripMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mboxRef = useRef<typeof mapboxgl | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const mountedRef = useRef(false);
    const animRef = useRef<number | null>(null);
    const cameraTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const idleAnimRef = useRef<number | null>(null);
    const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isProgrammaticNavRef = useRef(false);
    const eventOrderRef = useRef(eventOrder);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    eventOrderRef.current = eventOrder;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    // ─── Draw points + route ─────────────────────────────────────────────────
    const draw = useCallback((map: mapboxgl.Map, mbox: typeof mapboxgl, points: MapPoint[]) => {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

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
                anchor: "bottom",
                focusAfterOpen: false,
                // @ts-expect-error — autoPan is not in mapbox-gl Popup type definitions
                autoPan: false,
            }).setHTML(`
                <div style="pointer-events:none; padding:8px 10px;font-family:ui-sans-serif,system-ui;background:#0E1318;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#10B981;margin-bottom:4px;">Stop ${i + 1}</div>
                    <div style="font-size:13px;font-weight:700;line-height:1.3;">${pt.label}</div>
                </div>
            `);
            const marker = new mbox.Marker({ element: el, anchor: "center" })
                .setLngLat([pt.lng, pt.lat])
                .addTo(map);

            el.addEventListener("mouseenter", () => {
                const inner = (el as HTMLElement & { _inner?: HTMLElement })._inner;
                if (inner) inner.style.transform = "scale(1.2)";
                if (!popup.isOpen()) popup.setLngLat([pt.lng, pt.lat]).addTo(map);
            });
            el.addEventListener("mouseleave", () => {
                const inner = (el as HTMLElement & { _inner?: HTMLElement })._inner;
                if (inner) inner.style.transform = "scale(1)";
                if (popup.isOpen()) popup.remove();
            });

            // Use easeTo to avoid flyTo's parabolic zoom-out which looks wrong at pitch 60
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                if (popup.isOpen()) popup.remove();
                isProgrammaticNavRef.current = true;
                map.easeTo({
                    center: [pt.lng, pt.lat],
                    zoom: 14,
                    pitch: 60,
                    duration: 1200,
                    essential: true,
                });
                const resetNav = setTimeout(() => { isProgrammaticNavRef.current = false; }, 1600);
                const resetPulse = pulseMarker(markersRef, i);
                setTimeout(() => resetPulse?.(), 1400);
                setTimeout(() => clearTimeout(resetNav), 1700);
            });

            markersRef.current.push(marker);
        });

        // Route line
        const coords = points.map((p) => [p.lng, p.lat]);
        map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [coords[0]] } },
        });

        map.addLayer({
            id: "route-glow",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#10B981", "line-width": 8, "line-opacity": 0, "line-blur": 6, "line-opacity-transition": { duration: 1000 } },
        });

        map.addLayer({
            id: "route-main",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#10B981", "line-width": 2, "line-opacity": 0, "line-opacity-transition": { duration: 1000 } },
        });

        setTimeout(() => {
            if (map.getLayer("route-glow")) map.setPaintProperty("route-glow", "line-opacity", 0.18);
            if (map.getLayer("route-main")) map.setPaintProperty("route-main", "line-opacity", 0.8);
        }, 50);

        if (animRef.current) cancelAnimationFrame(animRef.current);
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion || coords.length < 2) {
            (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
                type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords },
            });
        } else {
            const startTime = performance.now();
            const duration = 2000;
            const animateLine = (timestamp: number) => {
                const progress = Math.max(0, Math.min((timestamp - startTime) / duration, 1));
                const easeProgress = 1 - Math.pow(1 - progress, 3);
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
                        p1[1] + (p2[1] - p1[1]) * segmentProgress,
                    ]);
                }
                const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
                if (source) {
                    source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: animatedCoords } });
                }
                if (progress < 1) animRef.current = requestAnimationFrame(animateLine);
            };
            animRef.current = requestAnimationFrame(animateLine);
        }

        if (points.length === 1) {
            map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 14, pitch: 60, duration: 1400, essential: true });
        } else {
            const bounds = points.reduce(
                (b, p) => b.extend([p.lng, p.lat] as mapboxgl.LngLatLike),
                new mbox.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
            );
            map.fitBounds(bounds, { padding: 80, maxZoom: 14, speed: 1.1, essential: true });
        }

        if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
        type MapWithIntro = typeof map & { _introDone?: boolean };
        if (!prefersReducedMotion && !(map as MapWithIntro)._introDone) {
            (map as MapWithIntro)._introDone = true;
            cameraTimeoutRef.current = setTimeout(() => {
                if (!map) return;
                const isMobile = window.innerWidth < 768;
                map.easeTo({
                    pitch: isMobile ? 45 : 60,
                    bearing: 20,
                    duration: 2000,
                    easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
                    essential: true,
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
                if (idx >= MAP_STYLES.length) setLoadError("Map failed to load. Check your token or try again.");
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
                                    maxzoom: 14,
                                });
                            }
                            map.setTerrain({ source: "mapbox-dem", exaggeration: 1.25 });
                        } catch { /* ignore */ }
                    }

                    try {
                        map.setFog({
                            color: "#0b0f1a",
                            "high-color": "#1a2233",
                            "horizon-blend": 0.2,
                            "space-color": "#000000",
                            "star-intensity": 0.15,
                        });
                    } catch { /* ignore */ }

                    draw(map, mbox, extractPoints(rawItinerary, selectedDay, eventOrderRef.current));

                    // Cancel drift only — never touches marker visibility
                    const cancelDrift = () => {
                        if (idleAnimRef.current) cancelAnimationFrame(idleAnimRef.current);
                        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
                    };

                    // Cancel drift AND hide markers — only for real user-initiated interactions
                    const stopIdle = () => {
                        cancelDrift();
                        if (mapRef.current) mapRef.current.getContainer().classList.add("hide-markers");
                    };

                    const startIdle = () => {
                        cancelDrift();
                        if (mapRef.current) mapRef.current.getContainer().classList.remove("hide-markers");
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
                        if (isMobile || prefersReducedMotion || isProgrammaticNavRef.current) return;
                        const currPts = extractPoints(rawItinerary, selectedDay, eventOrderRef.current);
                        if (currPts.length > 1) {
                            const p1 = currPts[0];
                            const p2 = currPts[currPts.length - 1];
                            const targetBearing = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * (180 / Math.PI);
                            const currentBearing = map.getBearing();
                            let diff = targetBearing - currentBearing;
                            while (diff > 180) diff -= 360;
                            while (diff < -180) diff += 360;
                            if (Math.abs(diff) > 5) diff = diff > 0 ? 5 : -5;
                            map.easeTo({ bearing: currentBearing + diff, duration: 2000, easing: (t) => t * (2 - t) });
                        }
                    };

                    // mousedown / touchstart: only cancel drift, never hide markers
                    // (marker click fires click AFTER mousedown — hiding here causes flicker)
                    map.on("mousedown", cancelDrift);
                    map.on("touchstart", cancelDrift);
                    // dragstart / zoomstart (scroll) / pitchstart: real user interaction → hide markers
                    map.on("dragstart", stopIdle);
                    map.on("zoomstart", () => { if (!isProgrammaticNavRef.current) stopIdle(); });
                    map.on("pitchstart", () => { if (!isProgrammaticNavRef.current) stopIdle(); });
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

    // ─── Focus activity from timeline card click ──────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !focusedActivity) return;

        const { lat, lng, title } = focusedActivity;
        const points = extractPoints(rawItinerary, selectedDay, eventOrderRef.current);

        const hasValidCoords =
            typeof lat === "number" && isFinite(lat) && lat !== 0 &&
            typeof lng === "number" && isFinite(lng) && lng !== 0;

        let centerLng = lng ?? 0;
        let centerLat = lat ?? 0;
        let markerIdx = -1;

        if (hasValidCoords) {
            markerIdx = points.findIndex(
                (p) => Math.abs(p.lat - lat!) < 0.0002 && Math.abs(p.lng - lng!) < 0.0002
            );
            if (markerIdx === -1) markerIdx = points.findIndex((p) => p.label === title);
        } else {
            markerIdx = points.findIndex((p) => p.label === title);
            if (markerIdx === -1) return;
            centerLng = points[markerIdx].lng;
            centerLat = points[markerIdx].lat;
        }

        isProgrammaticNavRef.current = true;
        map.easeTo({ center: [centerLng, centerLat], zoom: 14, pitch: 60, duration: 1200, essential: true });

        const navTimer = setTimeout(() => { isProgrammaticNavRef.current = false; }, 1600);

        const resetPulse = markerIdx !== -1 ? pulseMarker(markersRef, markerIdx) : null;
        const resetTimer = setTimeout(() => resetPulse?.(), 1400);

        return () => {
            clearTimeout(resetTimer);
            clearTimeout(navTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedActivity]);

    // ─── Redraw when data / day / order changes ───────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        const mbox = mboxRef.current;
        if (!map || !mbox || !map.isStyleLoaded()) return;
        draw(map, mbox, extractPoints(rawItinerary, selectedDay, eventOrder));
    }, [rawItinerary, selectedDay, eventOrder, draw]);

    // ─── Handle Resize when visibility changes ────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !mapRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setTimeout(() => mapRef.current?.resize(), 50);
                setTimeout(() => mapRef.current?.resize(), 150);
                setTimeout(() => {
                    mapRef.current?.resize();
                    const pts = extractPoints(rawItinerary, selectedDay, eventOrderRef.current);
                    if (pts.length > 0 && mapRef.current && mboxRef.current) {
                        draw(mapRef.current, mboxRef.current, pts);
                    }
                }, 300);
            }
        }, { threshold: 0.1 });

        observer.observe(container);
        return () => observer.disconnect();
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

            <div className="absolute inset-0 pointer-events-none z-[1] bg-[radial-gradient(ellipse_at_center,_transparent_48%,_rgba(0,0,0,0.55)_100%)]" />
            <div className="absolute inset-y-0 left-0 w-20 pointer-events-none z-[2] bg-gradient-to-r from-[#0B0F14]/55 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-10 pointer-events-none z-[2] bg-gradient-to-b from-[#0B0F14]/35 to-transparent" />

            <style dangerouslySetInnerHTML={{
                __html: `
                .hide-markers .mapboxgl-marker {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
                .mapboxgl-marker {
                    transition: opacity 0.3s ease !important;
                }
            `}} />
        </div>
    );
}
