"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles, Loader2, AlertCircle, Zap, RefreshCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { getCsrfToken } from "@/lib/api";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestedAction {
    label: string;
    action: string;
    payload?: Record<string, unknown>;
}

interface DisplayMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    suggestedActions?: SuggestedAction[];
}

interface AIChatDrawerProps {
    tripId: string;
    rawItinerary: Itinerary | null;
    budgetTotal: number;
    initialMessages: ChatMessageDTO[];
    currentDay?: number;
    /** Called after a reoptimize or itinerary update action succeeds */
    onItineraryRefresh?: () => void;
    /** Called for map movements */
    onMapFocus?: (lat: number, lng: number, title: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIChatDrawer({
    tripId,
    rawItinerary,
    budgetTotal,
    initialMessages,
    currentDay = 1,
    onItineraryRefresh,
    onMapFocus
}: AIChatDrawerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<DisplayMessage[]>(() =>
        initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))
    );
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isReoptimizing, setIsReoptimizing] = useState(false);
    const [lastFailed, setLastFailed] = useState<{ type: "send"; text: string } | { type: "reoptimize" } | null>(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            inputRef.current?.focus();
        }
    }, [messages, isOpen]);

    // ── Send chat message ─────────────────────────────────────────────────────
    async function handleSend(overrideText?: string) {
        const text = (overrideText ?? input).trim();
        if (!text || isSending) return;

        const optimisticId = `opt-${Date.now()}`;
        setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: text }]);
        setInput("");
        setIsSending(true);
        setLastFailed(null);

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                },
                body: JSON.stringify({
                    tripId,
                    messages: [{ role: "user", content: text }],
                    currentDay,
                    currentItinerary: rawItinerary,
                }),
            });

            const json = await res.json();
            if (!json?.success) throw new Error(json?.error?.message ?? "AI response failed");

            const data = json.data ?? {};
            setMessages((prev) => [
                ...prev,
                {
                    id: `ai-${Date.now()}`,
                    role: "assistant",
                    content: data.message ?? "I couldn't generate a response. Please try again.",
                    suggestedActions: data.suggestedActions ?? [],
                },
            ]);
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
            setLastFailed({ type: "send", text });
        } finally {
            setIsSending(false);
        }
    }

    // ── Suggested action handler ──────────────────────────────────────────────
    async function handleAction(action: SuggestedAction) {
        if (action.action === "reoptimize") {
            await handleReoptimize(action.payload);
            return;
        }
        if (action.action === "apply_itinerary_update") {
            await handleApplyItineraryUpdate(action.payload);
            return;
        }
        if (action.action === "map_fly_to") {
            const loc = action.payload?.location as { lat: number, lng: number } | undefined;
            if (loc && onMapFocus) {
                onMapFocus(loc.lat, loc.lng, action.label);
            }
            return;
        }
        // For other action types: treat as a new user chat message
        setInput(action.label);
    }

    async function handleApplyItineraryUpdate(payload?: Record<string, unknown>) {
        const newItinerary = payload?.itinerary;
        if (!newItinerary) return;

        setIsReoptimizing(true);
        try {
            const res = await fetch(`/api/trips/${tripId}/itinerary`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                },
                body: JSON.stringify(newItinerary),
            });

            const json = await res.json();
            if (!json?.success) throw new Error("Failed to apply itinerary update");

            setMessages((prev) => [
                ...prev,
                {
                    id: `ai-apply-${Date.now()}`,
                    role: "assistant",
                    content: "✅ Itinerary updated successfully!",
                },
            ]);

            onItineraryRefresh?.();
        } catch {
            setLastFailed({ type: "reoptimize" });
        } finally {
            setIsReoptimizing(false);
        }
    }

    async function handleReoptimize(payload?: Record<string, unknown>) {
        setIsReoptimizing(true);
        setLastFailed(null);

        try {
            if (!rawItinerary) throw new Error("No current itinerary to reoptimize");

            const res = await fetch("/api/ai/reoptimize", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                },
                body: JSON.stringify({
                    tripId,
                    currentItinerary: rawItinerary,
                    reoptimizationReasons: ["preference_change"],
                    currentDay: 1,
                    remainingBudget: budgetTotal,
                    userFeedback: (payload?.feedback as string) ?? undefined,
                    lockedDays: [],
                }),
            });

            const json = await res.json();
            if (!json?.success) throw new Error(json?.error?.message ?? "Reoptimization failed");

            setMessages((prev) => [
                ...prev,
                {
                    id: `ai-reopt-${Date.now()}`,
                    role: "assistant",
                    content: `✅ Itinerary reoptimized. ${json.data?.aiReasoning ?? ""}`.trim(),
                },
            ]);

            onItineraryRefresh?.();
        } catch {
            setLastFailed({ type: "reoptimize" });
        } finally {
            setIsReoptimizing(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    const isBusy = isSending || isReoptimizing;

    return (
        <>
            {/* Floating button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    aria-label="Open AI chat"
                    className="fixed bottom-24 md:bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full shadow-[0_0_24px_rgba(99,102,241,0.4)] transition-all duration-200 ease-out hover:scale-[1.05] active:scale-95 animate-in fade-in zoom-in slide-in-from-bottom-4 duration-500"
                >
                    <Sparkles className="w-6 h-6 transition-transform group-hover:rotate-12" />
                </button>
            )}

            {/* Chat drawer */}
            <div
                className={`fixed md:bottom-6 right-6 z-50 w-[92vw] sm:w-[360px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col overflow-hidden transition-all duration-300 ease-out origin-bottom-right ${isOpen
                    ? "scale-100 opacity-100 bottom-24 md:bottom-6 h-[520px] max-h-[70vh]"
                    : "scale-75 opacity-0 h-0 pointer-events-none bottom-0"
                    }`}
            >
                {/* Header */}
                <div className="bg-white/[0.04] p-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Logo size="sm" />
                        <span>VoyageAI Copilot</span>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        aria-label="Close chat"
                        className="w-7 h-7 bg-white/[0.06] hover:bg-white/[0.1] rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 ease-out"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Reoptimizing overlay */}
                {isReoptimizing && (
                    <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 flex-shrink-0">
                        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                        Reoptimizing itinerary… this may take a moment.
                    </div>
                )}

                {/* Message list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-[#10B981]/10 border border-white/10 flex items-center justify-center shadow-[0_0_24px_rgba(99,102,241,0.12)]">
                                <Sparkles className="w-7 h-7 text-indigo-400" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-white">Chat history empty</p>
                                <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                                    Ask something — itinerary tweaks, local tips, budget advice.
                                </p>
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <div
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user"
                                    ? "bg-indigo-500 text-white rounded-br-sm shadow-md"
                                    : "bg-white/[0.06] text-slate-200 rounded-bl-sm border border-white/[0.08]"
                                    }`}
                            >
                                {msg.content}
                            </div>

                            {/* Suggested actions */}
                            {msg.role === "assistant" && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[85%]">
                                    {msg.suggestedActions.map((action, idx) => {
                                        const isApply = action.action === "apply_itinerary_update" || action.action === "reoptimize";
                                        const isMap = action.action === "map_fly_to";

                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handleAction(action)}
                                                disabled={isBusy}
                                                className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg border transition-all duration-200 disabled:opacity-50 ${isApply
                                                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30"
                                                    : isMap
                                                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                                                        : "bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                                                    }`}
                                            >
                                                {isApply && <Zap className="w-3 h-3" />}
                                                {action.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Typing indicator — TextShimmer sweep while AI is generating */}
                    {isSending && (
                        <div className="flex justify-start">
                            <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <TextShimmer
                                    duration={1.4}
                                    spread={3}
                                    className="text-xs font-medium [--base-color:#818cf8] [--base-gradient-color:#e0e7ff] dark:[--base-color:#818cf8] dark:[--base-gradient-color:#e0e7ff]"
                                >
                                    Thinking…
                                </TextShimmer>
                            </div>
                        </div>
                    )}

                    {/* AI error toast — friendly message + retry */}
                    {lastFailed && (
                        <div className="flex flex-col gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-3">
                            <div className="flex items-center gap-2 text-amber-300">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>AI is busy, try again</span>
                            </div>
                            <button
                                onClick={() => {
                                    const failed = lastFailed;
                                    setLastFailed(null);
                                    if (failed.type === "send") handleSend(failed.text);
                                    if (failed.type === "reoptimize") handleReoptimize();
                                }}
                                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 font-semibold hover:bg-amber-500/30 transition-colors"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Retry
                            </button>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input row */}
                <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex gap-2 flex-shrink-0">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isBusy}
                        placeholder="Ask AI to adjust plan…"
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-full px-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition-all duration-200 disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isBusy}
                        aria-label="Send message"
                        className="w-10 h-10 rounded-full bg-indigo-500 disabled:bg-white/[0.04] text-white disabled:text-slate-500 flex items-center justify-center transition-all duration-200 ease-out disabled:cursor-not-allowed hover:bg-indigo-400 active:scale-95"
                    >
                        {isSending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4 ml-0.5" />
                        )}
                    </button>
                </div>
            </div>
        </>
    );
}
