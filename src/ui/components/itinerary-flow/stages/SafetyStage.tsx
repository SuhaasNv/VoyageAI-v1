"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
    Shield, AlertTriangle, Lightbulb, Clock, MapPin, Star,
    DollarSign, Sparkles, RotateCcw, Loader2,
} from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import type { StageProps, SafeTripContext } from "../types";

interface SafetyStageProps extends StageProps<SafeTripContext> {
    onSave: () => void;
    onRedo: () => void;
    isSaving: boolean;
}

const RISK_STYLE = {
    low: {
        border: "border-emerald-500",
        bg: "bg-emerald-500/[0.06]",
        text: "text-emerald-400",
        pill: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
        label: "Low Risk",
    },
    medium: {
        border: "border-amber-500",
        bg: "bg-amber-500/[0.06]",
        text: "text-amber-400",
        pill: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        label: "Medium Risk",
    },
    high: {
        border: "border-rose-500",
        bg: "bg-rose-500/[0.06]",
        text: "text-rose-400",
        pill: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        label: "High Risk",
    },
};

const SLOT_META: Record<string, { label: string; time: string }> = {
    morning: { label: "Morning", time: "09:00" },
    afternoon: { label: "Afternoon", time: "13:00" },
    evening: { label: "Evening", time: "18:00" },
};

const TYPE_COLORS: Record<string, string> = {
    attraction: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    experience: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    restaurant: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const SCORE_CATEGORIES = [
    { key: "adventure", label: "Adventure", color: "#3b82f6" },
    { key: "culture", label: "Culture", color: "#6366f1" },
    { key: "food", label: "Food", color: "#f59e0b" },
    { key: "relaxation", label: "Relaxation", color: "#10b981" },
    { key: "value", label: "Value", color: "#14b8a6" },
];

function ScoreBar({ label, color, score, delay }: { label: string; color: string; score: number; delay: number }) {
    const prefersReduced = useReducedMotion();
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-500">{Math.round(score)}%</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                        duration: prefersReduced ? 0 : 0.6,
                        delay: prefersReduced ? 0 : delay,
                        ease: "easeOut",
                    }}
                    style={{ width: `${score}%`, transformOrigin: "left", backgroundColor: color }}
                />
            </div>
        </div>
    );
}

