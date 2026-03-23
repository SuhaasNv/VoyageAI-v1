"use client";

import React from "react";
import {
    Brain, Bot, Wrench, TrendingUp, ChevronDown,
    BookOpen, Database, BarChart3, ArrowRight, Search,
    Clock, CircleCheck, AlertCircle,
} from "lucide-react";
import type { DecisionEntry } from "@/services/ai/explanation.service";

// ─── Decision type config ─────────────────────────────────────────────────────

type DecisionTypeFilter = "ALL" | "ASSISTANT_RESPONSE" | "AUTO_HEAL" | "AUTONOMOUS_ACTION" | "OPTIMIZATION";

const TYPE_CONFIG: Record<string, {
    label:  string;
    icon:   React.ElementType;
    color:  string;
    badge:  string;
}> = {
    ASSISTANT_RESPONSE: {
        label: "Assistant",
        icon:  Brain,
        color: "text-violet-400",
        badge: "bg-violet-500/10 border-violet-500/20 text-violet-300",
    },
    AUTO_HEAL: {
        label: "Auto-Heal",
        icon:  Wrench,
        color: "text-amber-400",
        badge: "bg-amber-500/10 border-amber-500/20 text-amber-300",
    },
    AUTONOMOUS_ACTION: {
        label: "Autonomous",
        icon:  Bot,
        color: "text-[#10B981]",
        badge: "bg-[#10B981]/10 border-[#10B981]/20 text-[#10B981]",
    },
    OPTIMIZATION: {
        label: "Optimization",
        icon:  TrendingUp,
        color: "text-blue-400",
        badge: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    },
};

const FILTER_TABS: { id: DecisionTypeFilter; label: string }[] = [
    { id: "ALL",                label: "All decisions" },
    { id: "ASSISTANT_RESPONSE", label: "Assistant"    },
    { id: "AUTO_HEAL",          label: "Auto-Heal"    },
    { id: "AUTONOMOUS_ACTION",  label: "Autonomous"   },
    { id: "OPTIMIZATION",       label: "Optimization" },
];

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number | null }) {
    if (value === null) return <span className="text-[10px] text-slate-600">—</span>;
    const pct = Math.round(value * 100);
    const color = pct >= 75 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">{pct}%</span>
        </div>
    );
}

// ─── Explanation drawer (inline expansion) ────────────────────────────────────

function ExplanationPanel({ decision }: { decision: DecisionEntry }) {
    const cfg  = TYPE_CONFIG[decision.decisionType] ?? TYPE_CONFIG.ASSISTANT_RESPONSE;
    const Icon = cfg.icon;

    const relTime = (() => {
        const diff = Date.now() - new Date(decision.createdAt).getTime();
        if (diff < 60_000)    return "Just now";
        if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
        if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)}h ago`;
        return new Date(decision.createdAt).toLocaleDateString();
    })();

    return (
        <div className="border-t border-white/[0.06] bg-[#070C12] rounded-b-xl overflow-hidden">
            <div className="p-4 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${cfg.badge.split(" ").filter((c) => c.startsWith("bg")).join(" ")}`}>
                            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-white">{cfg.label} Decision</p>
                            <p className="text-[10px] text-slate-500 font-mono">{decision.source} · {relTime}</p>
                        </div>
                    </div>
                    <ConfidenceBar value={decision.confidence} />
                </div>

                {/* Why — reasoning */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] bg-white/[0.02]">
                        <BookOpen className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/80">Why this decision was made</span>
                    </div>
                    <p className="px-3 py-2.5 text-sm text-slate-300 leading-relaxed">{decision.reasoning}</p>
                </div>

                {/* What data was used */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] bg-white/[0.02]">
                        <Database className="w-3 h-3 text-blue-400 shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-400/80">Data used to inform decision</span>
                    </div>
                    <p className="px-3 py-2.5 text-sm text-slate-400 leading-relaxed font-mono text-xs">{decision.inputSummary}</p>
                </div>

                {/* Outcome */}
                <div className="rounded-xl bg-[#10B981]/[0.05] border border-[#10B981]/15 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#10B981]/10 bg-[#10B981]/[0.03]">
                        <ArrowRight className="w-3 h-3 text-[#10B981] shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#10B981]/80">Outcome</span>
                    </div>
                    <p className="px-3 py-2.5 text-sm text-slate-300 leading-relaxed">{decision.outcome}</p>
                </div>

                {/* Metadata footer */}
                <div className="flex flex-wrap gap-3 text-[10px] text-slate-600">
                    {decision.requestId && (
                        <span className="font-mono">req: {decision.requestId.slice(-12)}</span>
                    )}
                    {decision.triggeredBy && (
                        <span>triggered by: {decision.triggeredBy}</span>
                    )}
                    <span className="font-mono">{new Date(decision.createdAt).toISOString()}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Decision row ─────────────────────────────────────────────────────────────

