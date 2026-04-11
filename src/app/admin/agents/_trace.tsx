"use client";

import React from "react";
import {
    ChevronDown, ChevronRight, CheckCircle2, XCircle,
    Clock, Zap, DollarSign, Bot, RefreshCw, AlertTriangle,
    ArrowRight, Code2,
} from "lucide-react";
import type { PipelineRun } from "./types";
import type { ReplayTrace, ReplayStep, LLMCallSummary } from "@/services/ai/agentReplayLogger";
import { ensureCsrfToken } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
function relDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
function shortId(id: string) { return id.slice(-8); }

// Agent display config
const AGENT_META: Record<string, { color: string; bg: string; border: string }> = {
    planner:    { color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"  },
    research:   { color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
    logistics:  { color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20"  },
    budget:     { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20"  },
    safety:     { color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20"    },
    orchestrator:{ color: "text-slate-400", bg: "bg-slate-500/10",  border: "border-slate-500/20"  },
};

function agentStyle(name: string) {
    return AGENT_META[name.toLowerCase()] ?? { color: "text-slate-400", bg: "bg-white/[0.04]", border: "border-white/[0.08]" };
}

// ─── Pipeline Timeline Bar ────────────────────────────────────────────────────

function PipelineBar({ steps }: { steps: ReplayStep[] }) {
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {steps.map((step, i) => {
                const s = agentStyle(step.agentName);
                return (
                    <React.Fragment key={step.id}>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                            step.success ? `${s.color} ${s.bg} ${s.border}` : "text-red-400 bg-red-500/10 border-red-500/20"
                        }`}>
                            {step.agentName}
                        </span>
                        {i < steps.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-slate-700 shrink-0" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── JSON viewer ──────────────────────────────────────────────────────────────

function JsonViewer({ label, data }: { label: string; data: unknown }) {
    const [open, setOpen] = React.useState(false);
    if (data === null || data === undefined) return null;

    return (
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
            >
                <Code2 className="w-3 h-3 text-slate-600 shrink-0" />
                <span className="text-[11px] text-slate-500 flex-1">{label}</span>
                <ChevronDown className={`w-3 h-3 text-slate-600 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
            </button>
            {open && (
                <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap bg-black/20 px-3 py-2.5 font-mono leading-relaxed border-t border-white/[0.06]">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}

// ─── Replay Step Card ─────────────────────────────────────────────────────────

function StepCard({ step, llmCalls }: { step: ReplayStep; llmCalls: LLMCallSummary[] }) {
    const [expanded, setExpanded] = React.useState(false);
    const s = agentStyle(step.agentName);
    // Match LLM calls to this step by proximity (same agent region)
    const agentLlmCalls = llmCalls.filter((l) => {
        const endpoint = l.endpoint?.toLowerCase() ?? "";
        return endpoint.includes(step.agentName) || endpoint.includes("ai");
    });

    return (
        <div className={`rounded-xl border overflow-hidden transition-colors ${
            step.success ? "border-white/[0.07] bg-white/[0.02]" : "border-red-500/20 bg-red-500/[0.03]"
        }`}>
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
                {/* Step number */}
                <span className="w-5 h-5 rounded-full bg-white/[0.07] flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                    {step.stepIndex + 1}
                </span>

                {/* Status icon */}
                {step.success
                    ? <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}

                {/* Agent name */}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${s.color} ${s.bg} border ${s.border} shrink-0 capitalize`}>
                    {step.agentName}
                </span>

                {/* Error message */}
                {step.errorMsg && (
                    <span className="text-[11px] text-red-400/80 truncate flex-1 hidden sm:block">{step.errorMsg}</span>
                )}
                <span className="flex-1" />

                {/* Latency */}
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{fmtMs(step.latencyMs)}</span>

                {expanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                }
            </button>

            {expanded && (
                <div className="border-t border-white/[0.06] px-4 py-3 space-y-2">
                    {step.errorMsg && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {step.errorMsg}
                        </div>
                    )}
                    <JsonViewer label="Input" data={step.inputJson} />
                    <JsonViewer label="Output" data={step.outputJson} />
                    {step.metadata !== null && step.metadata !== undefined && <JsonViewer label="Metadata" data={step.metadata as Record<string, unknown>} />}

                    {agentLlmCalls.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold pt-1">LLM Calls</p>
                            {agentLlmCalls.map((l) => (
                                <div key={l.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-slate-400">
                                    <span className="font-mono text-slate-500 truncate max-w-[120px]">{l.modelUsed}</span>
                                    <span className="text-slate-600">{fmtMs(l.latencyMs)}</span>
                                    <span className="text-slate-600">{l.totalTokens.toLocaleString()} tok</span>
                                    <span className="text-slate-600">${l.costEstimateUsd.toFixed(5)}</span>
                                    {l.success
                                        ? <CheckCircle2 className="w-3 h-3 text-[#10B981] ml-auto shrink-0" />
                                        : <XCircle className="w-3 h-3 text-red-400 ml-auto shrink-0" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Replay Panel (loaded on demand) ─────────────────────────────────────────

function ReplayPanel({ requestId, onClose }: { requestId: string; onClose: () => void }) {
    const [trace, setTrace]   = React.useState<ReplayTrace | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError]   = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const csrf = await ensureCsrfToken();
                const res  = await fetch(`/api/admin/agent-replay?requestId=${encodeURIComponent(requestId)}`, {
                    credentials: "include",
                    headers: { "X-CSRF-Token": csrf },
                });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({})) as { error?: { message?: string } };
                    throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
                }
                const data = await res.json() as { data: ReplayTrace };
                if (!cancelled) setTrace(data.data);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [requestId]);

    return (
        <div className="rounded-2xl border border-white/[0.1] bg-[#0B1018] overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.07] bg-white/[0.02]">
                <Bot className="w-4 h-4 text-[#10B981]" />
                <span className="text-xs font-mono text-white flex-1 truncate">
                    <span className="text-slate-500">replay / </span>{shortId(requestId)}
                    <span className="text-slate-600 ml-2">{requestId}</span>
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-[11px] text-slate-500 hover:text-slate-200 px-2 py-1 rounded hover:bg-white/[0.06] transition-colors"
                >
                    close
                </button>
            </div>

            <div className="px-5 py-4">
                {loading && (
                    <div className="space-y-2 animate-pulse">
                        {[3, 4, 5].map((w) => (
                            <div key={w} className="h-12 rounded-xl bg-white/[0.04]" style={{ width: `${w * 20}%` }} />
                        ))}
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {trace && (
                    <div className="space-y-5">
                        {/* Summary strip */}
                        <div className="flex items-center gap-5 flex-wrap text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />{fmtMs(trace.summary.totalDurationMs)}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5" />{trace.summary.totalTokens.toLocaleString()} tokens
                            </div>
                            <div className="flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5" />${trace.summary.totalCostUsd.toFixed(5)}
                            </div>
                            <div className={`flex items-center gap-1.5 font-medium ${trace.summary.success ? "text-[#10B981]" : "text-red-400"}`}>
                                {trace.summary.success
                                    ? <><CheckCircle2 className="w-3.5 h-3.5" />Success</>
                                    : <><XCircle className="w-3.5 h-3.5" />Failed at {trace.summary.failedAgent}</>}
                            </div>
                        </div>

                        {/* Pipeline flow */}
                        {trace.steps.length > 0 && (
                            <PipelineBar steps={trace.steps} />
                        )}

                        {/* Step cards */}
                        {trace.steps.length > 0 ? (
                            <div className="space-y-2">
                                {trace.steps.map((step) => (
                                    <StepCard key={step.id} step={step} llmCalls={trace.llmCalls} />
                                ))}
                            </div>
                        ) : (
                            // Legacy: no structured steps, show LLM calls only
                            <div className="space-y-2">
                                <p className="text-[11px] text-slate-600">Legacy trace — structured agent logs not available for this run.</p>
                                {trace.llmCalls.map((l) => (
                                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-[11px] text-slate-400">
                                        <span className="font-mono text-slate-300 truncate max-w-[160px]">{l.endpoint ?? l.modelUsed}</span>
                                        <span>{fmtMs(l.latencyMs)}</span>
                                        <span>{l.totalTokens.toLocaleString()} tok</span>
                                        <span className="ml-auto">${l.costEstimateUsd.toFixed(5)}</span>
                                        {l.success
                                            ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                            : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Run summary row ──────────────────────────────────────────────────────────

function RunRow({ run, onSelect, selected }: { run: PipelineRun; onSelect: () => void; selected: boolean }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border text-left transition-all duration-150 ${
                selected
                    ? "border-[#10B981]/30 bg-[#10B981]/[0.05]"
                    : run.hasError
                    ? "border-red-500/20 bg-red-500/[0.02] hover:bg-red-500/[0.04]"
                    : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
        >
            {/* Status icon */}
            {run.hasError
                ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />}

            {/* Request ID */}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-white truncate">
                    <span className="text-slate-500">req/</span>{shortId(run.requestId)}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-600">{relDate(run.startedAt)}</p>
                    {run.hasStructuredLogs
                        ? <span className="text-[10px] px-1.5 py-0 rounded bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">structured</span>
                        : <span className="text-[10px] px-1.5 py-0 rounded bg-white/[0.04] text-slate-600 border border-white/[0.07]">legacy</span>}
                    {run.failedAgent && (
                        <span className="text-[10px] text-red-400">failed at {run.failedAgent}</span>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-4 shrink-0 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMs(run.totalDurationMs)}</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{run.totalTokens.toLocaleString()}</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${run.totalCostUsd.toFixed(4)}</span>
                <span className="text-slate-600">{run.stepCount} step{run.stepCount !== 1 ? "s" : ""}</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        </button>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AgentReplayView({ runs }: { runs: PipelineRun[] }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    const toggle = (id: string) => setSelectedId((prev) => prev === id ? null : id);

    return (
        <div className="space-y-2 pb-8">
            {runs.map((run) => (
                <div key={run.requestId} className="space-y-2">
                    <RunRow
                        run={run}
                        onSelect={() => toggle(run.requestId)}
                        selected={selectedId === run.requestId}
                    />
                    {selectedId === run.requestId && (
                        <ReplayPanel
                            requestId={run.requestId}
                            onClose={() => setSelectedId(null)}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}
