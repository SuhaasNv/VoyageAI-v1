"use client";

import createGlobe from "cobe";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export interface GlobeMarker {
    id: string;
    location: [number, number];
    label: string;
}

export interface GlobeArc {
    id: string;
    from: [number, number];
    to: [number, number];
    label?: string;
}

const DEFAULT_MARKERS: GlobeMarker[] = [];
const DEFAULT_ARCS: GlobeArc[] = [];

export interface GlobeProps {
    markers?: GlobeMarker[];
    arcs?: GlobeArc[];
    className?: string;
    markerColor?: [number, number, number];
    baseColor?: [number, number, number];
    arcColor?: [number, number, number];
    glowColor?: [number, number, number];
    dark?: number;
    mapBrightness?: number;
    markerSize?: number;
    markerElevation?: number;
    arcWidth?: number;
    arcHeight?: number;
    speed?: number;
    theta?: number;
    diffuse?: number;
    mapSamples?: number;
    /** Fixed scale — no scroll / pinch zoom; rotation only */
    scale?: number;
    showHint?: boolean;
}

export function Globe({
    markers = DEFAULT_MARKERS,
    arcs = DEFAULT_ARCS,
    className = "",
    markerColor = [0.3, 0.45, 0.85],
    baseColor = [1, 1, 1],
    arcColor = [0.3, 0.45, 0.85],
    glowColor = [0.94, 0.93, 0.91],
    dark = 0,
    mapBrightness = 10,
    markerSize = 0.025,
    markerElevation = 0.01,
    arcWidth = 0.5,
    arcHeight = 0.25,
    speed = 0.003,
    theta = 0.2,
    diffuse = 1.5,
    mapSamples = 16000,
    scale = 1,
    showHint = true,
}: GlobeProps) {
    const prefersReducedMotion = useReducedMotion();
    /** Must be React state — not a direct node.style tweak — or any parent re-render resets inline opacity: 0 from JSX. */
    const [canvasVisible, setCanvasVisible] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const speedRef = useRef(speed);
    useEffect(() => {
        speedRef.current = prefersReducedMotion ? 0 : speed;
    }, [prefersReducedMotion, speed]);
    const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
    const lastPointer = useRef<{ x: number; y: number; t: number } | null>(null);
    const dragOffset = useRef({ phi: 0, theta: 0 });
    const velocity = useRef({ phi: 0, theta: 0 });
    const phiOffsetRef = useRef(0);
    const thetaOffsetRef = useRef(0);
    const isPausedRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const scaleRef = useRef(scale);
    useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        pointerInteracting.current = { x: e.clientX, y: e.clientY };
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        isPausedRef.current = true;
    }, []);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (pointerInteracting.current !== null) {
            const deltaX = e.clientX - pointerInteracting.current.x;
            const deltaY = e.clientY - pointerInteracting.current.y;
            dragOffset.current = { phi: deltaX / 300, theta: deltaY / 1000 };
            const now = Date.now();
            if (lastPointer.current) {
                const dt = Math.max(now - lastPointer.current.t, 1);
                const maxVelocity = 0.15;
                velocity.current = {
                    phi: Math.max(
                        -maxVelocity,
                        Math.min(maxVelocity, ((e.clientX - lastPointer.current.x) / dt) * 0.3)
                    ),
                    theta: Math.max(
                        -maxVelocity,
                        Math.min(maxVelocity, ((e.clientY - lastPointer.current.y) / dt) * 0.08)
                    ),
                };
            }
            lastPointer.current = { x: e.clientX, y: e.clientY, t: now };
        }
    }, []);

    const handlePointerUp = useCallback(() => {
        if (pointerInteracting.current !== null) {
            phiOffsetRef.current += dragOffset.current.phi;
            thetaOffsetRef.current += dragOffset.current.theta;
            dragOffset.current = { phi: 0, theta: 0 };
            lastPointer.current = null;
        }
        pointerInteracting.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        isPausedRef.current = false;
    }, []);

    useEffect(() => {
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("pointerup", handlePointerUp, { passive: true });
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [handlePointerMove, handlePointerUp]);

    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;

        let globe: ReturnType<typeof createGlobe> | null = null;
        let phi = 0;
        let cancelled = false;
        setCanvasVisible(false);

        function measure(node: HTMLCanvasElement) {
            const w = node.offsetWidth;
            return { width: w, height: w };
        }

        function init(node: HTMLCanvasElement) {
            const { width } = measure(node);
            if (width === 0 || globe || cancelled) return;

            let created: ReturnType<typeof createGlobe>;
            try {
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                created = createGlobe(node, {
                    devicePixelRatio: dpr,
                    width,
                    height: width,
                    phi: 0,
                    theta,
                    dark,
                    diffuse,
                    mapSamples,
                    mapBrightness,
                    baseColor,
                    markerColor,
                    glowColor,
                    markerElevation,
                    scale: scaleRef.current,
                    markers: markers.map((m) => ({
                        location: m.location,
                        size: markerSize,
                        id: m.id,
                    })),
                    arcs: arcs.map((a) => ({
                        from: a.from,
                        to: a.to,
                        id: a.id,
                    })),
                    arcColor,
                    arcWidth,
                    arcHeight,
                    opacity: 0.7,
                });
            } catch {
                return;
            }

            globe = created;

            function frame() {
                if (cancelled || !globe) return;

                if (!isPausedRef.current) {
                    phi += speedRef.current;
                    if (
                        Math.abs(velocity.current.phi) > 0.0001 ||
                        Math.abs(velocity.current.theta) > 0.0001
                    ) {
                        phiOffsetRef.current += velocity.current.phi;
                        thetaOffsetRef.current += velocity.current.theta;
                        velocity.current.phi *= 0.95;
                        velocity.current.theta *= 0.95;
                    }
                    const thetaMin = -0.4;
                    const thetaMax = 0.4;
                    if (thetaOffsetRef.current < thetaMin) {
                        thetaOffsetRef.current += (thetaMin - thetaOffsetRef.current) * 0.1;
                    } else if (thetaOffsetRef.current > thetaMax) {
                        thetaOffsetRef.current += (thetaMax - thetaOffsetRef.current) * 0.1;
                    }
                }

                globe.update({
                    phi: phi + phiOffsetRef.current + dragOffset.current.phi,
                    theta: theta + thetaOffsetRef.current + dragOffset.current.theta,
                    dark,
                    mapBrightness,
                    markerColor,
                    baseColor,
                    arcColor,
                    markerElevation,
                    scale: scaleRef.current,
                    markers: markers.map((m) => ({
                        location: m.location,
                        size: markerSize,
                        id: m.id,
                    })),
                    arcs: arcs.map((a) => ({
                        from: a.from,
                        to: a.to,
                        id: a.id,
                    })),
                });

                rafRef.current = requestAnimationFrame(frame);
            }

            frame();
            requestAnimationFrame(() => {
                if (!cancelled) setCanvasVisible(true);
            });
        }

        if (el.offsetWidth > 0) {
            init(el);
        } else {
            const ro = new ResizeObserver((entries) => {
                if (entries[0]?.contentRect.width > 0) {
                    ro.disconnect();
                    init(el);
                }
            });
            ro.observe(el);
        }

        const onResize = () => {
            if (!globe || cancelled) return;
            const { width } = measure(el);
            if (width <= 0) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            globe.update({
                width,
                height: width,
                devicePixelRatio: dpr,
                scale: scaleRef.current,
            });
        };

        const resizeRo = new ResizeObserver(() => onResize());
        resizeRo.observe(el);

        return () => {
            cancelled = true;
            setCanvasVisible(false);
            resizeRo.disconnect();
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            globe?.destroy();
        };
    }, [
        markers,
        arcs,
        markerColor,
        baseColor,
        arcColor,
        glowColor,
        dark,
        mapBrightness,
        markerSize,
        markerElevation,
        arcWidth,
        arcHeight,
        speed,
        theta,
        diffuse,
        mapSamples,
        scale,
    ]);

    return (
        <div className={`relative aspect-square w-full max-w-full select-none ${className}`}>
            <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                style={{
                    width: "100%",
                    height: "100%",
                    cursor: "grab",
                    opacity: canvasVisible ? 1 : 0,
                    transition: "opacity 1.2s ease",
                    borderRadius: "50%",
                    touchAction: "none",
                }}
            />
            {markers.map((m) => (
                <div
                    key={m.id}
                    className="pointer-events-none whitespace-nowrap uppercase"
                    style={
                        {
                            position: "absolute",
                            positionAnchor: `--cobe-${m.id}`,
                            bottom: "anchor(top)",
                            left: "anchor(center)",
                            translate: "-50% 0",
                            marginBottom: 8,
                            padding: "2px 7px",
                            background: "rgba(12, 12, 22, 0.92)",
                            color: "#f4f4f8",
                            boxShadow: "0 2px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
                            fontFamily: "ui-monospace, monospace",
                            fontSize: "0.6rem",
                            letterSpacing: "0.08em",
                            opacity: `var(--cobe-visible-${m.id}, 0)`,
                            filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 6px))`,
                            transition: "opacity 0.35s ease-out, filter 0.35s ease-out",
                        } as CSSProperties
                    }
                >
                    {m.label}
                    <span
                        className="pointer-events-none"
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translate3d(-50%, -1px, 0)",
                            border: "5px solid transparent",
                            borderTopColor: "rgba(12, 12, 22, 0.92)",
                        }}
                    />
                </div>
            ))}
            {arcs
                .filter((a) => a.label)
                .map((a) => (
                    <div
                        key={a.id}
                        className="pointer-events-none whitespace-nowrap uppercase"
                        style={
                            {
                                position: "absolute",
                                positionAnchor: `--cobe-arc-${a.id}`,
                                bottom: "anchor(top)",
                                left: "anchor(center)",
                                translate: "-50% 0",
                                marginBottom: 8,
                                padding: "2px 7px",
                                background: "rgba(12, 12, 22, 0.92)",
                                color: "#f4f4f8",
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.6rem",
                                letterSpacing: "0.08em",
                                boxShadow: "0 2px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
                                opacity: `var(--cobe-visible-arc-${a.id}, 0)`,
                                filter: `blur(calc((1 - var(--cobe-visible-arc-${a.id}, 0)) * 6px))`,
                                transition: "opacity 0.35s ease-out, filter 0.35s ease-out",
                            } as CSSProperties
                        }
                    >
                        {a.label}
                        <span
                            className="pointer-events-none"
                            style={{
                                position: "absolute",
                                top: "100%",
                                left: "50%",
                                transform: "translate3d(-50%, -1px, 0)",
                                border: "5px solid transparent",
                                borderTopColor: "rgba(12, 12, 22, 0.92)",
                            }}
                        />
                    </div>
                ))}
            {showHint && (
                <div className="absolute bottom-1 left-1 rounded-md bg-black/40 px-2 py-1 text-xs text-slate-500 backdrop-blur-sm md:bottom-4 md:left-4">
                    Drag to rotate
                </div>
            )}
        </div>
    );
}

export default Globe;
