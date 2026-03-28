"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { AGENT_REGISTRY } from "./agentRegistry";
import type { FlowStage, FlowMetadata } from "./types";

const STAGES: Exclude<FlowStage, "saved">[] = [
    "planner",
    "research",
    "logistics",
    "budget",
    "safety",
];

const STAGE_LABELS: Record<Exclude<FlowStage, "saved">, string> = {
    planner: "Plan",
    research: "Research",
    logistics: "Route",
    budget: "Budget",
    safety: "Safety",
};

const STAGE_DESCRIPTIONS: Record<Exclude<FlowStage, "saved">, string> = {
    planner: "Build day-by-day blueprint",
    research: "Find activities & hotels",
    logistics: "Optimize your route",
    budget: "Calculate all costs",
    safety: "Assess risks & finalize",
};

const COLOR_MAP: Record<string, { ring: string; glow: string; text: string; bg: string; bar: string; gradient: string }> = {
    indigo: {
        ring: "rgba(99,102,241,0.7)",
        glow: "0 0 20px rgba(99,102,241,0.45)",
        text: "#818cf8",
        bg: "rgba(99,102,241,0.15)",
        bar: "#6366f1",
        gradient: "from-indigo-500 to-indigo-400",
    },
    teal: {
        ring: "rgba(20,184,166,0.7)",
        glow: "0 0 20px rgba(20,184,166,0.45)",
        text: "#2dd4bf",
        bg: "rgba(20,184,166,0.15)",
        bar: "#14b8a6",
        gradient: "from-teal-500 to-teal-400",
    },
    amber: {
        ring: "rgba(245,158,11,0.7)",
        glow: "0 0 20px rgba(245,158,11,0.45)",
        text: "#fbbf24",
        bg: "rgba(245,158,11,0.15)",
        bar: "#f59e0b",
        gradient: "from-amber-500 to-amber-400",
    },
    green: {
        ring: "rgba(16,185,129,0.7)",
        glow: "0 0 20px rgba(16,185,129,0.45)",
        text: "#34d399",
        bg: "rgba(16,185,129,0.15)",
        bar: "#10b981",
        gradient: "from-emerald-500 to-emerald-400",
    },
    purple: {
        ring: "rgba(168,85,247,0.7)",
        glow: "0 0 20px rgba(168,85,247,0.45)",
        text: "#c084fc",
        bg: "rgba(168,85,247,0.15)",
        bar: "#a855f7",
        gradient: "from-purple-500 to-purple-400",
    },
};

interface AgentPipelineHeaderProps {
    currentStage: FlowStage;
    meta: Partial<Record<FlowStage, FlowMetadata>>;
    iteration: number;
    onExplain?: (stage: Exclude<FlowStage, "saved">) => void;
    layout?: "horizontal" | "vertical";
}

function stageIndex(stage: FlowStage): number {
    if (stage === "saved") return STAGES.length;
    return STAGES.indexOf(stage as Exclude<FlowStage, "saved">);
}

