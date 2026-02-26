"use client";

import { useState, useEffect } from "react";
import { X, Navigation, Calendar, Loader2, AlertCircle } from "lucide-react";
import { updateTrip, type Trip } from "@/lib/api";
interface EditTripModalProps {
    trip: Trip;
    isOpen: boolean;
    onClose: () => void;
    onSaved: (updated: Trip) => void;
}

export function EditTripModal({ trip, isOpen, onClose, onSaved }: EditTripModalProps) {
    const [destination, setDestination] = useState(trip.destination);
    const [startDate, setStartDate] = useState(trip.startDate);
    const [endDate, setEndDate] = useState(trip.endDate);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setDestination(trip.destination);
            setStartDate(trip.startDate);
            setEndDate(trip.endDate);
            setError(null);
        }
    }, [isOpen, trip.destination, trip.startDate, trip.endDate]);

    if (!isOpen) return null;

    const isValid = destination.trim().length >= 2 && startDate && endDate && new Date(endDate) >= new Date(startDate);

    async function handleSubmit() {
        if (!isValid || isLoading) return;
        setIsLoading(true);
        setError(null);

        try {
            const updated = await updateTrip(trip.id, {
                destination: destination.trim(),
                startDate,
                endDate,
            });
            onClose();
            onSaved(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update trip. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
            <div
                className="relative w-full max-w-lg bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06] bg-white/[0.02]">
                    <h2 className="text-xl font-bold text-white tracking-tight">Edit Trip</h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-all disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

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
                                Destination
                            </label>
                            <input
                                type="text"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all disabled:opacity-50"
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
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white outline-none [color-scheme:dark] disabled:opacity-50"
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
                                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white outline-none [color-scheme:dark] disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/[0.06] bg-white/[0.02] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid || isLoading}
                        className={`px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${isValid && !isLoading ? "bg-indigo-500 hover:bg-indigo-400 text-white" : "bg-white/[0.04] text-slate-500 cursor-not-allowed"}`}
                    >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isLoading ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
