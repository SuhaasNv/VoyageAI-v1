"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TripTopBar } from "@/ui/components/trip/TripTopBar";
import { TimelineItinerary } from "@/ui/components/trip/TimelineItinerary";
import { TripMap } from "@/ui/maps/TripMap";
import { AIChatDrawer } from "@/ui/chat/AIChatDrawer";
import type { TripDTO, ItineraryEvent } from "@/lib/services/trips";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";
import {
    analyzeTripRisks,
    flattenAlerts,
    topSeverity,
    severityCounts,
    type RiskAnalysisResult,
} from "@/lib/analysis/tripRiskEngine";

import { Map as MapIcon, X, Sparkles, TriangleAlert, ChevronDown, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { ExportDrawer } from "@/ui/components/trip/ExportDrawer";
import { ItineraryCreationFlow } from "@/ui/components/itinerary-flow/ItineraryCreationFlow";
import type { FlowInput } from "@/ui/components/itinerary-flow/types";

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


    // ── Risk analysis state ────────────────────────────────────────────────────
    const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysisResult | null>(null);
    const [riskDismissed, setRiskDismissed] = useState(false);
    const [riskExpanded, setRiskExpanded] = useState(false);


    // ── Offline state ──────────────────────────────────────────────────────────
    const [isOffline, setIsOffline] = useState(false);

    // ── Export drawer state ────────────────────────────────────────────────────
    const [showExportDrawer, setShowExportDrawer] = useState(false);

    // ── Landing-flow auto-launch ───────────────────────────────────────────────
    // When the user arrives from the hero "Create trip" → login flow, rawItinerary
    // is null (trip record exists, agents haven't run). We detect ?fromLanding=1
    // in the URL client-side (no Suspense needed — dynamic route, runs post-mount).
    const [showFlow, setShowFlow] = useState(false);
    const hasLaunchedFlowRef = useRef(false);
    // Style preference forwarded from the landing extraction — stored in a ref so
    // it's available synchronously when the overlay first renders.
    const flowStyleRef = useRef<string | undefined>(undefined);

    useEffect(() => {
         
        setMounted(true);
    }, []);

    // Open the agent pipeline automatically when landing-flow context is present
    // and no itinerary has been generated yet. Fires exactly once per mount.
    useEffect(() => {
        if (initialRaw || hasLaunchedFlowRef.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("fromLanding") !== "1") return;
        flowStyleRef.current = params.get("style") ?? undefined;
        hasLaunchedFlowRef.current = true;
         
        setShowFlow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect online/offline status and seed localStorage cache with initial data.
    useEffect(() => {
         
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
             
            setRiskAnalysis(null);
            return;
        }
         
        setRiskDismissed(false);

        setRiskAnalysis(analyzeTripRisks(rawItinerary, trip.budget.total));
    // trip.budget.total is a number — safe as dep
     
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
            <TripTopBar trip={trip} onTripUpdate={setTrip} onShareExport={() => setShowExportDrawer(true)} />

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                {/* Timeline panel */}
                <div className="w-full md:w-[450px] lg:w-[550px] shrink-0 flex flex-col bg-white/[0.04] backdrop-blur-md border-r border-white/[0.08] h-full overflow-hidden relative z-20 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03),inset_0_0_40px_rgba(0,0,0,0.18)]">

                    {/* ── Intelligence tools + offline banner ── */}
                    <div className="shrink-0 border-b border-white/[0.06] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ maxHeight: "clamp(160px, 30vh, 260px)", scrollbarWidth: "none" }}>
                        <div className="px-4 py-2 space-y-2">

                            {/* Offline banner */}
                            {isOffline && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                                    <span>Offline mode — viewing cached data</span>
                                </div>
                            )}


                            {/* ── Risk Analysis Banner ──────────────────────── */}
                            {riskAnalysis && !riskDismissed && (() => {
                                const all     = flattenAlerts(riskAnalysis);
                                if (!all.length) return null;
                                const top     = topSeverity(all)!;
                                const counts  = severityCounts(all);

                                const palette = {
                                    high:   { ring: "border-rose-500/25",   bg: "bg-rose-500/8",   icon: "text-rose-400",   label: "text-rose-300"   },
                                    medium: { ring: "border-amber-500/25",  bg: "bg-amber-500/8",  icon: "text-amber-400",  label: "text-amber-300"  },
                                    low:    { ring: "border-yellow-500/20", bg: "bg-yellow-500/6", icon: "text-yellow-400", label: "text-yellow-300" },
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


                        </div>
                    </div>

                    {/* ── Zone 3: Timeline — fills all remaining height ────────── */}
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        <TimelineItinerary
                            trip={trip}
                            onRefresh={handleItineraryRefresh}
                            onDayChange={setSelectedDay}
                            onActivityFocus={setFocusedActivity}
                            onEventsReorder={handleEventsReorder}
                        />
                        {/* Soft gradient fade at the very bottom of the timeline */}
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0B0F14]/60 to-transparent pointer-events-none z-30" />
                    </div>
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

            {/* Export / Share drawer */}
            <AnimatePresence>
                {showExportDrawer && (
                    <ExportDrawer
                        trip={trip}
                        rawItinerary={rawItinerary}
                        onClose={() => setShowExportDrawer(false)}
                    />
                )}
            </AnimatePresence>

            {/* Draft recovery overlay — shown when pipeline never completed */}
            {trip.pipelineStatus === "draft" && !rawItinerary && !showFlow && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0F14]/75 backdrop-blur-sm">
                    <div className="max-w-sm w-full mx-4 bg-[#0F1520] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                                <TriangleAlert className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">This itinerary is not ready yet</h3>
                                <p className="text-xs text-zinc-500">{trip.destination}</p>
                            </div>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            We were still building your trip.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowFlow(true)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#10B981]/20 border border-[#10B981]/30 text-[#10B981] text-sm font-semibold hover:bg-[#10B981]/30 transition-all"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Resume generation
                            </button>
                            <button
                                onClick={() => {
                                    try { localStorage.removeItem("voyageai_flow_session_v2"); } catch { /* ignore */ }
                                    setShowFlow(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.1] text-sm text-slate-300 hover:bg-white/[0.04] transition-all"
                            >
                                Start over
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Agent pipeline overlay — auto-launched for trips arriving from the landing page */}
            {showFlow && (() => {
                const flowInput: FlowInput = {
                    tripId: initialTrip.id,
                    destination: initialTrip.destination,
                    startDate: initialTrip.startDate,
                    imageUrl: initialTrip.imageUrl,
                    endDate: initialTrip.endDate,
                    style: flowStyleRef.current ?? trip.style,
                };
                return (
                    <ItineraryCreationFlow
                        tripId={initialTrip.id}
                        input={flowInput}
                        onComplete={(_tripId: string) => {
                            setShowFlow(false);
                            window.history.replaceState({}, "", `/dashboard/trip/${initialTrip.id}`);
                            void handleItineraryRefresh();
                        }}
                        onClose={() => {
                            setShowFlow(false);
                            window.history.replaceState({}, "", `/dashboard/trip/${initialTrip.id}`);
                        }}
                    />
                );
            })()}
        </div>
    );
}
