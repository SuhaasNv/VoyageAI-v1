"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Loader2, CheckCircle2, X, Edit2, ArrowRight, MapPin, Calendar, DollarSign, Heart, RefreshCw } from "lucide-react";
import { ensureCsrfToken, type Trip } from "@/lib/api";

interface ExtractedTripParams {
    destination?: string;
    startDate?: string;
    endDate?: string;
    budget?: { total?: number; currency?: string };
    style?: string;
    imageUrl?: string;
    interests?: string[];
    [key: string]: unknown;
}

interface FlowInput {
    tripId: string;
    destination: string;
    startDate: string;
    endDate: string;
    style?: string;
    imageUrl?: string | null;
}

interface AICommandPaletteProps {
    onTripCreated: (trip: Trip) => void;
    onFlowStart?: (tripId: string, input: FlowInput) => void;
}

const SAMPLE_PROMPTS = [
    "Weekend getaway to Paris under $1000",
    "Family trip to Kyoto this autumn",
    "Relaxing beach holiday in Maldives",
];

const STYLE_OPTIONS = ["relaxed", "creative", "exciting", "luxury", "budget"] as const;

export function AICommandPalette({ onTripCreated, onFlowStart }: AICommandPaletteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [extractedParams, setExtractedParams] = useState<ExtractedTripParams | null>(null);

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen) {
            focusTimer.current = setTimeout(() => textareaRef.current?.focus(), 50);
        } else {
            if (focusTimer.current) clearTimeout(focusTimer.current);
            setPrompt("");
            setExtractedParams(null);
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
        if (focusTimer.current)   clearTimeout(focusTimer.current);
    }, []);

    const handleExtract = async () => {
        if (!prompt.trim() || isLoading) return;
        setIsLoading(true);
        setErrorMsg(null);

        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/ai/extract-trip-params", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({ text: prompt }),
            });
            const data = await res.json();

            if (res.ok && data.success && data.data) {
                setExtractedParams(data.data);
            } else {
                throw new Error(data.error?.message ?? "Failed to extract trip details");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An error occurred";
            setErrorMsg(msg);
            errorTimer.current = setTimeout(() => setErrorMsg(null), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTrip = async () => {
        if (!extractedParams || isLoading) return;
        setIsLoading(true);
        setErrorMsg(null);

        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/trips", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({
                    destination: extractedParams.destination,
                    startDate: extractedParams.startDate,
                    endDate:   extractedParams.endDate,
                    style:     extractedParams.style,
                    budgetTotal: extractedParams.budget?.total,
                }),
            });
            const data = await res.json();

            if (res.ok && data.success && data.data) {
                const newTrip = data.data as Trip;
                onTripCreated(newTrip);
                setIsOpen(false);
                
                if (onFlowStart) {
                    onFlowStart(newTrip.id, {
                        tripId: newTrip.id,
                        destination: newTrip.destination,
                        startDate: newTrip.startDate,
                        endDate: newTrip.endDate,
                        style: extractedParams?.style,
                        imageUrl: newTrip.imageUrl ?? null,
                    });
                }
            } else {
                throw new Error(data.error?.message ?? "Failed to create trip");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An error occurred creating trip";
            setErrorMsg(msg);
            errorTimer.current = setTimeout(() => setErrorMsg(null), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const updateParams = (patch: Partial<ExtractedTripParams>) =>
        setExtractedParams(prev => (prev ? { ...prev, ...patch } : prev));

    const canCreate = !!extractedParams?.destination?.trim() && !isLoading;

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleExtract();
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
                    <div className="relative w-full max-w-xl bg-[#0D1117] border border-white/[0.08] rounded-2xl shadow-2xl p-6 flex flex-col gap-4 overflow-hidden transition-all duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between z-10 relative">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-[#10B981]/15 flex items-center justify-center border border-[#10B981]/20">
                                    <Sparkles className="w-4 h-4 text-[#10B981]" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white leading-none">AI Trip Assistant</h2>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">Describe your perfect trip</p>
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

                        {errorMsg && (
                            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl z-10 relative">
                                {errorMsg}
                            </div>
                        )}

                        {!extractedParams ? (
                            <div className="relative z-10 mt-2 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
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
                                        onClick={handleExtract}
                                        disabled={!prompt.trim() || isLoading}
                                        className="absolute bottom-3 right-3 p-2 rounded-xl bg-[#10B981] text-black hover:bg-[#10B981]/90 disabled:bg-[#10B981]/20 disabled:text-[#10B981]/50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isLoading
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Send className="w-4 h-4" />
                                        }
                                    </button>
                                </div>
                                
                                {prompt.trim().length === 0 && (
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Try these ideas</span>
                                        <div className="flex flex-wrap gap-2">
                                            {SAMPLE_PROMPTS.map((sample, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setPrompt(sample)}
                                                    className="text-[11px] font-medium text-zinc-400 bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 rounded-full px-3 py-1.5 transition-colors"
                                                >
                                                    {sample}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative mt-2 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
                                {/* Editable Preview Card */}
                                <div className="relative rounded-xl border border-white/10 overflow-hidden bg-zinc-900/50">
                                    {extractedParams.imageUrl ? (
                                        <div className="absolute inset-0 z-0 pointer-events-none">
                                            <img src={extractedParams.imageUrl} alt={extractedParams.destination ?? ""} className="w-full h-full object-cover opacity-40 mix-blend-overlay" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-[#0D1117]/85 to-[#0D1117]/40" />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-br from-indigo-500/10 to-purple-500/10" />
                                    )}

                                    <div className="relative z-10 p-5 flex flex-col gap-4">
                                        {/* Destination */}
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-[#10B981] shrink-0" />
                                            <input
                                                type="text"
                                                value={extractedParams.destination ?? ""}
                                                onChange={e => updateParams({ destination: e.target.value })}
                                                placeholder="Destination"
                                                disabled={isLoading}
                                                className="flex-1 bg-transparent border-0 border-b border-white/10 focus:border-[#10B981]/50 focus:outline-none text-lg font-bold text-white placeholder:text-zinc-500 pb-1 drop-shadow-md"
                                            />
                                        </div>

                                        {/* Dates */}
                                        <div className="flex items-start gap-2">
                                            <Calendar className="w-4 h-4 text-[#10B981] shrink-0 mt-2" />
                                            <div className="flex-1 flex flex-col gap-1">
                                                <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Dates</p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="date"
                                                        value={extractedParams.startDate ?? ""}
                                                        onChange={e => updateParams({ startDate: e.target.value })}
                                                        disabled={isLoading}
                                                        style={{ colorScheme: "dark" }}
                                                        className="flex-1 bg-black/40 border border-white/10 focus:border-[#10B981]/50 focus:outline-none rounded-lg px-2.5 py-1.5 text-sm text-white"
                                                    />
                                                    <span className="text-zinc-500 text-xs">to</span>
                                                    <input
                                                        type="date"
                                                        value={extractedParams.endDate ?? ""}
                                                        onChange={e => updateParams({ endDate: e.target.value })}
                                                        disabled={isLoading}
                                                        style={{ colorScheme: "dark" }}
                                                        className="flex-1 bg-black/40 border border-white/10 focus:border-[#10B981]/50 focus:outline-none rounded-lg px-2.5 py-1.5 text-sm text-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {/* Budget */}
                                            <div className="flex items-start gap-2">
                                                <DollarSign className="w-4 h-4 text-[#10B981] shrink-0 mt-2" />
                                                <div className="flex-1 flex flex-col gap-1">
                                                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Budget (USD)</p>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={extractedParams.budget?.total ?? ""}
                                                        onChange={e => {
                                                            const raw = e.target.value;
                                                            if (raw === "") {
                                                                updateParams({ budget: undefined });
                                                            } else {
                                                                const n = Number(raw);
                                                                updateParams({ budget: { total: n, currency: extractedParams.budget?.currency ?? "USD" } });
                                                            }
                                                        }}
                                                        placeholder="Not specified"
                                                        disabled={isLoading}
                                                        className="w-full bg-black/40 border border-white/10 focus:border-[#10B981]/50 focus:outline-none rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-500"
                                                    />
                                                </div>
                                            </div>

                                            {/* Style */}
                                            <div className="flex items-start gap-2">
                                                <Heart className="w-4 h-4 text-[#10B981] shrink-0 mt-2" />
                                                <div className="flex-1 flex flex-col gap-1">
                                                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Vibe</p>
                                                    <select
                                                        value={extractedParams.style ?? ""}
                                                        onChange={e => updateParams({ style: e.target.value || undefined })}
                                                        disabled={isLoading}
                                                        style={{ colorScheme: "dark" }}
                                                        className="w-full bg-black/40 border border-white/10 focus:border-[#10B981]/50 focus:outline-none rounded-lg px-2.5 py-1.5 text-sm text-white capitalize"
                                                    >
                                                        <option value="">Flexible</option>
                                                        {STYLE_OPTIONS.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-1 z-10 relative">
                                    <button
                                        onClick={() => setExtractedParams(null)}
                                        disabled={isLoading}
                                        className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <Edit2 className="w-4 h-4 text-zinc-400" />
                                        Edit Prompt
                                    </button>
                                    <button
                                        onClick={handleExtract}
                                        disabled={!prompt.trim() || isLoading}
                                        title="Re-run AI with your original prompt"
                                        className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 text-zinc-400 ${isLoading ? "animate-spin" : ""}`} />
                                        Regenerate
                                    </button>
                                    <button
                                        onClick={handleCreateTrip}
                                        disabled={!canCreate}
                                        className="flex-1 px-4 py-2.5 bg-[#10B981] hover:bg-[#10B981]/90 text-black text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                            <>
                                                Create Trip
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
