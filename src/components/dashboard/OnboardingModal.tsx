"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { X, Loader2, Sparkles } from "lucide-react";
import { completeOnboarding, type OnboardPreferences } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const TRAVEL_STYLES = ["Adventure", "Culture", "Relaxation", "Foodie", "Luxury", "Budget", "Nature", "City"];
const PACE_OPTIONS = [
    { value: "slow" as const, label: "Slow & relaxed" },
    { value: "moderate" as const, label: "Balanced" },
    { value: "fast" as const, label: "Packed & active" },
];
const BUDGET_OPTIONS = [
    { value: "budget" as const, label: "Budget" },
    { value: "mid-range" as const, label: "Mid-range" },
    { value: "luxury" as const, label: "Luxury" },
];

function fireConfetti() {
    const count = 200;
    const defaults = { origin: { y: 0.7 }, zIndex: 9999 };
    function fire(particleRatio: number, opts: confetti.Options) {
        confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) });
    }
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
}

interface OnboardingModalProps {
    isOpen: boolean;
}

export function OnboardingModal({ isOpen }: OnboardingModalProps) {
    const { setOnboarded } = useAuthStore();
    const [travelStyles, setTravelStyles] = useState<string[]>([]);
    const [pacePreference, setPacePreference] = useState<"slow" | "moderate" | "fast">("moderate");
    const [budgetTier, setBudgetTier] = useState<"budget" | "mid-range" | "luxury">("mid-range");
    const [interests, setInterests] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [confettiFired, setConfettiFired] = useState(false);

    useEffect(() => {
        if (isOpen && !confettiFired) {
            fireConfetti();
            setConfettiFired(true);
        }
    }, [isOpen, confettiFired]);

    function toggleStyle(s: string) {
        setTravelStyles((prev) =>
            prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 5 ? [...prev, s] : prev
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsLoading(true);
        try {
            const prefs: OnboardPreferences = {
                travelStyles,
                pacePreference,
                budgetTier,
                interests: interests.length > 0 ? interests : undefined,
            };
            await completeOnboarding(prefs);
            setOnboarded();
        } catch {
            // keep modal open on error
        } finally {
            setIsLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div
                className="relative w-full max-w-lg bg-[#0B0F14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#10B981]" />
                        <h2 className="text-xl font-bold text-white">Welcome! Set your preferences</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => {}}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400"
                        disabled
                        aria-hidden
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Travel styles</label>
                        <div className="flex flex-wrap gap-2">
                            {TRAVEL_STYLES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => toggleStyle(s)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                        travelStyles.includes(s)
                                            ? "bg-[#10B981] text-white"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Pace</label>
                        <div className="flex gap-2">
                            {PACE_OPTIONS.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => setPacePreference(o.value)}
                                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                        pacePreference === o.value
                                            ? "bg-[#10B981] text-white"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Budget tier</label>
                        <div className="flex gap-2">
                            {BUDGET_OPTIONS.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => setBudgetTier(o.value)}
                                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                        budgetTier === o.value
                                            ? "bg-[#10B981] text-white"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#10B981] hover:bg-[#10B981]/90 text-white font-semibold disabled:opacity-60"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
