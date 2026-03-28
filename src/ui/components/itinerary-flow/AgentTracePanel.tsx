"use client";

/**
 * AgentTracePanel — "Watch the AI Think"
 *
 * Displays a live animated log of per-stage agent activity during itinerary
 * creation. Each stage emits a trace entry when it starts (loading) and
 * completes (success/error). Entries animate in sequentially to give the
 * user a transparent view into the AI pipeline.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, AlertCircle, Brain, Zap } from "lucide-react";
import type { FlowState, FlowStage } from "./types";

// ─── Trace entry types ────────────────────────────────────────────────────────

export type TraceStatus = "pending" | "running" | "done" | "error";

export interface TraceEntry {
    id: string;
    stage: FlowStage;
    label: string;
    status: TraceStatus;
    durationMs?: number;
    detail?: string;
    timestamp: number;
}

// ─── Stage display metadata ───────────────────────────────────────────────────

const STAGE_META: Record<Exclude<FlowStage, "saved">, { label: string; description: string }> = {
    planner:   { label: "Blueprint", description: "Parsing destination, dates & style" },
    research:  { label: "Research",  description: "Fetching attractions, hotels & dining" },
    logistics: { label: "Logistics", description: "Optimizing route & time slots" },
    budget:    { label: "Budget",    description: "Calculating costs & savings" },
    safety:    { label: "Safety",    description: "Risk assessment & travel tips" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: TraceStatus) {
    switch (status) {
        case "running":
            return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />;
        case "done":
            return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
        case "error":
            return <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
        default:
            return <Circle className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />;
    }
}

function statusColor(status: TraceStatus): string {
    switch (status) {
        case "running": return "border-indigo-500/30 bg-indigo-500/[0.05]";
        case "done":    return "border-emerald-500/20 bg-emerald-500/[0.04]";
        case "error":   return "border-rose-500/20 bg-rose-500/[0.04]";
        default:        return "border-white/[0.05] bg-transparent";
    }
}

// ─── Build trace entries from FlowState ───────────────────────────────────────

const STAGE_ORDER: Exclude<FlowStage, "saved">[] = [
    "planner", "research", "logistics", "budget", "safety",
];

export function buildTraceEntries(state: FlowState): TraceEntry[] {
    // When stage is "saved" all agent stages completed — treat as past-the-end.
    const isSaved = state.stage === "saved";
    const currentIdx = isSaved
        ? STAGE_ORDER.length
        : STAGE_ORDER.indexOf(state.stage as Exclude<FlowStage, "saved">);

    return STAGE_ORDER.map((stage, idx) => {
        const meta = STAGE_META[stage];
        const stageResult =
            stage === "planner"   ? state.plannerResult :
            stage === "research"  ? state.researchResult :
            stage === "logistics" ? state.logisticsResult :
            stage === "budget"    ? state.budgetResult :
                                    state.safetyResult;

        const stageMeta = state.meta[stage];

        let status: TraceStatus = "pending";
        if (idx < currentIdx) {
            status = stageResult ? "done" : "error";
        } else if (idx === currentIdx) {
            status = state.isLoading ? "running" : (stageResult ? "done" : "pending");
        }

        // If we're past this stage but have an error on the current stage,
        // treat previous stages as done.
        if (state.error && idx < currentIdx) status = "done";

        return {
            id: `${stage}-${state.iteration}`,
            stage,
            label: meta.label,
            status,
            durationMs: stageMeta?.durationMs,
            detail: status === "running"
                ? meta.description
                : status === "done" && stageMeta?.decisionsLog?.length
                    ? stageMeta.decisionsLog[stageMeta.decisionsLog.length - 1]?.replace(/^\+\d+ms\s*/, "")
                    : undefined,
            timestamp: Date.now() - idx * 10,
        };
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AgentTracePanelProps {
    state: FlowState;
    isLoading: boolean;
    className?: string;
}

export function AgentTracePanel({ state, isLoading, className = "" }: AgentTracePanelProps) {
    const entries = buildTraceEntries({ ...state, isLoading });
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the active entry
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [state.stage, isLoading]);

    const hasActivity = entries.some((e) => e.status !== "pending");

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-3 flex-shrink-0">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                    <Brain className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-xs font-semibold text-white tracking-tight">Agent Activity</span>
                {isLoading && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-indigo-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Live
                    </span>
                )}
            </div>

            {/* Trace list */}
            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5 hide-scrollbar">
                {!hasActivity && (
                    <div className="flex flex-col items-center justify-center h-24 gap-2 text-center">
                        <Zap className="w-5 h-5 text-zinc-700" />
                        <p className="text-[11px] text-zinc-600">Pipeline starting…</p>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {entries.map((entry) => (
                        entry.status !== "pending" && (
                            <motion.div
                                key={entry.id + entry.status}
                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${statusColor(entry.status)}`}
                            >
                                <div className="mt-0.5">{statusIcon(entry.status)}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`font-semibold truncate ${
                                            entry.status === "running"
                                                ? "text-indigo-300"
                                                : entry.status === "done"
                                                    ? "text-emerald-300"
                                                    : entry.status === "error"
                                                        ? "text-rose-300"
                                                        : "text-zinc-500"
                                        }`}>
                                            {entry.label}
                                        </span>
                                        {entry.durationMs !== undefined && entry.status === "done" && (
                                            <span className="text-[10px] text-zinc-500 flex-shrink-0">
                                                {entry.durationMs < 1000
                                                    ? `${entry.durationMs}ms`
                                                    : `${(entry.durationMs / 1000).toFixed(1)}s`}
                                            </span>
                                        )}
                                        {entry.status === "running" && (
                                            <span className="text-[10px] text-indigo-400 flex-shrink-0 animate-pulse">
                                                working…
                                            </span>
                                        )}
                                    </div>
                                    {entry.detail && (
                                        <p className="mt-0.5 text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
                                            {entry.detail}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )
                    ))}
                </AnimatePresence>

                <div ref={bottomRef} />
            </div>
        </div>
    );
}
