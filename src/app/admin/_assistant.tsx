"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
    Sparkles, X, RotateCcw, ChevronDown, Loader2,
    AlertTriangle, Send, Brain, Lightbulb, ArrowRight,
    Zap, TriangleAlert, ShieldAlert, CheckCircle2, XCircle,
    TrendingUp, Eye,
} from "lucide-react";
import { ensureCsrfToken } from "@/lib/api";
import type { AssistantResponse, ActionItem } from "@/app/api/admin/assistant/route";
import type { Prediction } from "@/services/ai/predictive.service";
import { ADMIN_FLAGS } from "@/lib/featureFlags";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnomalyMeta {
    label:    string;
    severity: "critical" | "warning" | "info";
}

interface AssistantMessage {
    role:     "assistant";
    response: AssistantResponse & {
        _meta?: {
            source:            string;
            anomalyCount:      number;
            anomalySeverities: AnomalyMeta[];
            predictions?:      Prediction[];
        };
    };
}

interface UserMessage {
    role:    "user";
    content: string;
}

type Message = UserMessage | AssistantMessage;

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS: { label: string; query: string }[] = [
    { label: "System health",         query: "Give me a full system health analysis" },
    { label: "AI cost breakdown",     query: "Analyze AI usage costs and flag any anomalies" },
    { label: "User engagement",       query: "How is user engagement trending?" },
    { label: "Trip activity",         query: "Summarize trip creation trends and top destinations" },
    { label: "Error diagnosis",       query: "Are there any AI errors or failures I should know about?" },
    { label: "7-day summary",         query: "Summarize the last 7 days across all metrics" },
];

// ─── Prediction banner ────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
    critical: "bg-red-500/10 border-red-500/20 text-red-300",
    high:     "bg-amber-500/10 border-amber-500/20 text-amber-300",
    medium:   "bg-blue-500/10 border-blue-500/20 text-blue-300",
    low:      "bg-white/[0.04] border-white/[0.08] text-slate-400",
};

