"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Navigation, Sparkles } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { LogisticsMap } from "./LogisticsMap";
import type { StageProps, OptimizedTripContext } from "../types";

const DAY_COLORS = [
    "bg-indigo-500", "bg-teal-500", "bg-amber-500", "bg-purple-500",
    "bg-rose-500", "bg-emerald-500", "bg-orange-500",
];

const SLOT_META: Record<string, { emoji: string; label: string; time: string; color: string }> = {
    morning:   { emoji: "\u{1F305}", label: "Morning",   time: "08:00", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    afternoon: { emoji: "\u2600\uFE0F", label: "Afternoon", time: "12:00", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
    evening:   { emoji: "\u{1F306}", label: "Evening",   time: "17:00", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
};

interface LogisticsStageProps extends StageProps<OptimizedTripContext> {
    onReoptimize: (note?: string) => void;
}

export function LogisticsStage({
    result,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onReoptimize,
}: LogisticsStageProps) {
    const prefersReduced = useReducedMotion();
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState("");
    const [activeDay, setActiveDay] = useState(1);

    if (isLoading) {
        return (
            <AgentThinkingCard
                stage="logistics"
                onRetry={onRetry}
                skeleton={
                    <div className="space-y-3 animate-pulse">
                        <div className="h-16 bg-white/[0.04] rounded-2xl" />
                        <div className="grid lg:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-24 bg-white/[0.04] rounded-xl" />
                                ))}
                            </div>
                            <div className="h-60 bg-white/[0.04] rounded-2xl animate-pulse" />
                        </div>
                    </div>
                }
            />
        );
    }
    if (error) return <AgentThinkingCard stage="logistics" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    if (!result) return null;

    const totalActivities = result.days.reduce((s, d) => s + d.activities.length, 0);
    const currentDayData = result.days.find((d) => d.day === activeDay);
    const slots = ["morning", "afternoon", "evening"] as const;

    return (
        <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-amber-400" />
                    Route Optimization
                </h3>
                <button
                    onClick={onExplain}
                    className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/20 rounded-full px-2.5 py-0.5 transition-transform duration-200 hover:scale-105 active:scale-95"
                >
                    ? Explain
                </button>
            </div>

            {/* Snapshot stats card */}
            <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl px-4 py-3 grid grid-cols-4 gap-3">
                {[
                    { label: "Destination", value: result.destination },
                    { label: "Days", value: String(result.durationDays) },
                    { label: "Activities", value: String(totalActivities) },
                    { label: "Hotel", value: result.selectedHotel?.name ?? "—" },
                ].map((stat) => (
                    <div key={stat.label} className="text-center overflow-hidden">
                        <p className="section-heading">{stat.label}</p>
                        <p className="text-sm text-white font-semibold truncate">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Two-column layout */}
            <div className="grid lg:grid-cols-2 gap-5">
                {/* Left — Day Timeline */}
                <div className="space-y-3">
                    {/* Day tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        {result.days.map((day) => (
                            <button
                                key={day.day}
                                onClick={() => setActiveDay(day.day)}
                                className={`flex-shrink-0 rounded-full px-3.5 py-1 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                                    activeDay === day.day
                                        ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                                        : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                Day {day.day}
                            </button>
                        ))}
                    </div>

                    {/* Timeline for active day */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeDay}
                            initial={prefersReduced ? {} : { opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={prefersReduced ? {} : { opacity: 0, x: -12 }}
                            transition={{ duration: 0.2 }}
                            className="card-premium p-4"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${DAY_COLORS[(activeDay - 1) % DAY_COLORS.length]}`}>
                                    {activeDay}
                                </div>
                                <span className="text-sm font-semibold text-white">{currentDayData?.theme}</span>
                            </div>

                            <div className="space-y-3 relative">
                                {/* Vertical timeline line */}
                                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/[0.06]" />

                                {slots.map((slot) => {
                                    const acts = currentDayData?.activities.filter((a) => a.timeSlot === slot) ?? [];
                                    if (acts.length === 0) return null;
                                    const slotInfo = SLOT_META[slot];
                                    return (
                                        <div key={slot} className="relative pl-7">
                                            {/* Slot dot */}
                                            <div className="absolute left-[7px] top-1 w-2.5 h-2.5 rounded-full bg-[#0B0F19] border-2 border-white/[0.15]" />
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${slotInfo.color}`}>
                                                    {slotInfo.emoji} {slotInfo.time} {slotInfo.label}
                                                </span>
                                            </div>
                                            {acts.map((act, i) => (
                                                <div key={i} className="flex items-center gap-2 text-sm text-slate-300 py-0.5">
                                                    <span className="w-1 h-1 rounded-full bg-slate-600 flex-shrink-0" />
                                                    <span className="flex-1 truncate">{act.name}</span>
                                                    {act.estimatedCost !== undefined && (
                                                        <span className="text-xs text-slate-600 flex-shrink-0">~${act.estimatedCost}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Right — Map + stats */}
                <div className="flex flex-col gap-3">
                    <div className="relative w-full h-64 lg:h-full min-h-[240px] rounded-2xl overflow-hidden border border-white/[0.08]">
                        <LogisticsMap
                            destination={result.destination}
                            days={result.days}
                            activeDay={activeDay}
                            selectedHotel={result.selectedHotel}
                        />
                    </div>

                    {/* Route stats */}
                    <div className="card-premium p-4 grid grid-cols-3 gap-3">
                        <div className="text-center transition-transform duration-200 hover:-translate-y-0.5">
                            <p className="section-heading mb-0.5">Activities</p>
                            <p className="text-lg font-bold text-white">{totalActivities}</p>
                        </div>
                        <div className="text-center border-x border-white/[0.06] transition-transform duration-200 hover:-translate-y-0.5">
                            <p className="section-heading mb-0.5">Hotel</p>
                            <p className="text-sm font-bold text-white truncate px-1">{result.selectedHotel?.name ?? "—"}</p>
                        </div>
                        <div className="text-center transition-transform duration-200 hover:-translate-y-0.5">
                            <p className="section-heading mb-0.5">Efficiency</p>
                            <div className="flex items-center justify-center">
                                <svg width="36" height="36" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                                    <motion.circle
                                        cx="18" cy="18" r="14" fill="none"
                                        stroke="#10B981" strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 14}`}
                                        initial={{ strokeDashoffset: 2 * Math.PI * 14 }}
                                        animate={{ strokeDashoffset: 2 * Math.PI * 14 * (1 - 0.82) }}
                                        transition={{ duration: prefersReduced ? 0 : 1, delay: 0.3, ease: "easeOut" }}
                                        transform="rotate(-90 18 18)"
                                    />
                                    <text x="18" y="22" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">82%</text>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Decision gate */}
            <div className="space-y-3 pt-2">
                <button
                    onClick={() => onApprove(result)}
                    className="w-full py-4 rounded-2xl btn-approve text-white flex items-center justify-center gap-2 transition-all duration-200"
                >
                    <Sparkles className="w-4 h-4" />
                    Route is optimized!
                </button>

                <button
                    onClick={() => setNoteOpen((o) => !o)}
                    className="w-full py-3 rounded-2xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 font-semibold text-sm transition-all duration-200"
                >
                    Re-optimize
                </button>

                <AnimatePresence>
                    {noteOpen && (
                        <motion.div
                            initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-2 pt-1">
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Optional: 'Avoid public transport', 'Start early each day'"
                                    rows={2}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-500 outline-none resize-none"
                                />
                                <button
                                    onClick={() => { onReoptimize(note); setNoteOpen(false); setNote(""); }}
                                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-all duration-200"
                                >
                                    Re-run optimization
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
