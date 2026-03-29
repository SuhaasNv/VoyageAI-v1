"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
    useScroll,
    useSpring,
    useTransform,
    useMotionValueEvent,
} from "framer-motion";

// Only text overlays use dynamic import — the image container is a plain div
const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

interface ScrollExpandMediaProps {
    mediaType?: "video" | "image";
    mediaSrc: string;
    posterSrc?: string;
    title?: string;
    date?: string;
    scrollToExpand?: string;
    className?: string;
}

export function ScrollExpandMedia({
    mediaType = "image",
    mediaSrc,
    posterSrc,
    title = "AI-Powered Travel Planning",
    date = "Available Now",
    scrollToExpand = "Scroll to explore",
    className = "",
}: ScrollExpandMediaProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // This ref is a plain div — always rendered, no hydration gap
    const mediaWrapRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        // Map progress across the whole time the block crosses the viewport (≈2× scroll
        // vs start/end) so width/scale doesn’t jump through a short range.
        offset: ["start end", "end start"],
    });

    const smoothProgress = useSpring(scrollYProgress, {
        stiffness: 72,
        damping: 28,
        mass: 0.35,
    });

    const clampedProgress = useTransform(smoothProgress, (v) =>
        Math.min(1, Math.max(0, v))
    );

    const scaleX = useTransform(clampedProgress, [0, 1], [0.72, 1]);
    const radiusPx = useTransform(clampedProgress, [0, 0.85], [18, 0]);

    // scaleX avoids layout thrash from animating width (feels much smoother)
    useMotionValueEvent(scaleX, "change", (v) => {
        if (mediaWrapRef.current) {
            mediaWrapRef.current.style.transform = `scaleX(${v})`;
        }
    });
    useMotionValueEvent(radiusPx, "change", (v) => {
        if (mediaWrapRef.current) {
            mediaWrapRef.current.style.borderRadius = `${v}px`;
        }
    });

    // Headline peaks mid-scroll — between the inset “window” and full-bleed — instead of
    // vanishing as soon as scroll starts.
    const titleOpacity = useTransform(
        clampedProgress,
        [0, 0.18, 0.3, 0.45, 0.55, 0.68, 0.84, 1],
        [0.95, 0.62, 0.5, 0.9, 1, 0.72, 0.25, 0]
    );
    const titleY = useTransform(
        clampedProgress,
        [0, 0.25, 0.5, 0.75, 1],
        [10, 6, 0, 5, 14]
    );
    const hintOpacity = useTransform(clampedProgress, [0, 0.12], [1, 0]);
    const overlayOpacity = useTransform(clampedProgress, [0.7, 0.95], [0, 1]);

    return (
        <section
            ref={containerRef}
            className={`relative h-screen bg-[#0A0D12] ${className}`}
        >
            {/* Sticky viewport */}
            <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">

                {/*
                  Plain div — always rendered (SSR + client).
                  scaleX + borderRadius via useMotionValueEvent (GPU-friendly scale).
                */}
                <div
                    ref={mediaWrapRef}
                    className="relative w-full max-w-full overflow-hidden h-[90vh] origin-center will-change-transform"
                    style={{
                        transform: "scaleX(0.72)",
                        transformOrigin: "center center",
                        borderRadius: "18px",
                    }}
                >
                    {mediaType === "video" ? (
                        <video
                            src={mediaSrc}
                            poster={posterSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <Image
                            src={mediaSrc}
                            alt={title}
                            fill
                            sizes="100vw"
                            priority
                            className="object-cover"
                        />
                    )}

                    {/* Gradient scrim for text legibility */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/60 pointer-events-none" />

                    {/* Title overlay */}
                    <MotionDiv
                        style={{ opacity: titleOpacity, y: titleY }}
                        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none select-none"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.12] border border-white/[0.18] backdrop-blur-sm mb-5">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                            <span className="text-xs font-medium text-white/80">{date}</span>
                        </div>
                        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-tight drop-shadow-lg">
                            {title}
                        </h2>
                    </MotionDiv>

                    {/* Scroll hint */}
                    <MotionDiv
                        style={{ opacity: hintOpacity }}
                        className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none select-none"
                    >
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-xs text-white/40 font-medium tracking-wide">{scrollToExpand}</span>
                            <svg
                                className="w-4 h-4 text-white/30 animate-bounce"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </MotionDiv>

                    {/* End-of-scroll caption */}
                    <MotionDiv
                        style={{ opacity: overlayOpacity }}
                        className="absolute bottom-8 left-8 pointer-events-none"
                    >
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                            <span className="text-xs font-medium text-white/80">
                                VoyageAI — Your AI travel companion
                            </span>
                        </div>
                    </MotionDiv>
                </div>
            </div>
        </section>
    );
}