export function AgentPipelineHeader({
    currentStage,
    meta,
    iteration,
    onExplain,
    layout = "horizontal",
}: AgentPipelineHeaderProps) {
    const prefersReduced = useReducedMotion();
    const currentIdx = stageIndex(currentStage);

    const [packetSegment, setPacketSegment] = useState<number | null>(null);
    const prevIdxRef = useRef(currentIdx);

    useEffect(() => {
        if (currentIdx > prevIdxRef.current && !prefersReduced) {
            setPacketSegment(prevIdxRef.current);
            const t = setTimeout(() => setPacketSegment(null), 800);
            prevIdxRef.current = currentIdx;
            return () => clearTimeout(t);
        }
        prevIdxRef.current = currentIdx;
    }, [currentIdx, prefersReduced]);

    // ─── Vertical layout (left sidebar) ──────────────────────────────────
    if (layout === "vertical") {
        return (
            <div className="px-2 py-2 space-y-1">
                {/* Section label */}
                <p className="section-heading px-3 mb-3">Pipeline</p>

                {STAGES.map((stage, idx) => {
                    const agent = AGENT_REGISTRY[stage];
                    const colors = COLOR_MAP[agent.color];
                    const Icon = agent.icon;
                    const isCompleted = idx < currentIdx;
                    const isActive = idx === currentIdx;
                    const isPending = !isCompleted && !isActive;
                    const stageMeta = meta[stage];

                    return (
                        <div key={stage} className="relative">
                            {/* Connector line */}
                            {idx < STAGES.length - 1 && (
                                <div className="absolute left-[22px] top-[44px] bottom-[-4px] w-px">
                                    <div className="w-full h-full bg-white/[0.06]" />
                                    {isCompleted && (
                                        <motion.div
                                            className="absolute inset-0 w-full bg-emerald-500/50"
                                            initial={{ height: "0%" }}
                                            animate={{ height: "100%" }}
                                            transition={prefersReduced ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
                                        />
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => onExplain?.(stage)}
                                disabled={isPending}
                                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-250 group text-left ${
                                    isActive
                                        ? "bg-white/[0.06] border border-white/[0.1]"
                                        : isCompleted
                                        ? "hover:bg-white/[0.04]"
                                        : "opacity-40"
                                }`}
                            >
                                {/* Icon */}
                                <div className="relative flex-shrink-0">
                                    {isActive && !prefersReduced && (
                                        <motion.span
                                            className="absolute inset-[-3px] rounded-xl pointer-events-none"
                                            style={{ boxShadow: `0 0 0 1.5px ${colors.ring}` }}
                                            animate={{ opacity: [0.3, 0.8, 0.3] }}
                                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                    )}
                                    <div
                                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 border"
                                        style={
                                            isActive
                                                ? { background: colors.bg, borderColor: colors.ring, boxShadow: colors.glow }
                                                : isCompleted
                                                ? { background: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.4)" }
                                                : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }
                                        }
                                    >
                                        <Icon
                                            className="w-4 h-4 transition-colors duration-300"
                                            style={{
                                                color: isActive ? colors.text : isCompleted ? "#34d399" : "rgba(148,163,184,0.35)",
                                                filter: isActive ? `drop-shadow(0 0 4px ${colors.ring})` : undefined,
                                            }}
                                        />
                                    </div>

                                    {isCompleted && (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0A0D12] flex items-center justify-center"
                                        >
                                            <Check className="w-2 h-2 text-white" strokeWidth={3} />
                                        </motion.span>
                                    )}
                                </div>

                                {/* Label + description */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-[12px] font-bold transition-colors duration-300"
                                            style={{
                                                color: isActive ? colors.text : isCompleted ? "#34d399" : "rgba(100,116,139,0.6)",
                                            }}
                                        >
                                            {STAGE_LABELS[stage]}
                                        </span>
                                        {stageMeta && (
                                            <span className="text-[10px] text-slate-600">
                                                {(stageMeta.durationMs / 1000).toFixed(1)}s
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-600 leading-tight mt-0.5 truncate">
                                        {STAGE_DESCRIPTIONS[stage]}
                                    </p>
                                </div>

                                {/* Status indicator */}
                                <div className="flex-shrink-0">
                                    {isCompleted && (
                                        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 rounded-full px-1.5 py-0.5">Done</span>
                                    )}
                                    {isActive && !prefersReduced && (
                                        <motion.span
                                            className="w-2 h-2 rounded-full block"
                                            style={{ backgroundColor: colors.bar }}
                                            animate={{ opacity: [1, 0.3, 1] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        />
                                    )}
                                </div>
                            </button>
                        </div>
                    );
                })}

                {/* Iteration badge */}
                {iteration > 1 && (
                    <div className="px-3 pt-3">
                        <span className="text-[10px] font-semibold text-slate-400 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
                            Run #{iteration}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    // ─── Horizontal layout (mobile / top bar fallback) ───────────────────
    return (
        <div className="relative px-5 py-4">
            {/* Desktop pipeline */}
            <div className="hidden sm:flex items-center">
                {STAGES.map((stage, idx) => {
                    const agent = AGENT_REGISTRY[stage];
                    const colors = COLOR_MAP[agent.color];
                    const Icon = agent.icon;
                    const isCompleted = idx < currentIdx;
                    const isActive = idx === currentIdx;
                    const isPending = !isCompleted && !isActive;
                    const stageMeta = meta[stage];

                    return (
                        <div key={stage} className="flex items-center flex-1 last:flex-none min-w-0">
                            <button
                                onClick={() => onExplain?.(stage)}
                                disabled={isPending}
                                title={agent.name}
                                className="relative flex flex-col items-center gap-1.5 flex-shrink-0 group outline-none"
                            >
                                {isActive && !prefersReduced && (
                                    <motion.span
                                        className="absolute inset-[-4px] rounded-full pointer-events-none"
                                        style={{ boxShadow: `0 0 0 2px ${colors.ring}` }}
                                        animate={{ opacity: [0.35, 0.85, 0.35] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                )}

                                <div
                                    className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border"
                                    style={
                                        isActive
                                            ? { background: colors.bg, borderColor: colors.ring, boxShadow: colors.glow }
                                            : isCompleted
                                            ? { background: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.5)" }
                                            : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }
                                    }
                                >
                                    <Icon
                                        className="w-[18px] h-[18px] transition-all duration-300"
                                        style={{
                                            color: isActive ? colors.text : isCompleted ? "#34d399" : "rgba(148,163,184,0.35)",
                                            filter: isActive ? `drop-shadow(0 0 4px ${colors.ring})` : undefined,
                                        }}
                                    />

                                    {isCompleted && (
                                        <motion.span
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0A0D12] flex items-center justify-center"
                                        >
                                            <Check className="w-2 h-2 text-white" strokeWidth={3} />
                                        </motion.span>
                                    )}

                                    {isActive && !prefersReduced && (
                                        <motion.span
                                            className="absolute inset-0 rounded-full pointer-events-none"
                                            style={{ background: colors.bg }}
                                            animate={{ opacity: [0.6, 1, 0.6] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                    )}
                                </div>

                                <span
                                    className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all duration-300"
                                    style={{
                                        color: isActive ? colors.text : isCompleted ? "#34d399" : "rgba(100,116,139,0.6)",
                                    }}
                                >
                                    {STAGE_LABELS[stage]}
                                </span>

                                {stageMeta && (
                                    <span className="text-[8px] text-slate-600 -mt-1">
                                        {(stageMeta.durationMs / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </button>

                            {idx < STAGES.length - 1 && (
                                <div className="flex-1 mx-3 h-px relative overflow-visible" style={{ minWidth: 16 }}>
                                    <div className="absolute inset-0 bg-white/[0.06] rounded-full" />
                                    <motion.div
                                        className="absolute inset-y-0 left-0 rounded-full"
                                        style={{ background: "rgba(16,185,129,0.55)" }}
                                        initial={{ width: "0%" }}
                                        animate={{ width: idx < currentIdx ? "100%" : "0%" }}
                                        transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: "easeOut", delay: 0.1 }}
                                    />
                                    <AnimatePresence>
                                        {packetSegment === idx && (
                                            <motion.span
                                                key="pkt"
                                                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                                                initial={{ left: "0%" }}
                                                animate={{ left: "100%" }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.7, ease: "easeInOut" }}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    );
                })}

                {iteration > 1 && (
                    <div className="ml-4 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-slate-400 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
                            Run #{iteration}
                        </span>
                    </div>
                )}
            </div>

            {/* Mobile: segmented progress bar */}
            <div className="flex sm:hidden items-center gap-1.5">
                {STAGES.map((stage, idx) => {
                    const isCompleted = idx < currentIdx;
                    const isActive = idx === currentIdx;
                    const agent = AGENT_REGISTRY[stage];
                    const colors = COLOR_MAP[agent.color];
                    return (
                        <div key={stage} className="flex-1 relative">
                            <div
                                className="h-1 rounded-full transition-all duration-500"
                                style={{
                                    background: isCompleted
                                        ? "#10b981"
                                        : isActive
                                        ? colors.bar
                                        : "rgba(255,255,255,0.07)",
                                }}
                            />
                            {isActive && !prefersReduced && (
                                <motion.div
                                    className="absolute inset-0 h-1 rounded-full opacity-60"
                                    style={{ background: colors.bar }}
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                            )}
                        </div>
                    );
                })}
                <span className="ml-2 flex-shrink-0 text-[10px] text-slate-500 font-medium">
                    {currentIdx + 1}/{STAGES.length}
                </span>
            </div>
        </div>
    );
}
