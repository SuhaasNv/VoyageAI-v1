"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Navigation, Sparkles, Utensils } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { LogisticsSkeleton } from "../skeletons/StageSkeletons";
import { stageContentVariants, stageContentTransition } from "../transitions";
import { LogisticsMap } from "./LogisticsMap";
import { MealCard } from "./MealCard";
import type { StageProps, OptimizedTripContext } from "../types";
import type { ScheduledActivity } from "@/agents/shared/tripPipelineTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_COLORS = [
    "bg-indigo-500", "bg-teal-500", "bg-amber-500", "bg-purple-500",
    "bg-rose-500", "bg-emerald-500", "bg-orange-500",
];

const SLOT_META: Record<string, { emoji: string; label: string; time: string; color: string }> = {
    morning:   { emoji: "🌅", label: "Morning",   time: "08:00", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    afternoon: { emoji: "☀️",  label: "Afternoon", time: "12:00", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
    evening:   { emoji: "🌆", label: "Evening",   time: "17:00", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogisticsStageProps extends StageProps<OptimizedTripContext> {
    onReoptimize: (note?: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LogisticsStage({
    input,
    result,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onReoptimize,
}: LogisticsStageProps) {
    const prefersReduced = useReducedMotion();
    const [noteOpen,  setNoteOpen]  = useState(false);
    const [note,      setNote]      = useState("");
    const [activeDay, setActiveDay] = useState(1);

    // Food cost comes from the Logistics Agent's pre-computed summary.
    const foodCost = result?.foodCostSummary ?? { perDay: [] as number[], total: 0, avgPerDay: 0 };

    // ── Derived counts ───────────────────────────────────────────────────────
    const totalActivities = result?.days.reduce((s, d) => s + d.activities.length, 0) ?? 0;
    const currentDayData  = result?.days.find((d) => d.day === activeDay);
    const currentDayCost  = foodCost.perDay[(activeDay - 1)] ?? 0;

    // ── Route efficiency (computed, not hardcoded) ───────────────────────────
    const routeEfficiency = (() => {
        if (!result) return 0;
        const allActs = result.days.flatMap((d) => d.activities);
        const nonMeal = allActs.filter((a) => !a.isMeal);
        const ACTIVITY_MS = 120 * 60 * 1000; // assume 2h per activity
        const totalActivityMs = nonMeal.length * ACTIVITY_MS;
        const totalTravelMs   = allActs.reduce((s, a) => s + (a.travelTimeFromPrevMs ?? 0), 0);

        if (totalTravelMs > 0) {
            return Math.min(100, Math.round(totalActivityMs / (totalActivityMs + totalTravelMs) * 100));
        }

        // Fallback when agents don't emit travelTimeFromPrevMs:
        // score from slot spread (≥2 slots/day) + meal coverage
        const days = result.days;
        const slotSpread = days.filter((d) => new Set(d.activities.map((a) => a.timeSlot)).size >= 2).length;
        const mealDays   = days.filter((d) => d.activities.some((a) => a.isMeal)).length;
        const ratio      = days.length > 0
            ? (slotSpread / days.length) * 0.7 + (mealDays / days.length) * 0.3
            : 0.75;
        return Math.min(100, Math.round(ratio * 100));
    })();

    const slots = ["morning", "afternoon", "evening"] as const;

    return (
        <AnimatePresence mode="wait">
            {isLoading ? (
                <motion.div
                    key="loading"
                    variants={stageContentVariants}
                    initial={prefersReduced ? false : "initial"}
                    animate="animate"
                    exit={prefersReduced ? undefined : "exit"}
                    transition={stageContentTransition}
                >
                    <AgentThinkingCard
                        stage="logistics"
                        destination={input.destination}
                        onRetry={onRetry}
                        skeleton={<LogisticsSkeleton />}
                    />
                </motion.div>
            ) : error ? (
                <motion.div
                    key="error"
                    variants={stageContentVariants}
                    initial={prefersReduced ? false : "initial"}
                    animate="animate"
                    exit={prefersReduced ? undefined : "exit"}
                    transition={stageContentTransition}
                >
                    <AgentThinkingCard
                        stage="logistics"
                        isError
                        errorMessage={error ?? undefined}
                        onRetry={onRetry}
                        destination={input.destination}
                    />
                </motion.div>
            ) : result ? (
                <motion.div
                    key="loaded"
                    variants={stageContentVariants}
                    initial={prefersReduced ? false : "initial"}
                    animate="animate"
                    exit={prefersReduced ? undefined : "exit"}
                    transition={stageContentTransition}
                    className="space-y-5"
                >
                    {/* ── Header ──────────────────────────────────────────── */}
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

                    {/* ── Snapshot stats ──────────────────────────────────── */}
                    <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl px-4 py-3 grid grid-cols-4 gap-3">
                        {[
                            { label: "Destination", value: result.destination },
                            { label: "Days",        value: String(result.durationDays) },
                            { label: "Activities",  value: String(totalActivities) },
                            { label: "Food Budget", value: foodCost.total > 0 ? `~$${foodCost.total}` : "—" },
                        ].map((stat) => (
                            <div key={stat.label} className="text-center overflow-hidden">
                                <p className="section-heading">{stat.label}</p>
                                <p className="text-sm text-white font-semibold truncate">{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* ── Two-column layout ───────────────────────────────── */}
                    <div className="grid lg:grid-cols-2 gap-5">

                        {/* Left — Day Timeline */}
                        <div className="space-y-3">
                            {/* Day tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                                {result.days.map((day) => {
                                    const dayCost = foodCost.perDay[day.day - 1] ?? 0;
                                    const hasMeals = day.activities.some((a) => a.isMeal);
                                    return (
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
                                            {hasMeals && dayCost > 0 && (
                                                <span className="ml-1.5 text-[9px] font-bold text-orange-400/80">
                                                    ${dayCost}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
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
                                    {/* Day header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${DAY_COLORS[(activeDay - 1) % DAY_COLORS.length]}`}>
                                                {activeDay}
                                            </div>
                                            <span className="text-sm font-semibold text-white">{currentDayData?.theme}</span>
                                        </div>
                                        {/* Per-day food cost pill */}
                                        {currentDayCost > 0 && (
                                            <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5">
                                                <Utensils className="w-2.5 h-2.5 text-orange-400" />
                                                <span className="text-[11px] font-semibold text-orange-300">
                                                    ~${currentDayCost} food
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Activity + meal timeline */}
                                    <div className="space-y-3 relative">
                                        {/* Vertical timeline spine */}
                                        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/[0.06]" />

                                        {slots.map((slot) => {
                                            const acts = currentDayData?.activities.filter(
                                                (a: ScheduledActivity) => a.timeSlot === slot
                                            ) ?? [];
                                            if (acts.length === 0) return null;
                                            const slotInfo = SLOT_META[slot]!;
                                            return (
                                                <div key={slot} className="relative pl-7">
                                                    {/* Timeline dot */}
                                                    <div className="absolute left-[7px] top-1 w-2.5 h-2.5 rounded-full bg-[#0B0F19] border-2 border-white/[0.15]" />

                                                    {/* Slot label */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${slotInfo.color}`}>
                                                            {slotInfo.emoji} {slotInfo.time} {slotInfo.label}
                                                        </span>
                                                    </div>

                                                    {/* Activities in this slot */}
                                                    <div className="space-y-2">
                                                        {acts.map((act: ScheduledActivity, i: number) => {
                                                            if (act.isMeal && act.mealType) {
                                                                return (
                                                                    <MealCard
                                                                        key={`meal-${activeDay}-${act.mealType}-${i}`}
                                                                        meal={act}
                                                                    />
                                                                );
                                                            }

                                                            // ── Regular Activity Row ─────────────
                                                            return (
                                                                <div
                                                                    key={`act-${i}`}
                                                                    className="flex items-center gap-2 text-sm text-slate-300 py-0.5 group"
                                                                >
                                                                    <span className="w-1 h-1 rounded-full bg-slate-600 flex-shrink-0 group-hover:bg-slate-400 transition-colors" />
                                                                    <span className="flex-1 truncate">{act.name}</span>
                                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                        {act.startTime && (
                                                                            <span className="text-[10px] text-slate-600 font-mono">
                                                                                {act.startTime}
                                                                            </span>
                                                                        )}
                                                                        {act.estimatedCost !== undefined && (
                                                                            <span className="text-xs text-slate-600">
                                                                                ~${act.estimatedCost}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
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

                            {/* Route + food stats */}
                            <div className="card-premium p-4 grid grid-cols-3 gap-3">
                                <div className="text-center transition-transform duration-200 hover:-translate-y-0.5">
                                    <p className="section-heading mb-0.5">Activities</p>
                                    <p className="text-lg font-bold text-white">{totalActivities}</p>
                                </div>
                                <div className="text-center border-x border-white/[0.06] transition-transform duration-200 hover:-translate-y-0.5">
                                    <p className="section-heading mb-0.5">Hotel</p>
                                    <p className="text-sm font-bold text-white truncate px-1">
                                        {result.selectedHotel?.name ?? "—"}
                                    </p>
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
                                                animate={{ strokeDashoffset: 2 * Math.PI * 14 * (1 - routeEfficiency / 100) }}
                                                transition={{ duration: prefersReduced ? 0 : 1, delay: 0.3, ease: "easeOut" }}
                                                transform="rotate(-90 18 18)"
                                            />
                                            <text x="18" y="22" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{routeEfficiency}%</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Food cost breakdown card — only if meals exist */}
                            {foodCost.total > 0 && (
                                <div className="card-premium p-4 space-y-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Utensils className="w-3.5 h-3.5 text-orange-400" />
                                        <p className="text-xs font-semibold text-white">Food Cost Breakdown</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        {result.days.map((day, i) => {
                                            const cost = foodCost.perDay[i] ?? 0;
                                            return (
                                                <div key={day.day} className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">
                                                        Day {day.day}
                                                    </span>
                                                    {/* Bar */}
                                                    <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                                                        <motion.div
                                                            className="h-full bg-orange-400/70 rounded-full"
                                                            initial={{ width: 0 }}
                                                            animate={{
                                                                width: foodCost.total > 0
                                                                    ? `${Math.round((cost / Math.max(...foodCost.perDay)) * 100)}%`
                                                                    : "0%",
                                                            }}
                                                            transition={{ duration: prefersReduced ? 0 : 0.4, delay: i * 0.05 }}
                                                        />
                                                    </div>
                                                    <span className={`text-[11px] font-semibold w-10 text-right flex-shrink-0 ${
                                                        activeDay === day.day ? "text-orange-300" : "text-slate-400"
                                                    }`}>
                                                        {cost > 0 ? `$${cost}` : "—"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                                        <span className="text-[11px] text-slate-500">Trip total</span>
                                        <span className="text-sm font-bold text-white">~${foodCost.total}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-slate-500">Avg per day</span>
                                        <span className="text-[11px] text-slate-400">${foodCost.avgPerDay}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Decision gate ────────────────────────────────────── */}
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
            ) : null}
        </AnimatePresence>
    );
}
