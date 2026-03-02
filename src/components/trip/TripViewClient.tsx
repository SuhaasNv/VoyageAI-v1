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

import { Map as MapIcon, X, Sparkles, Loader2, CheckCircle2, Navigation2, Check } from "lucide-react";
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

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    const handleEventsReorder = useCallback((dayNumber: number, orderedIds: string[]) => {
        setEventOrder((prev) => ({ ...prev, [dayNumber]: orderedIds }));
    }, []);

    const handleItineraryRefresh = useCallback(async () => {
        try {
            const res = await fetch(`/api/trips/${initialTrip.id}`, { credentials: "include" });
            const json = await res.json();
            if (json?.success && json.data?.id && json.data?.budget) {
                setTrip(json.data as TripDTO);
                setRawItinerary((json.data?.rawItinerary as Itinerary) ?? null);
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

                        {/* Refine Trip */}
                        <form onSubmit={handleRefine} className="flex gap-2">
                            <input
                                type="text"
                                value={refineInput}
                                onChange={(e) => setRefineInput(e.target.value)}
                                placeholder="Make this more relaxed…"
                                disabled={!rawItinerary || isRefining}
                                className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 disabled:opacity-40 transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={!refineInput.trim() || !rawItinerary || isRefining}
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
                                disabled={!rawItinerary || isOptimizing}
                                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white/40 text-xs font-medium hover:bg-sky-500/10 hover:border-sky-500/20 hover:text-sky-400/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {isOptimizing
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Navigation2 className="w-3.5 h-3.5" />}
                                {isOptimizing ? "Calculating optimal route…" : "Optimize Route Order"}
                            </button>
                        )}

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
