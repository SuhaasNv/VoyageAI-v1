"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Loader2, CheckCircle2, X } from "lucide-react";
import { getCsrfToken, type Trip } from "@/lib/api";

interface AICommandPaletteProps {
    onTripCreated: (trip: Trip) => void;
}

export function AICommandPalette({ onTripCreated }: AICommandPaletteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => textareaRef.current?.focus(), 50);
        } else {
            setPrompt("");
            setSuccessMsg(null);
            setErrorMsg(null);
        }
    }, [isOpen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => () => {
        if (successTimer.current) clearTimeout(successTimer.current);
        if (errorTimer.current)   clearTimeout(errorTimer.current);
    }, []);

    const submit = async () => {
        if (!prompt.trim() || isLoading) return;

        setIsLoading(true);
        setSuccessMsg(null);
        setErrorMsg(null);

        try {
            const res = await fetch("/api/ai/create-trip", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                },
                body: JSON.stringify({ text: prompt }),
            });
            const data = await res.json();

            if (res.ok && data.success && data.data) {
                onTripCreated(data.data as Trip);
                setSuccessMsg(`Trip to ${(data.data as Trip).destination} created.`);
                setPrompt("");
                successTimer.current = setTimeout(() => {
                    setIsOpen(false);
                    setSuccessMsg(null);
                }, 1800);
            } else {
                throw new Error(data.error?.message ?? "Failed to create trip");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An error occurred";
            setErrorMsg(msg);
            errorTimer.current = setTimeout(() => setErrorMsg(null), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <>
            {/* Floating trigger */}
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Open AI trip assistant"
                className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-[#10B981] flex items-center justify-center text-black shadow-[0_0_32px_rgba(16,185,129,0.45)] hover:scale-105 active:scale-95 transition-transform duration-150"
            >
                <Sparkles className="w-6 h-6" />
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => { if (!isLoading) setIsOpen(false); }}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-xl bg-[#0D1117] border border-white/[0.08] rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-[#10B981]/15 flex items-center justify-center border border-[#10B981]/20">
                                    <Sparkles className="w-4 h-4 text-[#10B981]" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white leading-none">AI Trip Assistant</h2>
                                    <p className="text-[11px] text-zinc-600 mt-0.5">Describe your trip in plain language</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                disabled={isLoading}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Input */}
                        <div className="relative">
                            <textarea
                                ref={textareaRef}
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                onKeyDown={onKeyDown}
                                placeholder={`e.g. "Trip to Bali from April 10–20, $1,800 budget, relaxed vibe"`}
                                rows={4}
                                disabled={isLoading}
                                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#10B981]/40 focus:ring-1 focus:ring-[#10B981]/30 resize-none transition-colors disabled:opacity-60"
                            />
                            <button
                                onClick={submit}
                                disabled={!prompt.trim() || isLoading}
                                className="absolute bottom-3 right-3 p-2 rounded-lg bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                {isLoading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Send className="w-4 h-4" />
                                }
                            </button>
                        </div>

                        {/* Feedback */}
                        {successMsg && (
                            <div className="flex items-center gap-2 text-xs text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-3 py-2.5 rounded-xl">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                {successMsg}
                            </div>
                        )}
                        {errorMsg && (
                            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl">
                                {errorMsg}
                            </div>
                        )}

                        <p className="text-[11px] text-zinc-700 text-center">
                            Enter to submit &middot; Shift+Enter for new line &middot; Esc to close
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