export function SafetyStage({
    input,
    result,
    meta,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onSave,
    onRedo,
    isSaving,
}: SafetyStageProps) {
    const prefersReduced = useReducedMotion();

    if (isLoading) {
        return (
            <AgentThinkingCard
                stage="safety"
                onRetry={onRetry}
                skeleton={
                    <div className="space-y-3 animate-pulse">
                        <div className="h-14 bg-white/[0.04] rounded-2xl" />
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 bg-white/[0.04] rounded-2xl" />
                        ))}
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-3 bg-white/[0.04] rounded-full" />
                            ))}
                        </div>
                    </div>
                }
            />
        );
    }
    if (error) return <AgentThinkingCard stage="safety" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    if (!result) return null;

    const { safety, days, destination, durationDays, selectedHotel, budget, preferences } = result;
    const risk = RISK_STYLE[safety.riskLevel];
    const totalCost = budget.totalEstimatedCost;
    const userBudget = preferences?.budget;
    const isOver = budget.isOverBudget;

    const actTypes = days.flatMap((d) => d.activities.map((a) => a.type));
    const attractionPct = (actTypes.filter((t) => t === "attraction").length / Math.max(actTypes.length, 1)) * 100;
    const experiencePct = (actTypes.filter((t) => t === "experience").length / Math.max(actTypes.length, 1)) * 100;
    const restaurantPct = (actTypes.filter((t) => t === "restaurant").length / Math.max(actTypes.length, 1)) * 100;

    const scores = [
        { ...SCORE_CATEGORIES[0], score: Math.min(experiencePct * 1.8, 100) },
        { ...SCORE_CATEGORIES[1], score: Math.min(attractionPct * 1.5, 100) },
        { ...SCORE_CATEGORIES[2], score: Math.min(restaurantPct * 2.5, 100) },
        { ...SCORE_CATEGORIES[3], score: Math.max(100 - experiencePct * 1.2, 25) },
        { ...SCORE_CATEGORIES[4], score: isOver ? 40 : 80 },
    ];

    const topCategory = scores.reduce((a, b) => (a.score > b.score ? a : b));
    const insight = `Your trip is ${Math.round(topCategory.score)}% ${topCategory.label.toLowerCase()}-focused — consider balancing with more variety.`;

    return (
        <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6 pb-28"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-purple-400" />
                    Safety Briefing & Final Review
                </h3>
                <button
                    onClick={onExplain}
                    className="text-xs text-purple-400 hover:text-purple-300 border border-purple-500/20 rounded-full px-2.5 py-0.5 hover:scale-105 active:scale-95 transition-transform duration-200"
                >
                    ? Explain
                </button>
            </div>

            {/* Section 1 — Safety Verdict */}
            <motion.div
                initial={prefersReduced ? {} : { x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0 }}
                className={`rounded-2xl border-l-4 ${risk.border} ${risk.bg} px-4 py-3.5 flex items-center gap-3`}
            >
                <span className={`text-xs font-bold border rounded-full px-2.5 py-0.5 ${risk.pill}`}>
                    {risk.label}
                </span>
                <p className="text-sm text-slate-300 flex-1">
                    Overall risk assessment for {destination}
                </p>
            </motion.div>

            {/* Warnings */}
            {safety.warnings.length > 0 && (
                <motion.div
                    initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-2"
                >
                    {safety.warnings.map((w, i) => (
                        <div key={i} className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-sm text-amber-300">
                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{w}</span>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Tips */}
            {safety.tips.length > 0 && (
                <motion.div
                    initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-2"
                >
                    {safety.tips.map((t, i) => (
                        <div key={i} className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-sm text-emerald-300">
                            <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{t}</span>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Section 2 — Complete Itinerary */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-white tracking-tight">
                    Your Complete Trip · {destination}
                </h3>

                {days.map((day, idx) => {
                    const dayCost = budget.costPerDay?.[idx] ?? Math.round(totalCost / durationDays);
                    const slots = ["morning", "afternoon", "evening"] as const;

                    return (
                        <motion.div
                            key={day.day}
                            initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.15 + idx * 0.08 }}
                            className="card-premium overflow-hidden hover:-translate-y-0.5 transition-all duration-250"
                        >
                            {/* Day header */}
                            <div className="px-4 py-3.5 bg-white/[0.02] border-b border-white/[0.04] flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-sm font-bold text-purple-300">
                                    {day.day}
                                </div>
                                <span className="text-base font-bold text-white flex-1">{day.theme}</span>
                                <span className="text-sm font-semibold text-slate-300">${Math.round(dayCost).toLocaleString()}</span>
                            </div>

                            {/* Time-slot rows */}
                            <div className="divide-y divide-white/[0.03]">
                                {slots.map((slot) => {
                                    const acts = day.activities.filter((a) => a.timeSlot === slot);
                                    if (acts.length === 0) return null;
                                    const slotMeta = SLOT_META[slot];
                                    return (
                                        <div key={slot}>
                                            <p className="section-heading px-4 pt-2.5 pb-1">
                                                {slotMeta.label}
                                            </p>
                                            {acts.map((act, i) => (
                                                <div key={i} className="px-4 py-2 flex items-center gap-2.5">
                                                    <Clock className="text-slate-600 w-3.5 h-3.5 flex-shrink-0" />
                                                    <span className="text-[11px] text-slate-500 w-24 flex-shrink-0">
                                                        {slotMeta.time}
                                                    </span>
                                                    <span className="text-sm text-slate-300 flex-1 truncate">
                                                        {act.name}
                                                    </span>
                                                    <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[act.type] ?? "text-slate-400 bg-white/[0.04] border-white/[0.08]"}`}>
                                                        {act.type}
                                                    </span>
                                                    <span className="text-xs text-slate-500 flex-shrink-0">
                                                        ${act.estimatedCost ?? 20}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Hotel callout */}
                            {selectedHotel && (
                                <div className="px-4 py-2.5 bg-purple-500/[0.04] border-t border-purple-500/15 flex items-center gap-2 text-xs">
                                    <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                    <span className="text-purple-300 font-medium">{selectedHotel.name}</span>
                                    <span className="text-slate-500">{selectedHotel.area}</span>
                                    <span className="text-slate-500">{selectedHotel.priceRange}</span>
                                    {selectedHotel.rating && (
                                        <span className="flex items-center gap-0.5 text-slate-500">
                                            <Star className="w-3 h-3 fill-current" />
                                            {selectedHotel.rating}
                                        </span>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Grand total banner */}
            <div className={`flex items-center justify-between px-5 py-4 rounded-2xl border ${
                isOver ? "bg-rose-500/[0.06] border-rose-500/20" : "bg-emerald-500/[0.06] border-emerald-500/20"
            }`}>
                <div className="flex items-center gap-2">
                    <DollarSign className={`w-5 h-5 ${isOver ? "text-rose-400" : "text-emerald-400"}`} />
                    <span className="text-sm text-slate-300">Grand Total</span>
                </div>
                <div className="text-right">
                    <span className={`text-xl font-bold ${isOver ? "text-rose-400" : "text-emerald-400"}`}>
                        ${Math.round(totalCost).toLocaleString()}
                    </span>
                    {userBudget && (
                        <p className="text-xs text-slate-500">
                            Budget: ${userBudget.toLocaleString()}
                            {isOver && budget.budgetGap && ` (${Math.round(budget.budgetGap)} over)`}
                        </p>
                    )}
                </div>
            </div>

            {/* Section 3 — Trip Score */}
            <div className="card-premium p-5 space-y-4">
                <p className="text-base font-bold text-white">How your trip scores</p>
                <div className="space-y-3">
                    {scores.map((s, idx) => (
                        <ScoreBar
                            key={s.key}
                            label={s.label}
                            color={s.color}
                            score={s.score}
                            delay={0.15 + days.length * 0.08 + 0.1 + idx * 0.12}
                        />
                    ))}
                </div>
                <p className="text-xs text-slate-500 italic">{insight}</p>
            </div>

            {/* Sticky decision gate */}
            <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0A0D12]/95 backdrop-blur-xl border-t border-white/[0.08] px-4 py-4">
                <div className="max-w-2xl mx-auto flex gap-3">
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="btn-approve flex-1 py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60"
                    >
                        {isSaving ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Sparkles className="w-5 h-5" />
                        )}
                        {isSaving ? "Saving..." : "Save My Trip!"}
                    </button>
                    <button
                        onClick={onRedo}
                        className="px-5 py-4 rounded-2xl border border-white/[0.1] bg-white/[0.03] text-slate-300 font-semibold text-sm flex items-center gap-2 hover:bg-white/[0.06] transition-all duration-200"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Refine Plan
                    </button>
                </div>
                <p className="text-center text-[10px] text-slate-600 mt-1 max-w-2xl mx-auto">
                    Saving will create your trip in VoyageAI
                </p>
            </div>
        </motion.div>
    );
}
