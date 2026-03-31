"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, MapPin, RefreshCw, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DestinationSuggestion {
    city: string;
    country: string;
    region: string;
    tag: string;
    tagline: string;
    score: number;
    reason: string;
    imageUrl: string | null;
}

const FALLBACK_IMAGE =
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=200&q=80";

function SkeletonRow() {
    return (
        <div className="flex items-center gap-4 animate-pulse">
            <div className="w-20 h-16 rounded-xl bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/[0.06] rounded w-3/4" />
                <div className="h-2 bg-white/[0.04] rounded w-1/2" />
                <div className="h-2 bg-white/[0.04] rounded w-1/4" />
            </div>
        </div>
    );
}

export function AISuggestionsCard() {
    const [destinations, setDestinations] = useState<DestinationSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadDestinations = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch("/api/suggestions");
            const data = await res.json();
            if (data.success && Array.isArray(data.data?.destinations)) {
                setDestinations(data.data.destinations);
            }
        } catch (error) {
            console.error("Failed to load suggestions:", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadDestinations();
    }, []);

    return (
        <div className="min-h-[280px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl transition-all hover:border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#10B981]" />
                    Suggested For You
                </h2>
                <button 
                    onClick={loadDestinations}
                    disabled={isRefreshing}
                    className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-[#10B981] transition-all disabled:opacity-50"
                    title="Refresh Suggestions"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="flex flex-col gap-5">
                {isLoading ? (
                    <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </>
                ) : destinations.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                        Complete your Travel DNA to get personalised suggestions.
                    </p>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {destinations.map((s, idx) => (
                            <motion.div
                                key={`${s.city}-${s.country}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Link
                                    href={`/dashboard/destination/${encodeURIComponent(`${s.city}, ${s.country}`)}`}
                                    className="group flex items-center gap-4 cursor-pointer"
                                >
                                    <div className="relative w-20 h-16 rounded-xl overflow-hidden shrink-0">
                                        <img
                                            src={s.imageUrl ?? FALLBACK_IMAGE}
                                            className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500"
                                            alt={`${s.city}, ${s.country}`}
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex flex-col justify-center overflow-hidden flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-sm font-bold text-white truncate transition-colors group-hover:text-[#10B981]">
                                                {s.city}, {s.country}
                                            </h4>
                                            <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/20">
                                                <Info className="w-2.5 h-2.5 text-[#10B981]" />
                                                <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-tighter">Personalised</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-zinc-500 font-medium mt-0.5">
                                            <span className="truncate">{s.tagline}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[10px] font-bold text-white bg-white/5 border border-white/5 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                                {s.tag}
                                            </span>
                                            <span className="text-[10px] text-[#10B981] font-bold italic truncate">
                                                {s.reason}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                ) }
            </div>
        </div>
    );
}
