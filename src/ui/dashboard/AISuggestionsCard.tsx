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
                                <div className="group flex items-center gap-3">
                                    <Link
                                        href={`/dashboard/destination/${encodeURIComponent(`${s.city}, ${s.country}`)}`}
                                        className="flex items-center gap-4 flex-1 min-w-0"
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
                                                <div className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/20">
                                                    <span className="text-[9px] font-bold text-[#10B981] tabular-nums">{Math.round(s.score)}% match</span>
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
                                    {onPlanTrip && (
                                        <button
                                            onClick={() => onPlanTrip(`${s.city}, ${s.country}`)}
                                            className="opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 hover:bg-[#10B981]/20 px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                                        >
                                            Plan this →
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                ) }
            </div>
        </div>
    );
}