function DecisionRow({
    decision,
    isExpanded,
    onToggle,
}: {
    decision:   DecisionEntry;
    isExpanded: boolean;
    onToggle:   () => void;
}) {
    const cfg  = TYPE_CONFIG[decision.decisionType] ?? TYPE_CONFIG.ASSISTANT_RESPONSE;
    const Icon = cfg.icon;

    const timeStr = new Date(decision.createdAt).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit",
    });
    const dateStr = new Date(decision.createdAt).toLocaleDateString([], {
        month: "short", day: "numeric",
    });

    return (
        <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
            isExpanded
                ? "border-white/[0.12] bg-[#0A1018]"
                : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10]"
        }`}>
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
                {/* Type icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${cfg.badge}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>

                {/* Source + outcome snippet */}
                <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                            {cfg.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{decision.source}</span>
                    </div>
                    <p className="text-sm text-slate-300 truncate leading-snug">{decision.outcome}</p>
                </div>

                {/* Confidence + time */}
                <div className="flex items-center gap-4 shrink-0">
                    <ConfidenceBar value={decision.confidence} />
                    <div className="text-right">
                        <p className="text-[11px] text-slate-400 tabular-nums">{timeStr}</p>
                        <p className="text-[10px] text-slate-600">{dateStr}</p>
                    </div>
                    <ChevronDown
                        className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                </div>
            </button>

            {isExpanded && <ExplanationPanel decision={decision} />}
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400">
                {hasFilter ? "No decisions match this filter" : "No AI decisions logged yet"}
            </p>
            <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                {hasFilter
                    ? "Try selecting a different category or clearing the filter."
                    : "Decisions appear here after the assistant responds, auto-healing runs, or the autonomous runner executes actions."}
            </p>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ExplanationsClientProps {
    decisions: DecisionEntry[];
}

export default function ExplanationsClient({ decisions }: ExplanationsClientProps) {
    const [filter, setFilter]       = React.useState<DecisionTypeFilter>("ALL");
    const [search, setSearch]       = React.useState("");
    const [expandedId, setExpandedId] = React.useState<string | null>(null);

    const filtered = React.useMemo(() => {
        let result = decisions;
        if (filter !== "ALL") {
            result = result.filter((d) => d.decisionType === filter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (d) =>
                    d.reasoning.toLowerCase().includes(q) ||
                    d.outcome.toLowerCase().includes(q) ||
                    d.source.toLowerCase().includes(q)
            );
        }
        return result;
    }, [decisions, filter, search]);

    const counts = React.useMemo(() => {
        const c: Record<string, number> = { ALL: decisions.length };
        for (const d of decisions) {
            c[d.decisionType] = (c[d.decisionType] ?? 0) + 1;
        }
        return c;
    }, [decisions]);

    const toggle = (id: string) =>
        setExpandedId((prev) => (prev === id ? null : id));

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">AI Decision Explainability</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Every AI decision — transparent, traceable, and auditable.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    {decisions.length > 0 ? (
                        <>
                            <CircleCheck className="w-3.5 h-3.5 text-[#10B981]" />
                            {decisions.length} decision{decisions.length !== 1 ? "s" : ""} logged
                        </>
                    ) : (
                        <>
                            <Clock className="w-3.5 h-3.5" />
                            Awaiting first AI decision
                        </>
                    )}
                </div>
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search reasoning, outcome, or source…"
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#10B981]/30 focus:bg-white/[0.06] transition-all"
                    />
                </div>

                <div className="flex gap-1.5 flex-wrap">
                    {FILTER_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilter(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                filter === tab.id
                                    ? "bg-[#10B981]/10 border-[#10B981]/25 text-[#10B981]"
                                    : "bg-white/[0.03] border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
                            }`}
                        >
                            {tab.label}
                            {counts[tab.id] !== undefined && (
                                <span className={`text-[10px] px-1 py-0.5 rounded-md ${
                                    filter === tab.id ? "bg-[#10B981]/20 text-[#10B981]" : "bg-white/[0.06] text-slate-600"
                                }`}>
                                    {tab.id === "ALL" ? counts.ALL : (counts[tab.id] ?? 0)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats strip */}
            {decisions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(["ASSISTANT_RESPONSE", "AUTO_HEAL", "AUTONOMOUS_ACTION", "OPTIMIZATION"] as const).map((type) => {
                        const cfg   = TYPE_CONFIG[type];
                        const Icon  = cfg.icon;
                        const count = counts[type] ?? 0;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setFilter(filter === type ? "ALL" : type)}
                                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                                    filter === type
                                        ? `${cfg.badge} border-opacity-40`
                                        : "bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.04]"
                                }`}
                            >
                                <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                                <div>
                                    <p className="text-lg font-bold text-white leading-none">{count}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{cfg.label}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Decision list */}
            {filtered.length === 0 ? (
                <EmptyState hasFilter={filter !== "ALL" || search.trim().length > 0} />
            ) : (
                <div className="space-y-2">
                    {filtered.map((d) => (
                        <DecisionRow
                            key={d.id}
                            decision={d}
                            isExpanded={expandedId === d.id}
                            onToggle={() => toggle(d.id)}
                        />
                    ))}
                </div>
            )}

            {/* Info footer */}
            {decisions.length > 0 && (
                <div className="flex items-center gap-2 px-1 text-[11px] text-slate-600">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Input summaries are sanitized — no user data, API keys, or sensitive information is stored.
                </div>
            )}
        </div>
    );
}
