"use client";

import { useState, useLayoutEffect } from "react";
import Link from "next/link";
import { Sparkles, RefreshCw } from "lucide-react";
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

function SkeletonCard() {
    return (
        <div className="flex flex-col rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse h-full">
            <div className="h-[90px] bg-white/[0.04] w-full" />
            <div className="p-2.5 space-y-2">
                <div className="h-2.5 bg-white/[0.06] rounded w-2/3" />
                <div className="h-1.5 bg-white/[0.04] rounded w-full" />
                <div className="h-3.5 bg-white/[0.03] rounded w-3/4 mt-1" />
            </div>
        </div>
    );
}

const SESSION_KEY = "voyage:suggestions";
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h — matches server Redis TTL

function readSessionCache(): DestinationSuggestion[] | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw) as { data: DestinationSuggestion[]; ts: number };
        if (Date.now() - ts > SESSION_TTL_MS) return null;
        return data;
    } catch {
        return null;
    }
}

function writeSessionCache(data: DestinationSuggestion[]) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* non-fatal */ }
}

interface AISuggestionsCardProps {
    onPlanTrip?: (destination: string) => void;
}

export function AISuggestionsCard({ onPlanTrip }: AISuggestionsCardProps = {}) {
    // Initial state matches SSR output — no hydration mismatch.
    const [destinations, setDestinations] = useState<DestinationSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchAndCache = async (showSpinner: boolean) => {
        if (showSpinner) setIsRefreshing(true);
        try {
            const res = await fetch("/api/recommendations", { credentials: "include" });
            const data = await res.json();
            if (data.success && Array.isArray(data.data?.destinations)) {
                setDestinations(data.data.destinations);
                writeSessionCache(data.data.destinations);
            }
        } catch (error) {
            console.error("Failed to load suggestions:", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const loadDestinations = async (forceRefresh = false) => {
        if (!forceRefresh) {
            const cached = readSessionCache();
            if (cached) {
                // Cache served via useLayoutEffect — just background-refresh silently.
                void fetchAndCache(false);
                return;
            }
        }
        setIsRefreshing(true);
        await fetchAndCache(true);
    };

    // useLayoutEffect fires synchronously after hydration, before the browser paints.
    // Cache is applied before the first visible frame — no skeleton flash for returning users.
    useLayoutEffect(() => {
        const cached = readSessionCache();
        if (cached) {
            setDestinations(cached);
            setIsLoading(false);
            void fetchAndCache(false);
        } else {
            void fetchAndCache(true);
        }
    }, []);

    return (
        <div className="min-h-[280px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl transition-all hover:border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#10B981]" />
                    Suggested For You
                </h2>
                <button
                    onClick={() => loadDestinations(true)}
                    disabled={isRefreshing}
                    className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-[#10B981] transition-all disabled:opacity-50"
                    title="Refresh Suggestions"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {isLoading ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
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
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group relative flex"
                            >
                                <div className="absolute -inset-0.5 bg-gradient-to-br from-[#10B981]/0 via-[#10B981]/0 to-indigo-500/0 group-hover:from-[#10B981]/15 group-hover:via-[#10B981]/5 group-hover:to-indigo-500/15 rounded-xl blur-sm transition-all duration-500 opacity-0 group-hover:opacity-100 pointer-events-none" />
                                
                                <Link
                                    href={`/dashboard/destination/${encodeURIComponent(`${s.city}, ${s.country}`)}`}
                                    className="relative flex flex-col w-full bg-[#0B0F14]/60 hover:bg-[#131920]/90 border border-white/[0.04] hover:border-white/[0.08] rounded-xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                                >
                                    <div className="relative w-full h-[90px] overflow-hidden bg-black/20 shrink-0 border-b border-white/5">
                                        <img
                                            src={s.imageUrl ?? FALLBACK_IMAGE}
                                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out"
                                            alt={`${s.city}, ${s.country}`}
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14]/95 via-[#0B0F14]/10 to-transparent pointer-events-none" />
                                        
                                        <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                                            <div className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse" />
                                            <span className="text-[7px] font-bold text-white tracking-wide uppercase shadow-sm">
                                                {s.score > 85 ? "Top Match" : s.score > 70 ? "Great Fit" : "Trending"}
                                            </span>
                                        </div>

                                        <div className="absolute bottom-1.5 left-2.5 right-2.5 flex justify-between items-end">
                                            <div className="flex flex-col min-w-0 pr-2">
                                                <h4 className="text-sm font-bold text-white leading-tight truncate group-hover:text-[#10B981] transition-colors drop-shadow-lg">
                                                    {s.city}
                                                </h4>
                                                <p className="text-[9px] font-medium text-white/70 truncate drop-shadow-md">{s.country}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col p-2.5 flex-1 justify-between gap-1.5">
                                        <p className="text-[10px] text-zinc-400 font-medium leading-snug line-clamp-1">
                                            {s.tagline}
                                        </p>
                                        
                                        <div className="flex items-center gap-1.5 mt-auto">
                                            <span className="text-[7px] font-bold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                                                {s.tag}
                                            </span>
                                            <span className="flex items-center gap-1 text-[8px] font-medium text-[#10B981] bg-[#10B981]/[0.05] border border-[#10B981]/10 px-1.5 py-0.5 rounded truncate max-w-full flex-1">
                                                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                                <span className="truncate">Matches: {s.reason || "Interests"}</span>
                                            </span>
                                        </div>
                                    </div>

                                    {onPlanTrip && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onPlanTrip(`${s.city}, ${s.country}`);
                                            }}
                                            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center w-5 h-5 text-[#10B981] bg-[#10B981]/20 backdrop-blur-md border border-[#10B981]/40 hover:bg-[#10B981]/30 rounded-full shadow-lg"
                                        >
                                            <span className="text-xs leading-none block mb-[1px] ml-[1px]">→</span>
                                        </button>
                                    )}
                                </Link>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                ) }
            </div>
        </div>
    );
}
