"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Loader2, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { getCsrfToken } from "@/lib/api";

interface TravelDNAOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const BUDGET_RANGES = ["Budget ($)", "Moderate ($$)", "Luxury ($$$)"];
const TRAVEL_STYLES = ["Relaxing/Wellness", "Adventure/Outdoors", "Culture/History", "Food & Drink", "Nightlife"];
const TRAVEL_PACES = ["Slow/Relaxed", "Moderate", "Fast/Packed"];
const INTERESTS = ["Beaches", "Mountains", "Cities", "Nature", "Museums", "Shopping", "Festivals", "Architecture"];
const REGIONS = ["North America", "South America", "Europe", "Asia", "Africa", "Middle East", "Oceania"];

export function TravelDNAOnboardingModal({ isOpen, onClose }: TravelDNAOnboardingModalProps) {
    const [budget, setBudget] = useState(BUDGET_RANGES[1]);
    const [style, setStyle] = useState(TRAVEL_STYLES[0]);
    const [pace, setPace] = useState(TRAVEL_PACES[1]);
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#10B981', '#6366f1', '#ffffff']
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleSelection = (item: string, list: string[], setList: (v: string[]) => void) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    async function handleSubmit() {
        setIsLoading(true);
        setError(null);

        const data = {
            budget,
            style,
            pace,
            interests: selectedInterests,
            regions: selectedRegions
        };

        try {
            const res = await fetch('/api/preferences', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify({ data })
            });

            const result = await res.json();
            if (!result.success) {
                throw new Error(result.error?.message || "Failed to save preferences");
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
            <div
                className="relative w-[95vw] md:w-full max-w-2xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06] relative bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 flex items-center justify-center flex-shrink-0 border border-[#10B981]/20">
                            <Sparkles className="w-5 h-5 text-[#10B981]" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Discover Your Travel DNA</h2>
                            <p className="text-xs text-slate-400">Tell us how you like to travel. We&apos;ll tailor everything.</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6 hide-scrollbar">
                    {error && (
                        <div className="flex items-center gap-2.5 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300">Budget Range</label>
                                <select
                                    value={budget}
                                    onChange={e => setBudget(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                >
                                    {BUDGET_RANGES.map(b => (
                                        <option key={b} value={b} className="bg-zinc-900 text-white">{b}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300">Travel Style</label>
                                <select
                                    value={style}
                                    onChange={e => setStyle(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                >
                                    {TRAVEL_STYLES.map(s => (
                                        <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300">Travel Pace</label>
                                <select
                                    value={pace}
                                    onChange={e => setPace(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                >
                                    {TRAVEL_PACES.map(p => (
                                        <option key={p} value={p} className="bg-zinc-900 text-white">{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="pt-2 space-y-3">
                            <label className="text-sm font-semibold text-slate-300">Interests</label>
                            <div className="flex flex-wrap gap-2">
                                {INTERESTS.map(interest => (
                                    <button
                                        key={interest}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => toggleSelection(interest, selectedInterests, setSelectedInterests)}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ease-out disabled:opacity-50 ${selectedInterests.includes(interest)
                                            ? "bg-[#10B981]/20 border-[#10B981]/50 text-[#10B981]"
                                            : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                            }`}
                                    >
                                        {interest}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 space-y-3">
                            <label className="text-sm font-semibold text-slate-300">Preferred Regions</label>
                            <div className="flex flex-wrap gap-2">
                                {REGIONS.map(region => (
                                    <button
                                        key={region}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => toggleSelection(region, selectedRegions, setSelectedRegions)}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ease-out disabled:opacity-50 ${selectedRegions.includes(region)
                                            ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
                                            : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                            }`}
                                    >
                                        {region}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/[0.06] bg-white/[0.02] flex justify-end items-center">
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ease-out flex items-center gap-2 ${!isLoading
                            ? "bg-[#10B981] hover:bg-[#10B981]/90 text-zinc-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02]"
                            : "bg-white/[0.04] text-slate-500 cursor-not-allowed"
                            }`}
                    >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isLoading ? "Saving Profile..." : "Complete Profile"}
                    </button>
                </div>
            </div>
        </div>
    );
}
