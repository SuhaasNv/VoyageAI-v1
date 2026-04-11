"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Sparkles, Utensils, History, Map } from "lucide-react";
import Link from "next/link";
import { use } from "react";

interface DestinationInfo {
    description: string;
    culture: string;
    history: string;
    food: string;
    topAttractions: string[];
    bestTimeToVisit: string;
    imageUrl: string | null;
    name: string;
}

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80";

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Icon className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            </div>
            <div className="text-zinc-300 leading-relaxed space-y-4 font-medium text-[15px]">
                {children}
            </div>
        </div>
    );
}

export default function DestinationPage({ params }: { params: Promise<{ name: string }> }) {
    // React 19 Next.js params are a Promise
    const resolvedParams = use(params);
    const router = useRouter();
    const destinationName = decodeURIComponent(resolvedParams.name);

    // Lazy initialisers read sessionStorage synchronously on first render so
    // we avoid setState calls at the top of the effect.
    const sessionKey = `voyage:dest:${destinationName}`;
    const [info, setInfo] = useState<DestinationInfo | null>(() => {
        try {
            const cached = sessionStorage.getItem(sessionKey);
            return cached ? (JSON.parse(cached) as DestinationInfo) : null;
        } catch { return null; }
    });
    const [isLoading, setIsLoading] = useState<boolean>(() => {
        try { return !sessionStorage.getItem(sessionKey); } catch { return true; }
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If we already have data from sessionStorage cache, nothing to do.
        if (info) return;
        fetch(`/api/ai/destination-info?name=${encodeURIComponent(destinationName)}`, {
            credentials: "include",
        })
            .then(res => {
                if (!res.ok) {
                    if (res.status === 429) throw new Error("Too many requests. Please try again in a minute.");
                    throw new Error("Failed to load destination details.");
                }
                return res.json();
            })
            .then(data => {
                if (data.success && data.data) {
                    setInfo(data.data);
                    try { sessionStorage.setItem(sessionKey, JSON.stringify(data.data)); } catch { /* non-fatal */ }
                } else {
                    throw new Error(data.error?.message || "Failed to parse destination info.");
                }
            })
            .catch(err => {
                setError((err as Error).message);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [destinationName]);

    return (
        <div className="h-full overflow-y-auto scroll-smooth hide-scrollbar relative">
            <div className="absolute top-6 left-6 md:left-10 z-10">
                <button
                    onClick={() => router.back()}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-all hover:scale-105"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
            </div>

            {isLoading ? (
                <div className="min-h-full flex flex-col items-center justify-center space-y-6">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-t-2 border-[#10B981] animate-spin"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-[#10B981] animate-pulse" />
                    </div>
                    <p className="text-white/70 font-medium animate-pulse">Researching {destinationName}...</p>
                </div>
            ) : error ? (
                <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-6">
                        <MapPin className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Oops!</h2>
                    <p className="text-zinc-400 mb-6 max-w-md">{error}</p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>
            ) : info ? (
                <div className="pb-20">
                    {/* Hero Section */}
                    <div className="relative h-[40vh] md:h-[50vh] w-full isolate">
                        <div className="absolute inset-0 z-[-1]">
                            <img
                                src={info.imageUrl ?? FALLBACK_IMAGE}
                                alt={destinationName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                                }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#0A0A0A] pointer-events-none" />
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 max-w-[1440px] mx-auto">
                            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4 drop-shadow-md">
                                {destinationName}
                            </h1>
                            <p className="text-lg md:text-xl text-white/90 font-medium max-w-3xl drop-shadow-sm leading-relaxed">
                                {info.description}
                            </p>
                        </div>
                    </div>

                    {/* Content Max Width Container */}
                    <div className="max-w-[1440px] mx-auto p-6 md:p-10 space-y-8 -mt-6">
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <Section icon={Map} title="Culture & Vibe">
                                    {info.culture}
                                </Section>

                                <Section icon={History} title="History">
                                    {info.history}
                                </Section>

                                <Section icon={Utensils} title="Cuisine">
                                    {info.food}
                                </Section>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-3xl p-6 relative overflow-hidden shadow-xl sticky top-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                                            <Sparkles className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-white tracking-tight">Top Attractions</h2>
                                    </div>
                                    <ul className="space-y-4">
                                        {info.topAttractions.map((attraction, idx) => (
                                            <li key={idx} className="flex gap-3 text-[15px] font-medium text-zinc-300">
                                                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                                                    {idx + 1}
                                                </div>
                                                <span className="mt-0.5">{attraction}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <hr className="border-white/5 my-6" />

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                            <Clock className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-white tracking-tight">Best Time to Visit</h2>
                                    </div>
                                    <p className="text-zinc-300 font-medium text-[15px] leading-relaxed">
                                        {info.bestTimeToVisit}
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            ) : null}
        </div>
    );
}