function PredictionBanner({
    predictions,
    onAsk,
}: {
    predictions: Prediction[];
    onAsk: (q: string) => void;
}) {
    const visible = predictions.filter((p) => p.severity === "high" || p.severity === "critical" || p.severity === "medium");
    if (visible.length === 0) return null;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-0.5">
                <TrendingUp className="w-3 h-3 text-amber-400" />
                Log-based trend warnings
            </div>
            {visible.slice(0, 3).map((p) => (
                <div
                    key={p.id}
                    className={`rounded-xl border px-3 py-2.5 space-y-1.5 ${SEVERITY_COLOR[p.severity] ?? SEVERITY_COLOR.low}`}
                >
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] leading-snug flex-1">{p.prediction}</p>
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-70 mt-0.5">
                            {p.horizon}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <div className="h-1 w-14 rounded-full bg-white/[0.08] overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-current opacity-50"
                                    style={{ width: `${Math.round(p.confidence * 100)}%` }}
                                />
                            </div>
                            <span className="text-[9px] opacity-60" title="Coefficient of determination (R²) — measures trend fit, not probability">{Math.round(p.confidence * 100)}% R² fit</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => onAsk(`${p.prediction} What should I do now to prevent this?`)}
                            className="flex items-center gap-1 text-[9px] font-medium opacity-70 hover:opacity-100 transition-opacity"
                        >
                            <Eye className="w-2.5 h-2.5" />
                            Analyse
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Anomaly badge ────────────────────────────────────────────────────────────

function AnomalyBadge({ meta }: { meta: AnomalyMeta[] }) {
    if (meta.length === 0) return null;
    const hasCritical = meta.some((m) => m.severity === "critical");
    const hasWarning  = meta.some((m) => m.severity === "warning");

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border w-fit ${
            hasCritical
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : hasWarning
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`}>
            {hasCritical
                ? <ShieldAlert className="w-3 h-3" />
                : <TriangleAlert className="w-3 h-3" />}
            {meta.length} anomal{meta.length === 1 ? "y" : "ies"} detected
        </div>
    );
}

// ─── Action button ────────────────────────────────────────────────────────────

type ActionState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; message: string }
    | { status: "error";   message: string };

function ActionButton({ action }: { action: ActionItem }) {
    const [state, setState] = React.useState<ActionState>({ status: "idle" });

    const execute = async () => {
        if (state.status === "loading") return;
        setState({ status: "loading" });
        try {
            const csrf = await ensureCsrfToken();
            const res  = await fetch("/api/admin/execute-action", {
                method:      "POST",
                credentials: "include",
                headers:     { "Content-Type": "application/json", "X-CSRF-Token": csrf },
                body:        JSON.stringify({ action: { type: action.type, payload: action.payload } }),
            });
            const json = await res.json() as { success: boolean; data?: { success: boolean; message?: string } };
            if (!res.ok || !json.success) {
                throw new Error("Request failed");
            }
            const result = json.data;
            setState({ status: "success", message: result?.message ?? "Done" });
        } catch (err) {
            setState({ status: "error", message: (err as Error).message ?? "Failed" });
        }
    };

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={execute}
                disabled={state.status === "loading"}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-150 disabled:cursor-not-allowed ${
                    state.status === "success"
                        ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
                        : state.status === "error"
                        ? "bg-red-500/10 border-red-500/20 text-red-400"
                        : "bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.09] hover:text-white hover:border-white/[0.16]"
                }`}
            >
                {state.status === "loading" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[#10B981]" />
                ) : state.status === "success" ? (
                    <CheckCircle2 className="w-3 h-3" />
                ) : state.status === "error" ? (
                    <XCircle className="w-3 h-3" />
                ) : (
                    <Zap className="w-3 h-3 text-[#10B981]" />
                )}
                {action.label}
            </button>

            {/* Inline result */}
            {(state.status === "success" || state.status === "error") && (
                <p className={`text-[10px] pl-1 ${state.status === "success" ? "text-[#10B981]/80" : "text-red-400/80"}`}>
                    {state.message}
                </p>
            )}
        </div>
    );
}

// ─── Structured response card ─────────────────────────────────────────────────

function ResponseCard({ msg }: { msg: AssistantMessage }) {
    const { insight, reasoning, recommendation, actions, _meta } = msg.response;
    const anomalies = _meta?.anomalySeverities ?? [];

    return (
        <div className="space-y-2.5">
            {anomalies.length > 0 && <AnomalyBadge meta={anomalies} />}

            {/* INSIGHT */}
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">Insight</span>
                </div>
                <p className="px-3 py-2.5 text-sm text-slate-200 leading-relaxed">{insight}</p>
            </div>

            {/* REASONING */}
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                    <Brain className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/80">Reasoning</span>
                </div>
                <p className="px-3 py-2.5 text-sm text-slate-300 leading-relaxed">{reasoning}</p>
            </div>

            {/* RECOMMENDATION */}
            <div className="rounded-xl bg-[#10B981]/[0.06] border border-[#10B981]/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#10B981]/15 bg-[#10B981]/[0.04]">
                    <ArrowRight className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#10B981]/80">Recommendation</span>
                </div>
                <p className="px-3 py-2.5 text-sm text-slate-200 leading-relaxed">{recommendation}</p>
            </div>

            {/* ACTIONS — gated by SHOW_AUTONOMY flag (requires AUTONOMY_MODE != OFF) */}
            {ADMIN_FLAGS.SHOW_AUTONOMY && actions && actions.length > 0 && (
                <div className="space-y-1.5 pt-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-0.5">Run action</p>
                    <div className="flex flex-wrap gap-1.5">
                        {actions.map((action) => (
                            <ActionButton key={action.id} action={action} />
                        ))}
                    </div>
                </div>
            )}

            {/* Provenance disclaimer */}
            <p className="text-[10px] text-slate-700 pt-0.5">
                Generated from system logs, not autonomous reasoning
            </p>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminAssistant() {
    const router                            = useRouter();
    const [open, setOpen]                   = React.useState(false);
    const [minimized, setMinimized]         = React.useState(false);
    const [messages, setMessages]           = React.useState<Message[]>([]);
    const [input, setInput]                 = React.useState("");
    const [loading, setLoading]             = React.useState(false);
    const [error, setError]                 = React.useState<string | null>(null);
    const [predictions, setPredictions]     = React.useState<Prediction[]>([]);
    const bottomRef                         = React.useRef<HTMLDivElement>(null);
    const inputRef                          = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    React.useEffect(() => {
        if (open && !minimized) {
            setTimeout(() => inputRef.current?.focus(), 120);
        }
    }, [open, minimized]);

    // Fetch predictions only when the banner is enabled (SHOW_PREDICTIONS flag)
    React.useEffect(() => {
        if (!open || !ADMIN_FLAGS.SHOW_PREDICTIONS) return;
        fetch("/api/admin/predictions", { credentials: "include" })
            .then((r) => r.json())
            .then((j: { success?: boolean; data?: { predictions?: Prediction[] } }) => {
                if (j.success && j.data?.predictions) {
                    setPredictions(j.data.predictions);
                }
            })
            .catch(() => { /* predictions are non-critical */ });
    }, [open]);

    const send = React.useCallback(async (query: string) => {
        const q = query.trim();
        if (!q || loading) return;

        setError(null);
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: q }]);
        setLoading(true);

        try {
            const csrf = await ensureCsrfToken();
            const res  = await fetch("/api/admin/assistant", {
                method:      "POST",
                credentials: "include",
                headers:     { "Content-Type": "application/json", "X-CSRF-Token": csrf },
                body:        JSON.stringify({ query: q }),
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(json?.error?.message ?? `Error ${res.status}`);
            }

            const data = await res.json() as AssistantResponse & { _meta?: { source: string; anomalyCount: number; anomalySeverities: AnomalyMeta[] } };
            setMessages((prev) => [...prev, { role: "assistant", response: data }]);
            // Revalidate server-rendered admin pages (e.g. Explainability list) after a decision is logged.
            router.refresh();
        } catch (err) {
            setError((err as Error).message ?? "Something went wrong.");
            setMessages((prev) => prev.slice(0, -1));
        } finally {
            setLoading(false);
        }
    }, [loading, router]);

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
    };

    const clearChat = () => { setMessages([]); setError(null); };

    const isEmpty = messages.length === 0;

    // ── FAB ────────────────────────────────────────────────────────────────────
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => { setOpen(true); setMinimized(false); }}
                aria-label="Open ops assistant"
                className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#10B981] hover:bg-[#0EA472] active:scale-95 shadow-lg shadow-[#10B981]/30 flex items-center justify-center transition-all duration-200 group"
            >
                <Sparkles className="w-5 h-5 text-white" />
                    <span className="absolute right-14 bg-[#0C131D] text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/[0.1] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-xl font-medium">
                        Ops Assistant
                    </span>
            </button>
        );
    }

    // ── Panel ──────────────────────────────────────────────────────────────────
    return (
        <div
            className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border border-white/[0.1] bg-[#0B1018] shadow-2xl shadow-black/60 transition-all duration-300 ease-in-out overflow-hidden ${
                minimized ? "w-72 h-14" : "w-[420px] h-[620px]"
            }`}
        >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.08] bg-[#0D1422] shrink-0">
                <div className="w-7 h-7 rounded-full bg-[#10B981]/20 border border-[#10B981]/30 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-tight tracking-tight">Ops Assistant</p>
                    {!minimized && (
                        <p className="text-[10px] text-slate-500">Answers questions from live system data</p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {messages.length > 0 && !minimized && (
                        <button type="button" onClick={clearChat} title="Clear"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button type="button" onClick={() => setMinimized((m) => !m)} title={minimized ? "Expand" : "Minimise"}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${minimized ? "rotate-180" : ""}`} />
                    </button>
                    <button type="button" onClick={() => setOpen(false)} title="Close"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {!minimized && (
                <>
                    <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.01]">
                        <p className="text-[11px] text-slate-500">
                            Responses are generated from system logs. Not autonomous analysis.
                        </p>
                    </div>
                    {/* Thread */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
                        {isEmpty && (
                            <div className="space-y-4">
                                <div className="text-center space-y-1.5 pt-2">
                                    <p className="text-sm font-semibold text-white">Ask a question</p>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Queries live DB data and returns an insight, reasoning trace, and recommendation. Reactive — not continuous.
                                    </p>
                                </div>

                                {/* Log-based trend warnings — gated by SHOW_PREDICTIONS flag */}
                                {ADMIN_FLAGS.SHOW_PREDICTIONS && (
                                    <PredictionBanner predictions={predictions} onAsk={send} />
                                )}

                                <div className="grid grid-cols-2 gap-1.5">
                                    {SUGGESTIONS.map((s) => (
                                        <button
                                            key={s.label}
                                            type="button"
                                            onClick={() => send(s.query)}
                                            disabled={loading}
                                            className="text-left px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-150 disabled:opacity-40 leading-snug"
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i}>
                                {msg.role === "user" ? (
                                    <div className="flex justify-end">
                                        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[#10B981]/12 border border-[#10B981]/20 text-sm text-white leading-relaxed">
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    <ResponseCard msg={msg} />
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#10B981]" />
                                    Fetching system data & summarising…
                                </div>
                                <div className="space-y-2">
                                    {["w-full", "w-4/5", "w-3/5"].map((w, i) => (
                                        <div key={i} className={`${w} h-3 rounded-full bg-white/[0.05] animate-pulse`} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/[0.06]">
                        <div className="flex items-end gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] focus-within:border-[#10B981]/30 transition-colors px-3 py-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder="Ask anything about the system…"
                                rows={1}
                                className="flex-1 resize-none bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none leading-relaxed max-h-28 overflow-y-auto"
                                style={{ fieldSizing: "content" } as React.CSSProperties}
                            />
                            <button
                                type="button"
                                onClick={() => send(input)}
                                disabled={!input.trim() || loading}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#10B981] text-white hover:bg-[#0EA472] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shrink-0 mb-0.5"
                            >
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-700 mt-1.5 text-center">Enter · Shift+Enter for newline</p>
                    </div>
                </>
            )}
        </div>
    );
}
