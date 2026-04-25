"use client";

/**
 * ReasoningPanel — Cinematic REASONING_LOGS display for the right sidebar.
 *
 * Shows per-agent execution logs with timestamps, decision entries, and
 * a metrics footer (total latency, stages completed). Styled as a live
 * AI system trace rather than a dry activity log.
 *
 * Uses buildTraceEntries from agentTraceEntries for the flow state snapshot.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    Loader2,
    AlertCircle,
    Cpu,
    Clock,
    Activity,
} from "lucide-react";
import { buildTraceEntries } from "./agentTraceEntries";
import { AGENT_REGISTRY } from "./agentRegistry";
import type { FlowState, FlowStage, FlowMetadata } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentColorKey = "indigo" | "teal" | "amber" | "green" | "purple";

interface ColorTokens {
    border: string;
    bg: string;
    text: string;
    dot: string;
    shimmer: string;
}

// ─── Color map ────────────────────────────────────────────────────────────────

const COLOR_TOKENS: Record<AgentColorKey, ColorTokens> = {
    indigo: {
        border: "border-indigo-500/20",
        bg: "bg-indigo-500/[0.07]",
        text: "text-indigo-400",
        dot: "bg-indigo-400",
        shimmer: "rgba(99,102,241,0.08)",
    },
    teal: {
        border: "border-teal-500/20",
        bg: "bg-teal-500/[0.07]",
        text: "text-teal-400",
        dot: "bg-teal-400",
        shimmer: "rgba(20,184,166,0.08)",
    },
    amber: {
        border: "border-amber-500/20",
        bg: "bg-amber-500/[0.07]",
        text: "text-amber-400",
        dot: "bg-amber-400",
        shimmer: "rgba(245,158,11,0.08)",
    },
    green: {
        border: "border-emerald-500/20",
        bg: "bg-emerald-500/[0.07]",
        text: "text-emerald-400",
        dot: "bg-emerald-400",
        shimmer: "rgba(16,185,129,0.08)",
    },
    purple: {
        border: "border-purple-500/20",
        bg: "bg-purple-500/[0.07]",
        text: "text-purple-400",
        dot: "bg-purple-400",
        shimmer: "rgba(168,85,247,0.08)",
    },
};

// ─── Label map ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<Exclude<FlowStage, "saved">, string> = {
    planner: "BLUEPRINT",
    research: "RESEARCH",
    logistics: "LOGISTICS",
    budget: "BUDGET",
    safety: "SAFETY",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip the leading "+Xms " prefix and return offset + clean text. */
function parseLogLine(line: string): { offset: string; text: string } {
    const m = line.match(/^\+(\d+m?s)\s*(.+)/);
    if (m) return { offset: m[1], text: m[2] };
    return { offset: "", text: line };
}

/** Pick the two most interesting log lines from a decisions log. */
function pickLogLines(log: string[]): string[] {
    if (log.length === 0) return [];
    // Show last 2 entries; they're most specific.
    return log.slice(-2);
}

