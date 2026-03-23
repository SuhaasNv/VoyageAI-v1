"use client";

import React from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, Zap, DollarSign } from "lucide-react";
import type { AgentExecution, AgentStep } from "./page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortId(id: string) { return id.slice(-8); }
function relDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
function fmtMs(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Step pill ────────────────────────────────────────────────────────────────

function StepPill({ step, index }: { step: AgentStep; index: number }) {
    const [expanded, setExpanded] = React.useState(false);
    const isError = step.totalTokens === 0;

    // Derive a "role" label from endpoint or model
    const role = step.endpoint
        ? step.endpoint.replace("/api/ai/", "").replace("/api/", "")
        : step.modelUsed;

    return (
        <div className={`rounded-lg border transition-colors ${
            isError ? "border-red-500/20 bg-red-500/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
        }`}>
            <button
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
            >
                {/* Step index */}
                <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                    {index + 1}
                </span>

                {/* Status */}
                {isError ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}

                {/* Role / endpoint */}
                <span className="text-xs font-mono text-slate-200 flex-1 truncate">{role}</span>

                {/* Badges */}
                <span className="text-[10px] text-slate-500 shrink-0">{step.provider}</span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0 hidden sm:block truncate max-w-[120px]">{step.modelUsed}</span>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{fmtMs(step.latencyMs)}</span>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{step.totalTokens.toLocaleString()} tok</span>

                {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                )}
            </button>

            {expanded && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                    <pre className="text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap bg-black/20 rounded-lg p-3 font-mono">
                        {JSON.stringify({
                            id:               step.id,
                            endpoint:         step.endpoint,
                            provider:         step.provider,
                            modelUsed:        step.modelUsed,
                            promptTokens:     step.promptTokens,
                            completionTokens: step.completionTokens,
                            totalTokens:      step.totalTokens,
                            latencyMs:        step.latencyMs,
                            costEstimateUsd:  step.costEstimateUsd,
                            createdAt:        step.createdAt,
                            status:           step.totalTokens === 0 ? "ERROR (0 tokens)" : "OK",
                        }, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ─── Execution card ───────────────────────────────────────────────────────────

function ExecutionCard({ exec }: { exec: AgentExecution }) {
    const [expanded, setExpanded] = React.useState(false);

    return (
        <div className={`rounded-xl border transition-all duration-200 ${
            exec.hasError ? "border-red-500/20 bg-red-500/[0.02]" : "border-white/[0.08] bg-white/[0.03]"
        }`}>
            {/* Header */}
            <button
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
            >
                {exec.hasError ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}

                {/* Request ID */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-white truncate">
                        <span className="text-slate-500">req/</span>{shortId(exec.requestId)}
                        <span className="text-slate-600 ml-2 text-[10px]">{exec.requestId}</span>
                    </p>
                    <p className="text-[11px] text-slate-600 mt-0.5">{relDate(exec.startedAt)}</p>
                </div>

                {/* Stats row */}
                <div className="hidden sm:flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {fmtMs(exec.totalDurationMs)}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Zap className="w-3 h-3" />
                        {exec.totalTokens.toLocaleString()} tok
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <DollarSign className="w-3 h-3" />
                        ${exec.totalCostUsd.toFixed(4)}
                    </div>
                    <span className="text-[11px] text-slate-600 tabular-nums">{exec.stepCount} step{exec.stepCount !== 1 ? "s" : ""}</span>
                </div>

                {expanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                )}
            </button>

            {/* Pipeline connector + steps */}
            {expanded && (
                <div className="border-t border-white/[0.06] px-5 py-4 space-y-2">
                    {/* Step count chips */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {exec.steps.map((s, i) => {
                            const isErr = s.totalTokens === 0;
                            const label = s.endpoint
                                ? s.endpoint.replace("/api/ai/", "").replace("/api/", "")
                                : s.modelUsed;
                            return (
                                <React.Fragment key={i}>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                                        isErr
                                            ? "border-red-500/25 bg-red-500/10 text-red-400"
                                            : "border-[#10B981]/20 bg-[#10B981]/10 text-[#10B981]"
                                    }`}>
                                        {label}
                                    </span>
                                    {i < exec.steps.length - 1 && (
                                        <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {exec.steps.map((step, i) => (
                        <StepPill key={step.id} step={step} index={i} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AgentTraceList({ executions }: { executions: AgentExecution[] }) {
    return (
        <div className="space-y-3 pb-8">
            {executions.map((exec) => (
                <ExecutionCard key={exec.requestId} exec={exec} />
            ))}
        </div>
    );
}
