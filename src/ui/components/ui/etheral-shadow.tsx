"use client";

import React, { useRef, useId, useEffect, CSSProperties } from "react";
import {
    animate,
    useReducedMotion,
    type AnimationPlaybackControls,
} from "framer-motion";

export interface ResponsiveImage {
    src: string;
    alt?: string;
    srcSet?: string;
}

export interface AnimationConfig {
    preview?: boolean;
    scale: number;
    speed: number;
}

export interface NoiseConfig {
    opacity: number;
    scale: number;
}

export interface ShadowOverlayProps {
    type?: "preset" | "custom";
    presetIndex?: number;
    customImage?: ResponsiveImage;
    sizing?: "fill" | "stretch";
    color?: string;
    animation?: AnimationConfig;
    noise?: NoiseConfig;
    style?: CSSProperties;
    className?: string;
    /** Center headline; omit for backdrop-only usage (e.g. marketing hero). */
    title?: string;
    children?: React.ReactNode;
}

function mapRange(
    value: number,
    fromLow: number,
    fromHigh: number,
    toLow: number,
    toHigh: number
): number {
    if (fromLow === fromHigh) {
        return toLow;
    }
    const percentage = (value - fromLow) / (fromHigh - fromLow);
    return toLow + percentage * (toHigh - toLow);
}

const NOISE_DATA_URI =
    "data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

function useInstanceId(): string {
    const id = useId();
    const cleanId = id.replace(/:/g, "");
    return `shadowoverlay-${cleanId}`;
}

export function EtherealShadow({
    sizing = "fill",
    color = "rgba(128, 128, 128, 1)",
    animation,
    noise,
    style,
    className,
    title,
    children,
}: ShadowOverlayProps) {
    const id = useInstanceId();
    const prefersReducedMotion = useReducedMotion();
    const animationEnabled =
        Boolean(animation && animation.scale > 0) && !prefersReducedMotion;
    const feTurbulenceRef = useRef<SVGFETurbulenceElement>(null);
    const feDisplacementRef = useRef<SVGFEDisplacementMapElement>(null);
    const ambientAnimation = useRef<AnimationPlaybackControls | null>(null);

    const displacementScale = animation
        ? mapRange(animation.scale, 1, 100, 20, 100)
        : 0;
    /** Loop length in seconds — higher `speed` prop = faster drift. */
    const loopSeconds = animation
        ? mapRange(animation.speed, 1, 100, 14, 5)
        : 8;

    const baseFreqX = animation
        ? mapRange(animation.scale, 0, 100, 0.001, 0.0005)
        : 0.001;
    const baseFreqY = animation
        ? mapRange(animation.scale, 0, 100, 0.004, 0.002)
        : 0.004;

    useEffect(() => {
        if (!animationEnabled) {
            ambientAnimation.current?.stop();
            return;
        }

        const turb = feTurbulenceRef.current;
        const disp = feDisplacementRef.current;
        if (!turb || !disp) {
            return;
        }

        ambientAnimation.current?.stop();
        ambientAnimation.current = animate(0, 1, {
            duration: loopSeconds,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
            onUpdate: (t: number) => {
                const phase = t * Math.PI * 2;
                const fx =
                    baseFreqX * (1 + 0.22 * Math.sin(phase * 1.3));
                const fy =
                    baseFreqY * (1 + 0.18 * Math.cos(phase * 0.9));
                turb.setAttribute("baseFrequency", `${fx},${fy}`);
                const wobble =
                    displacementScale *
                    (0.88 + 0.12 * Math.sin(phase * 2.1));
                disp.setAttribute("scale", String(wobble));
            },
        });

        return () => {
            ambientAnimation.current?.stop();
        };
    }, [
        animationEnabled,
        baseFreqX,
        baseFreqY,
        displacementScale,
        loopSeconds,
    ]);

    const maskStyle: CSSProperties = {
        backgroundColor: color,
        maskImage:
            "radial-gradient(ellipse 72% 56% at 50% 44%, black 22%, transparent 68%)",
        WebkitMaskImage:
            "radial-gradient(ellipse 72% 56% at 50% 44%, black 22%, transparent 68%)",
        maskSize: sizing === "stretch" ? "100% 100%" : "cover",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskSize: sizing === "stretch" ? "100% 100%" : "cover",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        width: "100%",
        height: "100%",
    };

    const showCenter = children != null || Boolean(title);

    return (
        <div
            className={className}
            style={{
                overflow: "hidden",
                position: "relative",
                width: "100%",
                height: "100%",
                ...style,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: -displacementScale,
                }}
            >
                {animationEnabled && (
                    <svg
                        className="pointer-events-none absolute h-px w-px overflow-visible"
                        style={{ left: 0, top: 0 }}
                        aria-hidden
                    >
                        <defs>
                            <filter id={id} colorInterpolationFilters="sRGB">
                                <feTurbulence
                                    ref={feTurbulenceRef}
                                    result="undulation"
                                    numOctaves={2}
                                    baseFrequency={`${baseFreqX},${baseFreqY}`}
                                    seed={2}
                                    type="fractalNoise"
                                />
                                <feDisplacementMap
                                    ref={feDisplacementRef}
                                    in="SourceGraphic"
                                    in2="undulation"
                                    scale={displacementScale}
                                    xChannelSelector="R"
                                    yChannelSelector="G"
                                />
                            </filter>
                        </defs>
                    </svg>
                )}
                <div
                    style={{
                        ...maskStyle,
                        filter: animationEnabled
                            ? `url(#${id}) blur(4px)`
                            : "none",
                    }}
                />
            </div>

            {showCenter && (
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{ textAlign: "center" }}
                >
                    {children ?? (
                        title ? (
                            <h1 className="relative z-20 text-center text-6xl font-bold text-white md:text-7xl lg:text-8xl">
                                {title}
                            </h1>
                        ) : null
                    )}
                </div>
            )}

            {noise && noise.opacity > 0 && (
                <div
                    className="pointer-events-none absolute inset-0 z-[5]"
                    style={{
                        backgroundImage: `url("${NOISE_DATA_URI}")`,
                        backgroundSize: `${noise.scale * 200}px`,
                        backgroundRepeat: "repeat",
                        opacity: noise.opacity / 2,
                    }}
                />
            )}
        </div>
    );
}

/** @deprecated Prefer `EtherealShadow`; kept for 21st.dev-style imports. */
export const Component = EtherealShadow;
