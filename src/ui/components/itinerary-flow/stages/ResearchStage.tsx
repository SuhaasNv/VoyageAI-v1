"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, RotateCcw, Star, Loader2, Sparkles } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { WhyTooltip } from "../WhyTooltip";
import type { StageProps, EnrichedTripContext } from "../types";
import type { Activity } from "@/agents/research/researchAgent";

const TYPE_COLORS: Record<Activity["type"], string> = {
    attraction: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    experience: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    restaurant: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const PRICE_STARS: Record<string, number> = { $: 1, "$$": 2, "$$$": 3, "$$$$": 4 };

interface ResearchStageProps extends StageProps<EnrichedTripContext> {
    onSubmitFeedback: (feedback: string) => void;
}

export function ResearchStage({
    input,
    result,
    meta,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onSubmitFeedback,
}: ResearchStageProps) {
    const prefersReduced = useReducedMotion();
    const [localResult, setLocalResult] = useState<EnrichedTripContext | null>(result);
    const [activeDay, setActiveDay] = useState(1);
    const [swapHistory, setSwapHistory] = useState<{ dayIdx: number; actIdx: number; prev: Activity; next: Activity }[]>([]);
    const [selectedHotelIdx, setSelectedHotelIdx] = useState(0);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [feedback, setFeedback] = useState("");

    // Sync new result from parent (e.g. after re-research)
    const prevResultRef = useRef<EnrichedTripContext | null>(null);
    if (result !== prevResultRef.current) {
        prevResultRef.current = result;
        if (result) {
            setLocalResult(result);
            setActiveDay(result.days[0]?.day ?? 1);
            setSwapHistory([]);
        }
    }

    if (isLoading) {
        return (
            <AgentThinkingCard
                stage="research"
                onRetry={onRetry}
                skeleton={
                    <div className="space-y-3 animate-pulse">
                        <div className="flex gap-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-8 w-16 bg-white/[0.04] rounded-full" />
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-28 bg-white/[0.04] rounded-xl" />
                            ))}
                        </div>
                    </div>
                }
            />
        );
    }
    if (error) return <AgentThinkingCard stage="research" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    if (!localResult) return null;

    const currentDayData = localResult.days.find((d) => d.day === activeDay);
    const dayIdx = localResult.days.findIndex((d) => d.day === activeDay);
    const selectedActivities = currentDayData?.activities.slice(0, 4) ?? [];
    const alternativeActivities = currentDayData?.activities.slice(4) ?? [];

    function swapActivity(currentDayIdx: number, actIdx: number, altAbsoluteIdx: number) {
        if (!localResult || currentDayIdx < 0) return;
        const dayData = localResult.days[currentDayIdx];
        if (!dayData) return;
        const prev = dayData.activities[actIdx];
        const next = dayData.activities[altAbsoluteIdx];
        if (!prev || !next) return;
        setSwapHistory((h) => [...h.slice(-4), { dayIdx: currentDayIdx, actIdx, prev, next }]);
        setLocalResult((r) => {
            if (!r) return r;
            const days = r.days.map((d, di) => {
                if (di !== currentDayIdx) return d;
                const activities = [...d.activities];
                [activities[actIdx], activities[altAbsoluteIdx]] = [activities[altAbsoluteIdx], activities[actIdx]];
                return { ...d, activities };
            });
            return { ...r, days };
        });
    }

    function removeActivity(currentDayIdx: number, actIdx: number) {
        if (!localResult || currentDayIdx < 0) return;
        setLocalResult((r) => {
            if (!r) return r;
            return {
                ...r,
                days: r.days.map((d, di) =>
                    di === currentDayIdx ? { ...d, activities: d.activities.filter((_, ai) => ai !== actIdx) } : d
                ),
            };
        });
    }

    function undoLastSwap() {
        if (swapHistory.length === 0 || !localResult) return;
        const last = swapHistory[swapHistory.length - 1];
        setSwapHistory((h) => h.slice(0, -1));
        setLocalResult((r) => {
            if (!r) return r;
            const days = r.days.map((d, di) => {
                if (di !== last.dayIdx) return d;
                const activities = [...d.activities];
                const swappedBackIdx = activities.findIndex((a) => a.name === last.next.name);
                if (swappedBackIdx >= 0 && last.actIdx < activities.length) {
                    [activities[last.actIdx], activities[swappedBackIdx]] = [activities[swappedBackIdx], activities[last.actIdx]];
                }
                return { ...d, activities };
            });
            return { ...r, days };
        });
    }

    function handleApprove() {
        if (!localResult) return;
        const updated = {
            ...localResult,
            hotels: [
                localResult.hotels[selectedHotelIdx],
                ...localResult.hotels.filter((_, i) => i !== selectedHotelIdx),
            ],
        };
        onApprove(updated);
    }

    return (
        <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Activity Curation
                </h3>
                <button
                    onClick={onExplain}
                    className="text-xs text-teal-400 hover:text-teal-300 border border-teal-500/20 rounded-full px-2.5 py-0.5 transition-colors"
                >
                    ? Explain
                </button>
            </div>

            {/* Day tab bar */}
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {localResult.days.map((day) => (
                    <button
                        key={day.day}
                        onClick={() => setActiveDay(day.day)}
                        className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                            activeDay === day.day
                                ? "bg-teal-500/15 border border-teal-500/30 text-teal-300"
                                : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300"
                        }`}
                    >
                        Day {day.day}
                    </button>
                ))}
            </div>

            {/* Per-day content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeDay}
                    initial={prefersReduced ? {} : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={prefersReduced ? {} : { opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                >
                    {/* Day theme */}
                    <p className="text-sm text-slate-400">
                        <span className="text-white font-semibold">{currentDayData?.theme}</span>
                    </p>

                    {/* Selected activities — 2x2 grid */}
                    <div>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                            Selected for Day {activeDay}
                        </p>
                        <div className="grid grid-cols-2 gap-2.5">
                            {selectedActivities.map((act, actIdx) => (
                                <div
                                    key={`${activeDay}-selected-${actIdx}`}
                                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 flex flex-col gap-1.5 relative hover:border-white/[0.15] hover:bg-white/[0.06] transition-all"
                                >
                                    <button
                                        onClick={() => removeActivity(dayIdx, actIdx)}
                                        className="absolute top-2 right-2 text-slate-600 hover:text-rose-400 transition-colors"
                                        aria-label="Remove activity"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-sm font-semibold text-white leading-tight pr-5">
                                        {act.name}
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[act.type]}`}>
                                            {act.type}
                                        </span>
                                        {act.estimatedCost !== undefined && (
                                            <span className="text-[11px] text-slate-500">~${act.estimatedCost}</span>
                                        )}
                                    </div>
                                    <WhyTooltip
                                        reason={act.description || "Chosen based on your travel style and day theme."}
                                        confidence={meta?.confidence}
                                        agentColor="teal"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Alternative activities */}
                    {alternativeActivities.length > 0 && (
                        <div>
                            <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                                Swap in an alternative
                            </p>
                            <div className="flex gap-2.5 overflow-x-auto pb-1 hide-scrollbar">
                                {alternativeActivities.map((alt, altRealIdx) => {
                                    const absoluteAltIdx = selectedActivities.length + altRealIdx;
                                    const swapIntoIdx = Math.min(altRealIdx, selectedActivities.length - 1);
                                    const capturedDayIdx = dayIdx;
                                    return (
                                        <button
                                            key={`${activeDay}-alt-${altRealIdx}`}
                                            onClick={() => swapActivity(capturedDayIdx, swapIntoIdx, absoluteAltIdx)}
                                            className="flex-shrink-0 w-40 bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-left opacity-70 hover:opacity-100 hover:border-teal-500/30 cursor-pointer transition-all"
                                        >
                                            <span className="text-sm font-medium text-white truncate block">
                                                {alt.name}
                                            </span>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[alt.type]}`}>
                                                    {alt.type}
                                                </span>
                                                {alt.estimatedCost !== undefined && (
                                                    <span className="text-[10px] text-slate-500">~${alt.estimatedCost}</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Undo strip */}
                    {swapHistory.length > 0 && (
                        <button
                            onClick={undoLastSwap}
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Undo last swap
                        </button>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Divider */}
            <div className="h-px bg-white/[0.06]" />

            {/* Hotel selection */}
            <div className="space-y-3">
                <p className="text-[11px] text-slate-500 uppercase tracking-widest">Choose your stay</p>
                <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                    {localResult.hotels.map((hotel, idx) => {
                        const isSelected = idx === selectedHotelIdx;
                        const stars = PRICE_STARS[hotel.priceRange] ?? 2;
                        return (
                            <button
                                key={idx}
                                onClick={() => setSelectedHotelIdx(idx)}
                                className={`flex-shrink-0 w-52 text-left bg-white/[0.04] border rounded-2xl p-3.5 transition-all ${
                                    isSelected
                                        ? "border-emerald-500/40 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
                                        : "border-white/[0.07] hover:border-white/[0.12]"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <span className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                                        {hotel.name}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400 flex-shrink-0">
                                        {hotel.priceRange}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{hotel.area}</p>
                                <div className="flex items-center gap-1 mb-2">
                                    {Array.from({ length: stars }).map((_, i) => (
                                        <Star
                                            key={i}
                                            className={`w-3 h-3 ${isSelected ? "text-emerald-400" : "text-slate-600"} fill-current`}
                                        />
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {hotel.tags.slice(0, 2).map((tag) => (
                                        <span
                                            key={tag}
                                            className="text-[10px] text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-full px-1.5 py-0.5"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Decision gate */}
            <div className="space-y-3 pt-2">
                <button
                    onClick={handleApprove}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#10B981] to-emerald-400 hover:opacity-90 hover:scale-[1.01] text-white font-bold text-sm transition-all shadow-[0_0_32px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2"
                >
                    <Sparkles className="w-4 h-4" />
                    Love this plan!
                </button>

                <button
                    onClick={() => setAdjustOpen((o) => !o)}
                    className="w-full py-3 rounded-2xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 font-semibold text-sm transition-all"
                >
                    Find different activities
                </button>

                <AnimatePresence>
                    {adjustOpen && (
                        <motion.div
                            initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-2 pt-1">
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="e.g. 'More outdoor activities', 'Skip museums', 'Better hotel area'"
                                    rows={3}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-500 outline-none resize-none"
                                />
                                <button
                                    onClick={() => {
                                        onSubmitFeedback(feedback);
                                        setFeedback("");
                                        setAdjustOpen(false);
                                    }}
                                    disabled={!feedback.trim() || isLoading}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-white/[0.04] disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                                >
                                    {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Re-research
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
