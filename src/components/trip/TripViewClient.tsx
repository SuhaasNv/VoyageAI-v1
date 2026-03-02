"use client";

import { useState, useCallback, useEffect } from "react";
import { TripTopBar } from "@/components/trip/TripTopBar";
import { TimelineItinerary } from "@/components/trip/TimelineItinerary";
import { TripMap } from "@/components/trip/TripMap";
import { AIChatDrawer } from "@/components/trip/AIChatDrawer";
import type { TripDTO, ItineraryEvent } from "@/lib/services/trips";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";
import { getCsrfToken } from "@/lib/api";
import {
    analyzeTripRisks,
    flattenAlerts,
    topSeverity,
    severityCounts,
    type RiskAnalysisResult,
} from "@/lib/analysis/tripRiskEngine";
import { calculateTravelScore, type TravelScoreResult } from "@/lib/analysis/travelScore";
import { generateTripExplanation } from "@/lib/analysis/explainTrip";

import { Map as MapIcon, X, Sparkles, Loader2, CheckCircle2, Navigation2, Check, TriangleAlert, ChevronDown, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

interface TripViewClientProps {
    trip: TripDTO;
    /** Raw AI itinerary JSON stored in DB — passed directly to TripMap */
    rawItinerary: Itinerary | null;
    initialMessages: ChatMessageDTO[];
}

export function TripViewClient({ trip: initialTrip, rawItinerary: initialRaw, initialMessages }: TripViewClientProps) {
    const [trip, setTrip] = useState<TripDTO>(initialTrip);
    const [rawItinerary, setRawItinerary] = useState<Itinerary | null>(initialRaw);
    const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
    const [focusedActivity, setFocusedActivity] = useState<ItineraryEvent | null>(null);
    const [eventOrder, setEventOrder] = useState<Record<number, string[]>>({});
    const [showMobileMap, setShowMobileMap] = useState(false);
    const [mounted, setMounted] = useState(false);

    // ── Refine Trip state ──────────────────────────────────────────────────────
    const [refineInput, setRefineInput] = useState("");
    const [isRefining, setIsRefining] = useState(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [summaryOfChanges, setSummaryOfChanges] = useState<string | null>(null);

    // ── Route optimization state ───────────────────────────────────────────────
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizeError, setOptimizeError] = useState<string | null>(null);
    /** Non-null while the user is previewing the optimized route (before confirming). */
    const [optimizedPreview, setOptimizedPreview] = useState<Itinerary | null>(null);
    const [distanceSavedKm, setDistanceSavedKm] = useState<number | null>(null);
    /** Snapshot of the itinerary before optimization — used for Undo. */
    const [preOptimizeSnapshot, setPreOptimizeSnapshot] = useState<Itinerary | null>(null);
    const [isSavingOptimized, setIsSavingOptimized] = useState(false);

    // ── Risk analysis state ────────────────────────────────────────────────────
    const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysisResult | null>(null);
    const [riskDismissed, setRiskDismissed] = useState(false);
    const [riskExpanded, setRiskExpanded] = useState(false);

    // ── Travel score state ─────────────────────────────────────────────────────
    const [travelScore, setTravelScore] = useState<TravelScoreResult | null>(null);

    // ── Explainability panel state ─────────────────────────────────────────────
    const [explainOpen, setExplainOpen] = useState(false);
    const [explainBullets, setExplainBullets] = useState<string[]>([]);

    // ── Offline state ──────────────────────────────────────────────────────────
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    // Detect online/offline status and seed localStorage cache with initial data.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsOffline(!navigator.onLine);

        // Seed cache with server-provided data so it's available immediately offline.
        if (initialRaw) {
            try {
                localStorage.setItem(
                    `voyageai_trip_${initialTrip.id}`,
                    JSON.stringify({ ...initialTrip, rawItinerary: initialRaw })
                );
            } catch { /* storage quota — ignore */ }
        }

        const handleOnline  = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener("online",  handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online",  handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Run risk analysis after itinerary loads / changes — non-blocking (post-render).
    useEffect(() => {
        if (!rawItinerary) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRiskAnalysis(null);
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRiskDismissed(false);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRiskAnalysis(analyzeTripRisks(rawItinerary, trip.budget.total));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTravelScore(calculateTravelScore(rawItinerary, trip.budget.total));
    // trip.budget.total is a number — safe as dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawItinerary, trip.budget.total]);

    const handleEventsReorder = useCallback((dayNumber: number, orderedIds: string[]) => {
        setEventOrder((prev) => ({ ...prev, [dayNumber]: orderedIds }));
    }, []);

    const handleItineraryRefresh = useCallback(async () => {
        // Offline: load last cached trip from localStorage.
        if (!navigator.onLine) {
            try {
                const raw = localStorage.getItem(`voyageai_trip_${initialTrip.id}`);
                if (raw) {
                    const cached = JSON.parse(raw);
                    setTrip(cached as TripDTO);
                    setRawItinerary((cached?.rawItinerary as Itinerary) ?? null);
                }
            } catch { /* parse error — ignore */ }
            return;
        }

        try {
            const res = await fetch(`/api/trips/${initialTrip.id}`, { credentials: "include" });
            const json = await res.json();
            if (json?.success && json.data?.id && json.data?.budget) {
                setTrip(json.data as TripDTO);
                setRawItinerary((json.data?.rawItinerary as Itinerary) ?? null);
                // Cache for offline use.
                try {
                    localStorage.setItem(
                        `voyageai_trip_${initialTrip.id}`,
                        JSON.stringify(json.data)
                    );
                } catch { /* quota — ignore */ }
            }
        } catch {
            // silently ignore — user can reload
        }
    }, [initialTrip.id]);

    // ── Refine handler ─────────────────────────────────────────────────────────
    const handleRefine = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!refineInput.trim() || !rawItinerary || isRefining) return;

            setIsRefining(true);
            setRefineError(null);
            setSummaryOfChanges(null);

            try {
                const csrf = await getCsrfToken();
                const res = await fetch("/api/ai/reoptimize", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        ...(csrf ? { "x-csrf-token": csrf } : {}),
                    },
                    body: JSON.stringify({
                        tripId: initialTrip.id,
                        currentItinerary: rawItinerary,
                        reoptimizationReasons: ["preference_change"],
                        currentDay: selectedDay ?? 1,
                        remainingBudget: trip.budget.total,
                        modificationInstruction: refineInput.trim(),
                    }),
                });

                const json = await res.json();
                if (!json.success) {
                    throw new Error(json.error?.message ?? "Refinement failed. Please try again.");
                }

                setSummaryOfChanges(json.data.summaryOfChanges as string);
                setRefineInput("");
                await handleItineraryRefresh();
            } catch (err) {
                setRefineError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
                setIsRefining(false);
            }
        },
        [refineInput, rawItinerary, isRefining, initialTrip.id, selectedDay, trip.budget.total, handleItineraryRefresh]
    );

    // ── Route optimization handlers ────────────────────────────────────────────
    const handleOptimizeRoute = useCallback(async () => {
        if (!rawItinerary || isOptimizing) return;

        setIsOptimizing(true);
        setOptimizeError(null);

        try {
            const csrf = await getCsrfToken();
            const res = await fetch("/api/itinerary/optimize", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                body: JSON.stringify({ itinerary: rawItinerary }),
            });

            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error?.message ?? "Optimization failed.");
            }

            const { optimizedItinerary, totalDistanceSavedKm } = json.data as {
                optimizedItinerary: Itinerary;
                totalDistanceSavedKm: number;
            };

            setPreOptimizeSnapshot(rawItinerary);
            setOptimizedPreview(optimizedItinerary);
            setDistanceSavedKm(totalDistanceSavedKm);
            // Show the optimized route on the map immediately.
            setRawItinerary(optimizedItinerary);
        } catch (err) {
            setOptimizeError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setIsOptimizing(false);
        }
    }, [rawItinerary, isOptimizing]);

    const handleApplyOptimization = useCallback(async () => {
        if (!optimizedPreview || isSavingOptimized) return;

        setIsSavingOptimized(true);
        setOptimizeError(null);

        try {
            const csrf = await getCsrfToken();
            const res = await fetch(`/api/trips/${initialTrip.id}/itinerary`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                body: JSON.stringify(optimizedPreview),
            });

            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? "Save failed.");

            // Sync from DB so TripTopBar budget etc. reflect any updates.
            await handleItineraryRefresh();
            setOptimizedPreview(null);
            setPreOptimizeSnapshot(null);
            setDistanceSavedKm(null);
        } catch (err) {
            setOptimizeError(err instanceof Error ? err.message : "Failed to save.");
        } finally {
            setIsSavingOptimized(false);
        }
    }, [optimizedPreview, isSavingOptimized, initialTrip.id, handleItineraryRefresh]);

    const handleUndoOptimization = useCallback(() => {
        if (preOptimizeSnapshot) setRawItinerary(preOptimizeSnapshot);
        setOptimizedPreview(null);
        setPreOptimizeSnapshot(null);
        setDistanceSavedKm(null);
        setOptimizeError(null);
    }, [preOptimizeSnapshot]);

    // ── Explain toggle — regenerates on every open (cheap, deterministic) ──────
    const handleToggleExplain = useCallback(() => {
        if (!explainOpen && rawItinerary) {
            const { bullets } = generateTripExplanation({
                itinerary:      rawItinerary,
                scoreBreakdown: travelScore?.breakdown,
                risks:          riskAnalysis ?? undefined,
            });
            setExplainBullets(bullets);
        }
        setExplainOpen(v => !v);
    }, [explainOpen, rawItinerary, travelScore, riskAnalysis]);

    const mobileMapOverlay = mounted && showMobileMap && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#0B0F14] flex flex-col md:hidden">
            <div className="flex-1 w-full h-full relative">
                <TripMap rawItinerary={rawItinerary} selectedDay={selectedDay} focusedActivity={focusedActivity} eventOrder={eventOrder} />
            </div>
            <button
                onClick={() => setShowMobileMap(false)}
                className="absolute top-6 left-6 z-[10000] px-5 py-2.5 rounded-full bg-black/80 backdrop-blur-2xl border border-white/10 flex items-center gap-2 text-white shadow-2xl active:scale-95 transition-all"
                style={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
            >
                <X className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Close</span>
            </button>
        </div>,
        document.body
    );

    return (
        <div className="h-full flex flex-col overflow-hidden font-sans bg-[#0B0F14] text-white relative hide-scrollbar">
            <TripTopBar trip={trip} onTripUpdate={setTrip} />

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                {/* Timeline panel */}
                <div className="w-full md:w-[450px] lg:w-[550px] shrink-0 flex flex-col bg-white/[0.04] backdrop-blur-md border-r border-white/[0.08] h-full overflow-hidden relative z-20 hide-scrollbar shadow-[inset_-1px_0_0_rgba(255,255,255,0.03),inset_0_0_40px_rgba(0,0,0,0.18)]">

                    {/* ── Action bar ───────────────────────────────────────── */}
                    <div className="px-4 pt-3 pb-2 border-b border-white/[0.06] space-y-2 shrink-0">

                        {/* Offline banner */}
                        {isOffline && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                                <span>Offline mode — viewing cached data</span>
                            </div>
                        )}

                        {/* Trip Intelligence Score badge */}
                        {travelScore && (() => {
                            const s = travelScore.score;
                            const { density, distance, budget, diversity } = travelScore.breakdown;
                            const pill =
                                s >= 80 ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-300"
                                : s >= 60 ? "bg-amber-500/15 border-amber-500/25 text-amber-300"
                                : "bg-rose-500/15 border-rose-500/25 text-rose-300";
                            const barClr = (v: number) =>
                                v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-rose-400";
                            // Tooltip text built as a title attribute — no JS lib needed
                            const tooltip = [
                                `Density  ${density}/100`,
                                `Distance ${distance}/100`,
                                `Budget   ${budget}/100`,
                                `Variety  ${diversity}/100`,
                            ].join("\n");
                            return (
                                <div
                                    title={tooltip}
                                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border cursor-default select-none ${pill}`}
                                >
                                    <span className="text-[10px] font-medium opacity-70 whitespace-nowrap">
                                        Trip Intelligence Score
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* Mini breakdown bars */}
                                        {([
                                            ["D", density],
                                            ["Km", distance],
                                            ["$", budget],
                                            ["✦", diversity],
                                        ] as [string, number][]).map(([k, v]) => (
                                            <div key={k} className="flex flex-col items-center gap-0.5">
                                                <span className="text-[7px] opacity-40">{k}</span>
                                                <div className="w-5 h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
                                                    <div className={`h-full rounded-full ${barClr(v)}`} style={{ width: `${v}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <span className="text-sm font-bold ml-1">
                                            {s}<span className="text-[9px] font-normal opacity-50"> / 100</span>
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Refine Trip */}
                        <form onSubmit={handleRefine} className="flex gap-2">
                            <input
                                type="text"
                                value={refineInput}
                                onChange={(e) => setRefineInput(e.target.value)}
                                placeholder={isOffline ? "Unavailable offline" : "Make this more relaxed…"}
                                disabled={!rawItinerary || isRefining || isOffline}
                                className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 disabled:opacity-40 transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={!refineInput.trim() || !rawItinerary || isRefining || isOffline}
                                className="shrink-0 px-3 py-2 rounded-xl bg-[#10B981]/20 border border-[#10B981]/30 text-[#10B981] text-sm font-medium hover:bg-[#10B981]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                            >
                                {isRefining
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Sparkles className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">
                                    {isRefining ? "Refining…" : "Refine"}
                                </span>
                            </button>
                        </form>

                        {/* Optimize Route Order */}
                        {optimizedPreview ? (
                            <div className="flex items-center gap-2">
                                <Navigation2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="flex-1 text-xs text-sky-400/80 truncate">
                                    Route optimized
                                    {distanceSavedKm !== null && distanceSavedKm > 0.1
                                        ? ` · ${distanceSavedKm.toFixed(1)} km saved`
                                        : " · already optimal"}
                                </span>
                                <button
                                    onClick={handleApplyOptimization}
                                    disabled={isSavingOptimized}
                                    className="shrink-0 px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 text-xs font-medium hover:bg-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                                >
                                    {isSavingOptimized
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Check className="w-3 h-3" />}
                                    {isSavingOptimized ? "Saving…" : "Apply"}
                                </button>
                                <button
                                    onClick={handleUndoOptimization}
                                    disabled={isSavingOptimized}
                                    className="shrink-0 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs font-medium hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-40 transition-all"
                                >
                                    Undo
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleOptimizeRoute}
                                disabled={!rawItinerary || isOptimizing || isOffline}
                                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white/40 text-xs font-medium hover:bg-sky-500/10 hover:border-sky-500/20 hover:text-sky-400/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {isOptimizing
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Navigation2 className="w-3.5 h-3.5" />}
                                {isOptimizing ? "Calculating optimal route…" : "Optimize Route Order"}
                            </button>
                        )}

                        {/* ── Risk Analysis Banner ──────────────────────── */}
                        {riskAnalysis && !riskDismissed && (() => {
                            const all     = flattenAlerts(riskAnalysis);
                            if (!all.length) return null;
                            const top     = topSeverity(all)!;
                            const counts  = severityCounts(all);

                            const palette = {
                                high:   { ring: "border-rose-500/25",   bg: "bg-rose-500/8",    icon: "text-rose-400",   badge: "bg-rose-500/20 text-rose-300",   label: "text-rose-300"   },
                                medium: { ring: "border-amber-500/25",  bg: "bg-amber-500/8",   icon: "text-amber-400",  badge: "bg-amber-500/20 text-amber-300", label: "text-amber-300"  },
                                low:    { ring: "border-yellow-500/20", bg: "bg-yellow-500/6",  icon: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-300", label: "text-yellow-300" },
                            }[top];

                            const sevBadge = (sev: "low" | "medium" | "high") => ({
                                high:   "bg-rose-500/25 text-rose-300",
                                medium: "bg-amber-500/25 text-amber-300",
                                low:    "bg-yellow-500/20 text-yellow-300",
                            }[sev]);

                            const summary = [
                                counts.high   > 0 && `${counts.high} high`,
                                counts.medium > 0 && `${counts.medium} medium`,
                                counts.low    > 0 && `${counts.low} low`,
                            ].filter(Boolean).join(", ");

                            return (
                                <div className={`rounded-xl border text-xs overflow-hidden ${palette.ring} ${palette.bg}`}>
                                    {/* Header */}
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        <TriangleAlert className={`w-3.5 h-3.5 shrink-0 ${palette.icon}`} />
                                        <span className={`flex-1 font-medium ${palette.label}`}>
                                            {all.length} risk alert{all.length > 1 ? "s" : ""}
                                            <span className="text-white/30 font-normal"> · {summary}</span>
                                        </span>
                                        <button
                                            onClick={() => setRiskExpanded(v => !v)}
                                            aria-label={riskExpanded ? "Collapse" : "Expand"}
                                            className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                                        >
                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${riskExpanded ? "rotate-180" : ""}`} />
                                        </button>
                                        <button
                                            onClick={() => setRiskDismissed(true)}
                                            aria-label="Dismiss"
                                            className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>

                                    {/* Expanded alert list */}
                                    <AnimatePresence initial={false}>
                                        {riskExpanded && (
                                            <motion.div
                                                key="risk-detail"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                                style={{ overflow: "hidden" }}
                                                className="border-t border-white/[0.06]"
                                            >
                                                <div className="px-3 pb-2.5 space-y-1.5">
                                                    {all.map((alert, i) => (
                                                        <div key={i} className="flex items-start gap-2 pt-1.5">
                                                            <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded mt-px ${sevBadge(alert.severity)}`}>
                                                                {alert.severity.toUpperCase()}
                                                            </span>
                                                            <span className="text-white/60 leading-relaxed">{alert.message}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })()}

                        {/* Inline errors */}
                        {refineError && (
                            <p className="text-xs text-rose-400/90 px-1">{refineError}</p>
                        )}
                        {optimizeError && (
                            <p className="text-xs text-rose-400/90 px-1">{optimizeError}</p>
                        )}

                        {/* Refine success summary */}
                        {summaryOfChanges && !isRefining && (
                            <div className="flex gap-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-3 py-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                <p className="text-xs text-emerald-400/80 whitespace-pre-line leading-relaxed">
                                    {summaryOfChanges}
                                </p>
                            </div>
                        )}

                        {/* ── Why this itinerary? ──────────────────────────── */}
                        {rawItinerary && (
                            <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                                <button
                                    onClick={handleToggleExplain}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
                                >
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="flex-1 text-xs text-white/50 font-medium">
                                        Why this itinerary?
                                    </span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${explainOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence initial={false}>
                                    {explainOpen && explainBullets.length > 0 && (
                                        <motion.div
                                            key="explain-detail"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                            style={{ overflow: "hidden" }}
                                        >
                                            <ul className="px-3 pb-3 space-y-1.5 border-t border-white/[0.06]">
                                                {explainBullets.map((bullet, i) => (
                                                    <li key={i} className="flex items-start gap-2 pt-1.5">
                                                        <span className="shrink-0 text-indigo-400/60 mt-0.5 text-[10px]">•</span>
                                                        <span className="text-[11px] text-white/55 leading-relaxed">{bullet}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    <TimelineItinerary
                        trip={trip}
                        onRefresh={handleItineraryRefresh}
                        onDayChange={setSelectedDay}
                        onActivityFocus={setFocusedActivity}
                        onEventsReorder={handleEventsReorder}
                    />
                    {/* Soft gradient fades for depth */}
                    <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[#0B0F14]/30 to-transparent pointer-events-none z-30" />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0B0F14]/50 to-transparent pointer-events-none z-30" />
                </div>

                {/* Map panel (Desktop only) */}
                <div className="flex-1 h-full relative z-10 hidden md:block">
                    <TripMap rawItinerary={rawItinerary} selectedDay={selectedDay} focusedActivity={focusedActivity} eventOrder={eventOrder} />
                </div>

                {/* Mobile Map Portal Trigger */}
                {mobileMapOverlay}

                {/* Floating Map Toggle for Mobile */}
                {!showMobileMap && (
                    <button
                        onClick={() => setShowMobileMap(true)}
                        className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#10B981] text-white shadow-[0_8px_32px_rgba(16,185,129,0.4)] flex flex-col items-center justify-center gap-1 active:scale-90 transition-all animate-in fade-in zoom-in slide-in-from-bottom-4 duration-300"
                    >
                        <MapIcon className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-tighter">Map</span>
                    </button>
                )}
            </div>

            <AIChatDrawer
                tripId={initialTrip.id}
                rawItinerary={rawItinerary}
                budgetTotal={trip.budget.total}
                initialMessages={initialMessages}
                currentDay={selectedDay}
                onItineraryRefresh={handleItineraryRefresh}
                onMapFocus={(lat, lng, title) => setFocusedActivity({ lat, lng, title } as unknown as ItineraryEvent)}
            />
        </div>
    );
}
