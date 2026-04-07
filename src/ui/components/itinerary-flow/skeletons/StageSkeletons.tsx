"use client";

/**
 * itinerary-flow/skeletons/StageSkeletons.tsx
 *
 * Faithful skeleton placeholders for each pipeline stage.
 * Each skeleton mirrors the final layout shape of its stage
 * so the content swap feels continuous rather than a hard cut.
 *
 * All skeletons rely on the shared `.ai-shimmer` CSS class defined
 * in src/app/globals.css — no bespoke keyframes here. The shimmer
 * animation is automatically suppressed under prefers-reduced-motion
 * by the media query in globals.css.
 */

// Base block — a single shimmering placeholder rectangle.
function Block({
    className = "",
    delay = 0,
}: {
    className?: string;
    delay?: number;
}) {
    return (
        <div
            className={`bg-white/[0.03] border border-white/[0.05] rounded-xl ai-shimmer ${className}`}
            style={{ animationDelay: `${delay}s` }}
        />
    );
}

// ─── Planner ──────────────────────────────────────────────────────────────────

export function PlannerSkeleton({ days = 5 }: { days?: number }) {
    // Clamp so absurd day counts don't blow out the skeleton height.
    const rows = Math.min(Math.max(days, 3), 7);
    return (
        <div className="space-y-6">
            {/* Hero banner */}
            <Block className="h-56 md:h-64 rounded-2xl" />

            {/* Preferences card */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-5 ai-shimmer" style={{ animationDelay: "0.15s" }}>
                <Block className="h-3.5 w-32 rounded-full" delay={0.2} />
                <div>
                    <Block className="h-2.5 w-20 mb-2.5 rounded-full" delay={0.25} />
                    <div className="flex gap-2 flex-wrap">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Block key={i} className="h-8 w-20 rounded-xl" delay={0.25 + i * 0.03} />
                        ))}
                    </div>
                </div>
                <div>
                    <Block className="h-2.5 w-20 mb-2.5 rounded-full" delay={0.4} />
                    <div className="flex gap-2">
                        {[1, 2, 3].map((i) => (
                            <Block key={i} className="flex-1 h-14 rounded-xl" delay={0.4 + i * 0.04} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Day cards */}
            <div className="space-y-2.5">
                {Array.from({ length: rows }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 md:pl-12 flex items-center gap-4 ai-shimmer"
                        style={{ animationDelay: `${0.55 + i * 0.08}s` }}
                    >
                        <Block className="w-11 h-11 rounded-xl flex-shrink-0" delay={0.55 + i * 0.08} />
                        <div className="flex-1 space-y-2">
                            <Block className="h-3 w-1/2 rounded-full" delay={0.6 + i * 0.08} />
                            <Block className="h-2 w-2/3 rounded-full" delay={0.62 + i * 0.08} />
                        </div>
                        <Block className="w-4 h-4 rounded-sm flex-shrink-0" delay={0.6 + i * 0.08} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Research ─────────────────────────────────────────────────────────────────

export function ResearchSkeleton() {
    return (
        <div className="space-y-6">
            {/* Day tabs */}
            <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                    <Block key={i} className="h-8 w-16 rounded-full" delay={i * 0.04} />
                ))}
            </div>

            {/* Theme line */}
            <Block className="h-3 w-40 rounded-full" delay={0.2} />

            {/* Lineup header */}
            <div className="flex items-center gap-2.5">
                <Block className="h-2.5 w-24 rounded-full" delay={0.25} />
                <Block className="h-5 w-20 rounded-full" delay={0.27} />
            </div>

            {/* Activity grid (2×2) */}
            <div className="grid grid-cols-2 gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 min-h-[104px] space-y-2 ai-shimmer"
                        style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                    >
                        <Block className="h-3 w-3/4 rounded-full" delay={0.35 + i * 0.08} />
                        <Block className="h-3 w-1/2 rounded-full" delay={0.38 + i * 0.08} />
                        <div className="flex items-center gap-1.5 pt-1">
                            <Block className="h-4 w-14 rounded-full" delay={0.4 + i * 0.08} />
                            <Block className="h-3 w-8 rounded-full" delay={0.42 + i * 0.08} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Alternatives header + row */}
            <div className="space-y-2.5">
                <Block className="h-2.5 w-24 rounded-full" delay={0.65} />
                <div className="flex gap-2.5 overflow-hidden">
                    {[1, 2, 3, 4].map((i) => (
                        <Block key={i} className="h-28 w-44 rounded-xl flex-shrink-0" delay={0.7 + i * 0.05} />
                    ))}
                </div>
            </div>

            {/* Hotel carousel */}
            <div className="space-y-3">
                <Block className="h-2.5 w-28 rounded-full" delay={0.9} />
                <div className="flex gap-3 overflow-hidden">
                    {[1, 2, 3].map((i) => (
                        <Block key={i} className="h-36 w-52 rounded-2xl flex-shrink-0" delay={0.95 + i * 0.06} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Logistics ────────────────────────────────────────────────────────────────

export function LogisticsSkeleton() {
    return (
        <div className="space-y-5">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <Block className="h-5 w-40 rounded-full" />
                <Block className="h-5 w-16 rounded-full" delay={0.05} />
            </div>

            {/* Stats strip */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3 grid grid-cols-4 gap-3 ai-shimmer" style={{ animationDelay: "0.1s" }}>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="text-center space-y-1.5">
                        <Block className="h-2 w-14 mx-auto rounded-full" delay={0.15 + i * 0.03} />
                        <Block className="h-3 w-10 mx-auto rounded-full" delay={0.17 + i * 0.03} />
                    </div>
                ))}
            </div>

            {/* Two-column: timeline + map */}
            <div className="grid lg:grid-cols-2 gap-5">
                {/* Timeline column */}
                <div className="space-y-3">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Block key={i} className="h-7 w-16 rounded-full" delay={0.3 + i * 0.04} />
                        ))}
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 space-y-3 ai-shimmer" style={{ animationDelay: "0.45s" }}>
                        <Block className="h-3 w-1/2 rounded-full" delay={0.5} />
                        {["morning", "afternoon", "evening"].map((slot, i) => (
                            <div key={slot} className="pl-7 space-y-1.5">
                                <Block className="h-4 w-32 rounded-full" delay={0.55 + i * 0.08} />
                                <Block className="h-2.5 w-3/4 rounded-full" delay={0.58 + i * 0.08} />
                                <Block className="h-2.5 w-1/2 rounded-full" delay={0.6 + i * 0.08} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Map + stats column */}
                <div className="flex flex-col gap-3">
                    <Block className="h-64 lg:h-full min-h-[240px] rounded-2xl" delay={0.35} />
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 grid grid-cols-3 gap-3 ai-shimmer" style={{ animationDelay: "0.7s" }}>
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="space-y-1.5 text-center">
                                <Block className="h-2 w-12 mx-auto rounded-full" delay={0.75 + i * 0.04} />
                                <Block className="h-5 w-9 mx-auto rounded-full" delay={0.78 + i * 0.04} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export function BudgetSkeleton({ days = 5 }: { days?: number }) {
    const rows = Math.min(Math.max(days, 3), 7);
    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Block className="h-5 w-40 rounded-full" />
                <Block className="h-5 w-24 rounded-full" delay={0.05} />
            </div>

            {/* Hero total */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center gap-3 ai-shimmer" style={{ animationDelay: "0.1s" }}>
                <Block className="h-2.5 w-28 rounded-full" delay={0.15} />
                <Block className="h-12 w-56 rounded-xl" delay={0.2} />
                <Block className="h-2.5 w-40 rounded-full" delay={0.25} />
            </div>

            {/* Donut + legend */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 ai-shimmer" style={{ animationDelay: "0.3s" }}>
                <Block className="h-2.5 w-24 mb-4 rounded-full" delay={0.35} />
                <div className="flex items-center gap-6">
                    <div
                        className="w-[160px] h-[160px] rounded-full border-[24px] border-white/[0.05] flex-shrink-0 ai-shimmer"
                        style={{ animationDelay: "0.4s" }}
                    />
                    <div className="space-y-2.5 flex-1">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Block className="w-2.5 h-2.5 rounded-sm" delay={0.45 + i * 0.04} />
                                <div className="flex-1 space-y-1">
                                    <Block className="h-2.5 w-20 rounded-full" delay={0.47 + i * 0.04} />
                                    <Block className="h-2 w-28 rounded-full" delay={0.49 + i * 0.04} />
                                </div>
                                <Block className="h-2.5 w-12 rounded-full" delay={0.5 + i * 0.04} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Per-day rows */}
            <div className="space-y-2">
                <Block className="h-2.5 w-24 rounded-full" delay={0.7} />
                {Array.from({ length: rows }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between ai-shimmer"
                        style={{ animationDelay: `${0.75 + i * 0.06}s` }}
                    >
                        <Block className="h-3 w-1/3 rounded-full" delay={0.8 + i * 0.06} />
                        <Block className="h-3 w-16 rounded-full" delay={0.82 + i * 0.06} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Safety ───────────────────────────────────────────────────────────────────

export function SafetySkeleton({ days = 5 }: { days?: number }) {
    const rows = Math.min(Math.max(days, 3), 7);
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Block className="h-5 w-56 rounded-full" />
                <Block className="h-5 w-16 rounded-full" delay={0.05} />
            </div>

            {/* Risk verdict banner */}
            <div className="rounded-2xl border-l-4 border-white/[0.08] bg-white/[0.02] px-4 py-3.5 flex items-center gap-3 ai-shimmer" style={{ animationDelay: "0.1s" }}>
                <Block className="h-5 w-20 rounded-full" delay={0.15} />
                <Block className="h-3 flex-1 rounded-full" delay={0.18} />
            </div>

            {/* Complete itinerary — day cards */}
            <div className="space-y-4">
                <Block className="h-5 w-64 rounded-full" delay={0.22} />
                {Array.from({ length: rows }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden ai-shimmer"
                        style={{ animationDelay: `${0.25 + i * 0.08}s` }}
                    >
                        <div className="px-4 py-3.5 border-b border-white/[0.04] flex items-center gap-3">
                            <Block className="w-9 h-9 rounded-xl" delay={0.3 + i * 0.08} />
                            <Block className="h-3.5 flex-1 rounded-full" delay={0.32 + i * 0.08} />
                            <Block className="h-3.5 w-14 rounded-full" delay={0.34 + i * 0.08} />
                        </div>
                        <div className="px-4 py-3 space-y-2">
                            <Block className="h-2.5 w-2/3 rounded-full" delay={0.36 + i * 0.08} />
                            <Block className="h-2.5 w-1/2 rounded-full" delay={0.38 + i * 0.08} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Trip score card */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3 ai-shimmer" style={{ animationDelay: "0.85s" }}>
                <Block className="h-3.5 w-44 rounded-full" delay={0.9} />
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Block className="h-2.5 w-20 rounded-full" delay={0.92 + i * 0.05} />
                            <Block className="h-2.5 w-8 rounded-full" delay={0.94 + i * 0.05} />
                        </div>
                        <Block className="h-2 w-full rounded-full" delay={0.95 + i * 0.05} />
                    </div>
                ))}
            </div>
        </div>
    );
}
