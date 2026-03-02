"use client";

import { useState, useCallback, useEffect } from "react";
import { TripTopBar } from "@/components/trip/TripTopBar";
import { TimelineItinerary } from "@/components/trip/TimelineItinerary";
import { TripMap } from "@/components/trip/TripMap";
import { AIChatDrawer } from "@/components/trip/AIChatDrawer";
import type { TripDTO, ItineraryEvent } from "@/lib/services/trips";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";

interface TripViewClientProps {
    trip: TripDTO;
    /** Raw AI itinerary JSON stored in DB — passed directly to TripMap */
    rawItinerary: Itinerary | null;
    initialMessages: ChatMessageDTO[];
}

import { Map as MapIcon, X } from "lucide-react";
import { createPortal } from "react-dom";

export function TripViewClient({ trip: initialTrip, rawItinerary: initialRaw, initialMessages }: TripViewClientProps) {
    const [trip, setTrip] = useState<TripDTO>(initialTrip);
    const [rawItinerary, setRawItinerary] = useState<Itinerary | null>(initialRaw);
    const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
    const [focusedActivity, setFocusedActivity] = useState<ItineraryEvent | null>(null);
    const [eventOrder, setEventOrder] = useState<Record<number, string[]>>({});
    const [showMobileMap, setShowMobileMap] = useState(false);
    const [mounted, setMounted] = useState(false);

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

    const mobileMapOverlay = mounted && showMobileMap && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#0B0F14] flex flex-col md:hidden">
            <div className="flex-1 w-full h-full relative">
                <TripMap rawItinerary={rawItinerary} selectedDay={selectedDay} focusedActivity={focusedActivity} eventOrder={eventOrder} />
            </div>

            {/* Close button for mobile map overlay */}
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
