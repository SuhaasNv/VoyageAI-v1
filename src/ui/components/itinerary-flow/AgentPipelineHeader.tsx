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
    imageUrl?: string | null;
    destination?: string;
}

function stageIndex(stage: FlowStage): number {
    if (stage === "saved") return STAGES.length;
    return STAGES.indexOf(stage as Exclude<FlowStage, "saved">);
}

/** Staggered list entrance — disabled when reduced motion */
const pipelineListVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.055, delayChildren: 0.04 },
    },
} as const;

const pipelineRowVariants = {
    hidden: { opacity: 0, x: -10 },
    show: {
        opacity: 1,
        x: 0,
        transition: { type: "spring", stiffness: 380, damping: 28 },
    },
} as const;

export function AgentPipelineHeader({
    currentStage,
    meta,
    iteration,
    onExplain,
    layout = "horizontal",
    imageUrl,
    destination
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
                <div className="absolute inset-x-0 top-0 h-48 overflow-hidden pointer-events-none opacity-20">
                    {imageUrl ? (
                        <img src={imageUrl} alt={destination ?? ""} className="w-full h-full object-cover blur-2xl scale-110" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-b from-indigo-500/20 to-transparent" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0B0F19]" />
                </div>

                <motion.div
                    className="flex items-center justify-between px-3 mb-3 relative z-10"
                    initial={prefersReduced ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                    <p className="section-heading">Pipeline</p>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                        <span className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">Live</span>
                    </div>
                </motion.div>

                <motion.div
                    className="space-y-1"
                    variants={prefersReduced ? undefined : pipelineListVariants}
                    initial={prefersReduced ? false : "hidden"}
                    animate={prefersReduced ? { opacity: 1 } : "show"}
                >
                    {STAGES.map((stage, idx) => {
                        const agent = AGENT_REGISTRY[stage];
                        const colors = COLOR_MAP[agent.color];
                        const Icon = agent.icon;
                        const isCompleted = idx < currentIdx;
                        const isActive = idx === currentIdx;
                        const isPending = !isCompleted && !isActive;
                        const stageMeta = meta[stage];
                        const showPacketOnConnector = packetSegment === idx && !prefersReduced;
                        // Connector gradient: current agent color → next agent color
                        // Icon center x = px-3 (12px) + w-9/2 (18px) = 30px from wrapper left.
                        // Connector left-[29px] + w-[2px] → center at 30px. ✓
                        const connectorFrom = colors.bar;
                        const connectorTo = idx < STAGES.length - 1
                            ? COLOR_MAP[AGENT_REGISTRY[STAGES[idx + 1]].color].bar
                            : colors.bar;

                        return (
                            <motion.div
                                key={stage}
                                className="relative"
                                variants={prefersReduced ? undefined : pipelineRowVariants}
                            >
                                {/* Connector spine — centered on icon (32px), w-[3px] */}
                                {idx < STAGES.length - 1 && (
                                    <div className="absolute left-[30px] top-[48px] bottom-[-8px] w-[3px] overflow-visible z-0">
                                        {/* Base line (unfilled) */}
                                        <div className="w-full h-full bg-white/[0.05] rounded-full" />
                                        {/* Progress fill: gradient from current → next agent color */}
                                        {isCompleted && (
                                            <motion.div
                                                className="absolute inset-x-0 top-0 w-full rounded-full"
                                                style={{
                                                    background: `linear-gradient(to bottom, ${connectorFrom}, ${connectorTo})`,
                                                    boxShadow: `0 0 12px ${connectorTo}a0`,
                                                }}
                                                initial={{ height: "0%" }}
                                                animate={{ height: "100%" }}
                                                transition={
                                                    prefersReduced
                                                        ? { duration: 0 }
                                                        : { type: "spring", stiffness: 120, damping: 22, mass: 0.8 }
                                                }
                                            />
                                        )}
                                        {/* Traveling pulse — matches connector gradient endpoint */}
                                        <AnimatePresence>
                                            {showPacketOnConnector && (
                                                <motion.span
                                                    key="v-packet"
                                                    className="absolute left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full"
                                                    style={{
                                                        backgroundColor: connectorTo,
                                                        boxShadow: `0 0 16px ${connectorTo}f0`,
                                                    }}
                                                    initial={{ top: "0%", opacity: 1 }}
                                                    animate={{ top: "100%", opacity: [1, 1, 0.6] }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ duration: 0.75, ease: [0.22, 0.61, 0.36, 1] }}
                                                />
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <motion.button
                                    layout={!prefersReduced}
                                    onClick={() => onExplain?.(stage)}
                                    disabled={isPending}
                                    whileHover={
                                        prefersReduced || isPending
                                            ? undefined
                                            : { scale: 1.02, backgroundColor: "rgba(255,255,255,0.06)" }
                                    }
                                    whileTap={prefersReduced || isPending ? undefined : { scale: 0.985 }}
                                    transition={{ layout: { type: "spring", stiffness: 400, damping: 34 } }}
                                    className={`relative z-10 w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all duration-300 ${
                                        isActive
                                            ? "bg-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.2)] border border-white/[0.15] backdrop-blur-md"
                                            : isCompleted
                                            ? "hover:bg-white/[0.04] border border-transparent"
                                            : "opacity-[0.42] border border-transparent"
                                    }`}
                                >
                                    {/* Active: subtle radial gradient behind the card */}
                                    {isActive && !prefersReduced && (
                                        <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-50" style={{
                                            background: `radial-gradient(120% 120% at 0% 50%, ${colors.bg}, transparent)`
                                        }} />
                                    )}

                                    {/* Active: soft shimmer sweep */}
                                    {isActive && !prefersReduced && (
                                        <motion.span
                                            className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.12]"
                                            style={{
                                                background:
                                                    "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)",
                                                backgroundSize: "200% 100%",
                                            }}
                                            animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                                            transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 0.6 }}
                                        />
                                    )}

                                    {/* Icon */}
                                    <div className="relative flex-shrink-0 z-[1]">
                                        {isActive && !prefersReduced && (
                                            <>
                                                <motion.span
                                                    className="absolute inset-[-4px] rounded-2xl pointer-events-none"
                                                    style={{ boxShadow: `0 0 0 1.5px ${colors.ring}` }}
                                                    animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.02, 1] }}
                                                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                                                />
                                                <motion.span
                                                    className="absolute inset-[-8px] rounded-[18px] pointer-events-none border border-white/[0.08]"
                                                    animate={{ opacity: [0.15, 0.45, 0.15] }}
                                                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                                                />
                                            </>
                                        )}
                                        <motion.div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center border relative shadow-lg"
                                            style={
                                                isActive
                                                    ? { background: colors.bg, borderColor: colors.ring, boxShadow: colors.glow }
                                                    : isCompleted
                                                    ? { background: "rgba(16,185,129,0.15)", borderColor: "rgba(16,185,129,0.3)" }
                                                    : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }
                                            }
                                            animate={
                                                isActive && !prefersReduced
                                                    ? { scale: [1, 1.04, 1] }
                                                    : { scale: 1 }
                                            }
                                            transition={
                                                isActive && !prefersReduced
                                                    ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                                                    : { duration: 0.2 }
                                            }
                                        >
                                            <Icon
                                                className="w-5 h-5 transition-colors duration-300"
                                                style={{
                                                    color: isActive ? colors.text : isCompleted ? "#34d399" : "rgba(148,163,184,0.35)",
                                                    filter: isActive ? `drop-shadow(0 0 4px ${colors.ring})` : undefined,
                                                }}
                                            />
                                        </motion.div>

                                        {isCompleted && (
                                            <motion.span
                                                initial={{ scale: 0, rotate: -45 }}
                                                animate={{ scale: 1, rotate: 0 }}
                                                transition={{ type: "spring", stiffness: 520, damping: 22 }}
                                                className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-emerald-500 border-2 border-[#0B0F19] flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                                            >
                                                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                            </motion.span>
                                        )}
                                    </div>

                                    {/* Label + description */}
                                    <div className="flex-1 min-w-0 z-[1] pr-1">
                                        <div className="flex items-center justify-between">
                                            <motion.span
                                                className={`font-bold tracking-wide ${isActive ? 'text-sm' : 'text-[13px]'}`}
                                                style={{
                                                    color: isActive ? colors.text : isCompleted ? "#fff" : "rgba(255,255,255,0.4)",
                                                }}
                                                animate={
                                                    isActive && !prefersReduced
                                                        ? { opacity: [0.92, 1, 0.92] }
                                                        : { opacity: 1 }
                                                }
                                                transition={{ duration: 2, repeat: isActive && !prefersReduced ? Infinity : 0, ease: "easeInOut" }}
                                            >
                                                {STAGE_LABELS[stage]}
                                            </motion.span>

                                            {/* Status indicator / Time (right side) */}
                                            <div className="flex items-center gap-2">
                                                {isCompleted ? (
                                                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 rounded-full px-1.5 py-0.5 border border-emerald-400/20">
                                                        Done
                                                    </span>
                                                ) : isActive && !prefersReduced ? (
                                                    <motion.span
                                                        className="w-2 h-2 rounded-full block"
                                                        style={{
                                                            backgroundColor: colors.bar,
                                                            boxShadow: `0 0 8px ${colors.bar}`,
                                                        }}
                                                        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.45, 1] }}
                                                        transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
                                                    />
                                                ) : null}

                                                {stageMeta && (
                                                    <span className={`text-[10px] tabular-nums font-mono ${isActive ? 'text-white/60' : 'text-white/30'}`}>
                                                        {(stageMeta.durationMs / 1000).toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className={`text-[11px] leading-tight mt-0.5 truncate transition-colors duration-300 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                            {STAGE_DESCRIPTIONS[stage]}
                                        </p>
                                    </div>
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Iteration badge */}
                <AnimatePresence>
                    {iteration > 1 && (
                        <motion.div
                            className="px-3 pt-3"
                            initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        >
                            <span className="text-[10px] font-semibold text-slate-400 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
                                Run #{iteration}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                    const hConnectorFrom = colors.bar;
                    const hConnectorTo = idx < STAGES.length - 1
                        ? COLOR_MAP[AGENT_REGISTRY[STAGES[idx + 1]].color].bar
                        : colors.bar;

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
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0B0F19] flex items-center justify-center"
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
                                <div className="flex-1 mx-3 h-[2px] relative overflow-visible" style={{ minWidth: 16 }}>
                                    <div className="absolute inset-0 bg-white/[0.09] rounded-full" />
                                    <motion.div
                                        className="absolute inset-y-0 left-0 rounded-full"
                                        style={{
                                            background: `linear-gradient(to right, ${hConnectorFrom}, ${hConnectorTo})`,
                                            boxShadow: `0 0 6px ${hConnectorTo}88`,
                                        }}
                                        initial={{ width: "0%" }}
                                        animate={{ width: idx < currentIdx ? "100%" : "0%" }}
                                        transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: "easeOut", delay: 0.1 }}
                                    />
                                    <AnimatePresence>
                                        {packetSegment === idx && (
                                            <motion.span
                                                key="pkt"
                                                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                                                style={{
                                                    backgroundColor: hConnectorTo,
                                                    boxShadow: `0 0 8px ${hConnectorTo}cc`,
                                                }}
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
