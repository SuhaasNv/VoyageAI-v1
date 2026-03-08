"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertCircle } from "lucide-react";
import { deleteTrip, type Trip } from "@/lib/api";

interface DeleteTripConfirmModalProps {
    trip: Trip;
    isOpen: boolean;
    onClose: () => void;
    onDeleted: () => void;
}

export function DeleteTripConfirmModal({
    trip,
    isOpen,
    onClose,
    onDeleted,
}: DeleteTripConfirmModalProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!isOpen || !mounted) return null;

    async function handleDelete() {
        if (isDeleting) return;
        setIsDeleting(true);
        setError(null);

        try {
            await deleteTrip(trip.id);
            onClose();
            onDeleted();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete trip. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    }

    const modal = (
        <div className="fixed inset-0 z-[9999] flex min-h-screen min-w-full items-center justify-center bg-black/50 backdrop-blur-md p-4 overflow-y-auto">
            <div
                className="relative w-full max-w-md flex-shrink-0 bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06] bg-white/[0.02]">
                    <h2 className="text-xl font-bold text-white tracking-tight">Delete Trip</h2>
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-all disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2.5 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <p className="text-slate-300 leading-relaxed">
                        Delete <span className="font-semibold text-white">&quot;{trip.title}&quot;</span>? This will permanently remove the trip, its itineraries, and chat history. This cannot be undone.
                    </p>
                </div>

                <div className="p-6 border-t border-white/[0.06] bg-white/[0.02] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isDeleting ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
