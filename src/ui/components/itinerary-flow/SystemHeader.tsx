"use client";

/**
 * SystemHeader — Cinematic top bar for the itinerary creation flow.
 *
 * Shows VoyageAI brand, live execution progress bar, destination context,
 * and a pulsing LIVE indicator when an agent is actively running.
 * Children are rendered below the main bar (used for the mobile pipeline).
 */

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { FlowState, FlowStage } from "./types";

interface SystemHeaderProps {
    state: FlowState;
    isLoading: boolean;
    onClose: () => void;
    children?: React.ReactNode;
}

const STAGE_ORDER: Exclude<FlowStage, "saved">[] = [
    "planner", "research", "logistics", "budget", "safety",
];

function computeProgress(state: FlowState, isLoading: boolean): number {
    if (state.stage === "saved") return 100;
    let completed = 0;
    if (state.plannerResult) completed++;
    if (state.researchResult) completed++;
    if (state.logisticsResult) completed++;
    if (state.budgetResult) completed++;
    if (state.safetyResult) completed++;
    const base = completed * 20;
    if (isLoading) return Math.min(base + 9, 95);
    return base === 0 ? 4 : base;
}

function stageLabel(stage: FlowStage, isLoading: boolean): string {
    if (stage === "saved") return "Complete";
    const labels: Record<Exclude<FlowStage, "saved">, string> = {
        planner: "Blueprint",
        research: "Research",
        logistics: "Logistics",
        budget: "Budget",
        safety: "Safety",
    };
    const name = labels[stage];
    return isLoading ? `${name} — Processing` : name;
}

export function SystemHeader({ state, isLoading, onClose, children }: SystemHeaderProps) {
    const progress = computeProgress(state, isLoading);
    const { destination, startDate, endDate } = state.input;

    return (
        <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#080B13]/98 backdrop-blur-2xl relative z-10">
            <div className="flex items-center gap-4 px-5 py-3">
                {/* ── Brand ───────────────────────────────────────────────── */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{
                            background: "linear-gradient(135deg, #6366f1, #a855f7)",
                            boxShadow: "0 0 14px rgba(99,102,241,0.45)",
                        }}
                    >
                        <span className="text-[10px] font-black text-white">V</span>
                    </div>
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/80 hidden sm:block">
                        VoyageAI
                    </span>
                    <span className="hidden sm:block text-white/[0.12] text-xs">|</span>
                </div>

                {/* ── System status bar ────────────────────────────────────── */}
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <motion.span
                            key={stageLabel(state.stage, isLoading)}
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className="text-[9px] font-bold tracking-[0.2em] uppercase text-slate-500 truncate"
                        >
                            System Core &mdash; {stageLabel(state.stage, isLoading)}
                        </motion.span>
                        <motion.span
                            key={progress}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-[9px] font-bold tabular-nums text-indigo-400 flex-shrink-0"
                        >
                            {progress}% Execution
                        </motion.span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-[3px] rounded-full bg-white/[0.05] overflow-hidden relative">
                        <motion.div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                                background: "linear-gradient(90deg, #6366f1, #a855f7, #8b5cf6)",
                            }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 55, damping: 18, mass: 1.2 }}
                        />
                        {/* Shimmer when loading */}
                        <AnimatePresence>
                            {isLoading && (
                                <motion.div
                                    key="shimmer"
                                    className="absolute inset-y-0 rounded-full"
                                    style={{
                                        width: "28%",
                                        background:
                                            "linear-gradient(90deg, transparent, rgba(168,85,247,0.7), transparent)",
                                    }}
                                    initial={{ left: "-30%" }}
                                    animate={{ left: "130%" }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                                    exit={{ opacity: 0 }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ── Right cluster: destination + live + close ────────────── */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Destination badge */}
                    {destination && (
                        <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
                            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px]">
                                {destination}
                            </span>
                            {startDate && endDate && (
                                <span className="text-[9px] text-slate-600 hidden lg:block">
                                    &middot; {startDate} &ndash; {endDate}
                                </span>
                            )}
                        </div>
                    )}

                    {/* LIVE indicator */}
                    <AnimatePresence>
                        {isLoading && (
                            <motion.div
                                key="live"
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10"
                            >
                                <motion.span
                                    className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                                    animate={{ opacity: [1, 0.25, 1] }}
                                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-indigo-400">
                                    Live
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Slot for mobile pipeline header */}
            {children}
        </div>
    );
}
