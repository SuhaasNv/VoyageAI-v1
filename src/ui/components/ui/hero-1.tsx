"use client";

import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HeroOneProps {
    eyebrow?: string;
    title: string;
    subtitle: string;
    ctaLabel?: string;
    ctaHref?: string;
    eyebrowHref?: string;
    /** Light variant (white grid hero). Default matches the dark grid + horizon reference. */
    variant?: "dark" | "light";
}

export function Hero({
    eyebrow = "Innovate Without Limits",
    title,
    subtitle,
    ctaLabel = "Explore Now",
    ctaHref = "#",
    eyebrowHref = "#",
    variant = "dark",
}: HeroOneProps) {
    const isDark = variant === "dark";

    return (
        <section
            id="hero"
            className={cn(
                "relative isolate mx-auto min-h-[calc(100vh-40px)] w-full overflow-hidden rounded-b-xl px-6 pt-40 text-center md:px-8",
                isDark
                    ? "bg-[linear-gradient(to_bottom,#000000_0%,rgba(0,0,0,0)_32%,#5a5e5e_78%,#d4d4d4_96%,#f5f5f5_100%)]"
                    : "bg-[linear-gradient(to_bottom,#fff,#ffffff_50%,#e8e8e8_88%)]"
            )}
        >
            {/* Grid BG */}
            <div
                className={cn(
                    "absolute inset-0 -z-10 h-[min(600px,70vh)] w-full bg-[size:6rem_5rem] opacity-80 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]",
                    isDark
                        ? "bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)]"
                        : "bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)]"
                )}
            />

            {/* Radial horizon accent */}
            <div
                className={cn(
                    "animate-fade-up pointer-events-none absolute left-1/2 top-[calc(100%-90px)] h-[500px] w-[700px] -translate-x-1/2 rounded-[100%] border border-[#B48CDE]/35 md:h-[500px] md:w-[1100px] lg:top-[calc(100%-150px)] lg:h-[750px] lg:w-[140%]",
                    isDark
                        ? "bg-[radial-gradient(closest-side,#000000_78%,#f0f0f0_100%)] shadow-[0_0_120px_rgba(180,140,222,0.15)]"
                        : "border-[#B48CDE] bg-white bg-[radial-gradient(closest-side,#fff_82%,#000000)]"
                )}
            />

            <div className="relative z-10">
                {/* Eyebrow */}
                {eyebrow && (
                    <a href={eyebrowHref} className="group inline-block">
                        <span
                            className={cn(
                                "font-geist mx-auto flex w-fit items-center justify-center rounded-3xl border-[2px] px-5 py-2 text-sm uppercase tracking-tight",
                                isDark
                                    ? "border-white/10 bg-gradient-to-tr from-white/[0.06] via-white/[0.02] to-transparent text-zinc-400"
                                    : "border-gray-300/20 bg-gradient-to-tr from-zinc-300/5 via-gray-400/5 to-transparent text-gray-600"
                            )}
                        >
                            {eyebrow}
                            <ChevronRight className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </span>
                    </a>
                )}

                {/* Title */}
                <h1
                    className={cn(
                        "animate-fade-in -translate-y-4 bg-gradient-to-br bg-clip-text py-6 text-5xl font-semibold leading-none tracking-tighter text-transparent opacity-0 text-balance sm:text-6xl md:text-7xl lg:text-8xl",
                        isDark
                            ? "from-white from-30% to-white/45"
                            : "from-black from-30% to-black/40"
                    )}
                >
                    {title}
                </h1>

                {/* Subtitle */}
                <p
                    className={cn(
                        "animate-fade-in mb-12 -translate-y-4 text-lg tracking-tight text-balance opacity-0 md:text-xl",
                        isDark ? "text-zinc-400" : "text-gray-600"
                    )}
                >
                    {subtitle}
                </p>

                {/* CTA — reference: light pill on dark */}
                {ctaLabel && (
                    <div className="flex justify-center">
                        <Button
                            asChild
                            className={cn(
                                "font-geist z-20 mt-[-20px] h-12 rounded-full px-8 text-center text-lg font-medium tracking-tighter shadow-sm md:min-w-[13rem]",
                                isDark
                                    ? "border-0 bg-zinc-200 text-zinc-950 hover:bg-white"
                                    : "bg-zinc-900 text-zinc-50 hover:bg-zinc-800"
                            )}
                        >
                            <a href={ctaHref}>{ctaLabel}</a>
                        </Button>
                    </div>
                )}
            </div>

            {/* Bottom fade into page background */}
            <div
                className={cn(
                    "animate-fade-up pointer-events-none relative z-[5] mt-32 h-24 opacity-0 [perspective:2000px] after:absolute after:inset-0 after:z-50 after:bg-gradient-to-t after:from-10% after:to-transparent",
                    isDark
                        ? "after:from-[#0b0f19]"
                        : "after:from-[#e8e8e8]"
                )}
            />
        </section>
    );
}
