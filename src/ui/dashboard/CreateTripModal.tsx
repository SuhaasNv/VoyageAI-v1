"use client";

import { useState } from "react";
import { X, PlaneTakeoff, Navigation, Calendar, Loader2, AlertCircle } from "lucide-react";
import { createTrip } from "@/lib/api";
import type { FlowInput } from "@/ui/components/itinerary-flow/types";

const VIBES = [
    { label: "Relaxing", style: "relaxed" },
    { label: "Adventure", style: "adventure" },
    { label: "Culture", style: "balanced" },
    { label: "Foodie", style: "balanced" },
    { label: "Luxury", style: "luxury" },
    { label: "Budget", style: "budget" },
];

interface CreateTripModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** When provided, launches the flow instead of redirecting directly. */
    onFlowStart?: (tripId: string, input: FlowInput) => void;
}

export function CreateTripModal({ isOpen, onClose, onFlowStart }: CreateTripModalProps) {
    const [destination, setDestination] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const isValid = destination.trim().length >= 2 && startDate && endDate;

    async function handleSubmit() {
        if (!isValid || isLoading) return;
        setIsLoading(true);
        setError(null);

        try {
            const trip = await createTrip({ destination: destination.trim(), startDate, endDate });

            if (onFlowStart) {
                // Launch the full agent pipeline flow
                const style = VIBES.find((v) => v.label === selectedVibe)?.style;
                onFlowStart(trip.id, {
                    tripId: trip.id,
                    destination: destination.trim(),
                    startDate,
                    endDate,
                    style,
                });
                onClose();
            } else {
                // Fallback: close without redirect (parent handles navigation)
                onClose();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create trip. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-md p-4" style={{ zIndex: 9998 }}>
            <div
                className="relative w-[95vw] md:w-full max-w-lg bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06] relative bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0 border border-indigo-500/20">
                            <PlaneTakeoff className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Create New Trip</h2>
                            <p className="text-xs text-slate-400">Plan smarter with AI capabilities</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 ease-out disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2.5 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <Navigation className="w-4 h-4 text-indigo-400" />
                                Where to?
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Tokyo, Japan or French Riviera"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 outline-none transition-all duration-200 disabled:opacity-50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-indigo-400" />
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 [color-scheme:dark] disabled:opacity-50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-indigo-400" />
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 [color-scheme:dark] disabled:opacity-50"
                                />
                            </div>
                        </div>

                        {/* Travel Vibe — now stateful */}
                        <div className="pt-4 border-t border-white/[0.06] space-y-3">
                            <label className="text-sm font-semibold text-slate-300">Travel Vibe</label>
                            <div className="flex flex-wrap gap-2">
                                {VIBES.map(({ label }) => {
                                    const isSelected = selectedVibe === label;
                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() => setSelectedVibe((v) => (v === label ? null : label))}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ease-out disabled:opacity-50 ${
                                                isSelected
                                                    ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                                                    : "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/[0.06] bg-white/[0.02] flex justify-between items-center">
                    <span className="text-xs text-slate-500">
                        {onFlowStart ? "Launches AI Pipeline →" : "Step 1 of 3"}
                    </span>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all duration-200 ease-out disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!isValid || isLoading}
                            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ease-out flex items-center gap-2 ${
                                isValid && !isLoading
                                    ? "bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.02]"
                                    : "bg-white/[0.04] text-slate-500 cursor-not-allowed"
                            }`}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isLoading ? "Creating..." : "Generate Itinerary"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