/** Format milliseconds compactly. */
function fmtMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionLine({ line }: { line: string }) {
    const { offset, text } = parseLogLine(line);
    return (
        <div className="flex items-start gap-1.5">
            {offset && (
                <span className="text-[8px] font-mono text-slate-600 flex-shrink-0 mt-[1px]">
                    +{offset}
                </span>
            )}
            <p className="text-[10px] text-slate-500 leading-snug">{text}</p>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReasoningPanelProps {
    state: FlowState;
    isLoading: boolean;
    className?: string;
    imageUrl?: string | null;
    destination?: string;
}

const AGENT_STAGES: Exclude<FlowStage, "saved">[] = [
    "planner", "research", "logistics", "budget", "safety",
];

export function ReasoningPanel({ state, isLoading, className = "", imageUrl }: ReasoningPanelProps) {
    const entries = buildTraceEntries({ ...state, isLoading });
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when active entry changes
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [state.stage, isLoading]);

    // Metrics
    const completedMetas = AGENT_STAGES
        .map((s) => state.meta[s])
        .filter((m): m is FlowMetadata => m !== undefined);
    const totalMs = completedMetas.reduce((sum, m) => sum + m.durationMs, 0);
    const stagesDone = completedMetas.length;
    const hasMetrics = stagesDone > 0;

    const hasActivity = entries.some((e) => e.status !== "pending");

    return (
        <div className={`flex flex-col h-full relative overflow-hidden ${className}`}>
            {/* Destination Backdrop for Reasoning */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
                {imageUrl && (
                    <img src={imageUrl} alt="" className="w-full h-full object-cover blur-xl scale-150" />
                )}
            </div>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                        <Cpu className="w-2.5 h-2.5 text-purple-400" />
                    </div>
                    <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-slate-500">
                        Reasoning_Logs
                    </span>
                </div>

                <AnimatePresence>
                    {isLoading && (
                        <motion.div
                            key="stream"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-1"
                        >
                            <motion.span
                                className="w-1 h-1 rounded-full bg-purple-400"
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 0.9, repeat: Infinity }}
                            />
                            <span className="text-[8px] font-mono text-purple-400/70 tracking-wider">
                                streaming
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Trace entries ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 hide-scrollbar">
                {!hasActivity && (
                    <div className="flex flex-col items-center justify-center h-20 gap-2 text-center">
                        <Activity className="w-4 h-4 text-zinc-700" />
                        <p className="text-[10px] text-zinc-600">Pipeline initializing…</p>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {entries.map((entry) => {
                        if (entry.status === "pending") return null;

                        const agentStage = entry.stage as Exclude<FlowStage, "saved">;
                        const agent = AGENT_REGISTRY[agentStage];
                        const colors = COLOR_TOKENS[agent.color];
                        const stageMeta = state.meta[agentStage];
                        const isRunning = entry.status === "running";
                        const isDone = entry.status === "done";

                        const logLines = isDone && stageMeta?.decisionsLog
                            ? pickLogLines(stageMeta.decisionsLog)
                            : [];

                        return (
                            <motion.div
                                key={entry.id + entry.status}
                                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.93 }}
                                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                                className={`rounded-xl border p-2.5 relative overflow-hidden transition-colors ${
                                    isRunning
                                        ? `${colors.border} ${colors.bg}`
                                        : isDone
                                        ? "border-white/[0.06] bg-white/[0.025]"
                                        : "border-rose-500/20 bg-rose-500/[0.05]"
                                }`}
                            >
                                {/* Shimmer overlay when running */}
                                {isRunning && (
                                    <motion.div
                                        className="absolute inset-0 pointer-events-none rounded-xl"
                                        style={{
                                            background: `linear-gradient(105deg, transparent 20%, ${colors.shimmer} 50%, transparent 80%)`,
                                            backgroundSize: "200% 100%",
                                        }}
                                        animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                                    />
                                )}

                                {/* Entry header */}
                                <div className="flex items-center justify-between relative z-[1]">
                                    <div className="flex items-center gap-1.5">
                                        {isRunning ? (
                                            <motion.span
                                                className={`w-1.5 h-1.5 rounded-full ${colors.dot} flex-shrink-0`}
                                                animate={{ opacity: [1, 0.2, 1] }}
                                                transition={{ duration: 0.75, repeat: Infinity }}
                                            />
                                        ) : isDone ? (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                        ) : (
                                            <AlertCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                                        )}

                                        <span
                                            className={`text-[9px] font-bold tracking-[0.15em] ${
                                                isRunning
                                                    ? colors.text
                                                    : isDone
                                                    ? "text-slate-400"
                                                    : "text-rose-400"
                                            }`}
                                        >
                                            {STAGE_LABELS[agentStage]}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {isDone && entry.durationMs !== undefined && (
                                            <span className="text-[8px] text-slate-600 font-mono">
                                                {fmtMs(entry.durationMs)}
                                            </span>
                                        )}
                                        {isRunning && (
                                            <Loader2 className={`w-2.5 h-2.5 ${colors.text} animate-spin`} />
                                        )}
                                    </div>
                                </div>

                                {/* Running: live description */}
                                {isRunning && entry.detail && (
                                    <p className="mt-1.5 text-[10px] text-slate-400 leading-snug relative z-[1]">
                                        {entry.detail}
                                    </p>
                                )}

                                {/* Done: last decision log lines */}
                                {isDone && logLines.length > 0 && (
                                    <div className="mt-1.5 space-y-1">
                                        {logLines.map((line, i) => (
                                            <DecisionLine key={i} line={line} />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                <div ref={bottomRef} />
            </div>

            {/* ── Metrics footer ─────────────────────────────────────────── */}
            <AnimatePresence>
                {hasMetrics && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-shrink-0 border-t border-white/[0.04] px-3 py-3"
                    >
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
                                <div className="flex items-center gap-1 mb-0.5">
                                    <Clock className="w-2.5 h-2.5 text-slate-600" />
                                    <p className="text-[8px] text-slate-600 uppercase tracking-widest font-medium">
                                        Latency
                                    </p>
                                </div>
                                <p className="text-[11px] font-bold text-slate-300 font-mono">
                                    {fmtMs(totalMs)}
                                </p>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
                                <div className="flex items-center gap-1 mb-0.5">
                                    <Activity className="w-2.5 h-2.5 text-slate-600" />
                                    <p className="text-[8px] text-slate-600 uppercase tracking-widest font-medium">
                                        Stages
                                    </p>
                                </div>
                                <p className="text-[11px] font-bold text-slate-300 font-mono">
                                    {stagesDone}/5
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
