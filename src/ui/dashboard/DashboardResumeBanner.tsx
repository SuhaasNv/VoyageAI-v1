"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { loadFromStorage, clearStorage } from "../components/itinerary-flow/flowStorage";
import type { FlowState, FlowInput } from "../components/itinerary-flow/types";

interface DashboardResumeBannerProps {
    onResume: (tripId: string, input: FlowInput) => void;
}

export function DashboardResumeBanner({ onResume }: DashboardResumeBannerProps) {
    const [savedSession, setSavedSession] = useState<FlowState | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        const saved = loadFromStorage();
        if (saved) {
            setSavedSession(saved);
        }
    }, []);

    if (!savedSession || isDismissed) return null;

    const handleDismiss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDismissed(true);
        // We don't necessarily clearStorage here, just hide it for this session
        // or we could clear it if the user explicitly wants it gone. 
        // Let's clear it to be clean as per "If it's useless... remove it".
        clearStorage();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative group"
            >
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B0F19]/80 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
                    {/* Animated background flare */}
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base flex items-center gap-2">
                                Resume your planning session?
                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
                                    Draft
                                </span>
                            </h3>
                            <p className="text-zinc-400 text-sm mt-0.5">
                                You were planning a trip to <span className="text-indigo-300 font-semibold">{savedSession.input.destination}</span>. Pick up right where you left off.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
                        <button
                            onClick={() => onResume(savedSession.sessionId, savedSession.input)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] group/btn"
                        >
                            Continue Planning
                            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-all"
                            title="Dismiss Draft"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
