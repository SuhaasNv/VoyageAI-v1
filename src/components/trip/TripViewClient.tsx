"use client";

import { useState, useCallback } from "react";
import { TripTopBar } from "@/components/trip/TripTopBar";
import { TimelineItinerary } from "@/components/trip/TimelineItinerary";
import { TripMap } from "@/components/trip/TripMap";
import { AIChatDrawer } from "@/components/trip/AIChatDrawer";
import type { TripDTO } from "@/lib/services/trips";
import type { Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";

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

    return (
        <div className="h-full flex flex-col overflow-hidden font-sans bg-[#0B0F14] text-white">
            <TripTopBar trip={trip} onTripUpdate={setTrip} />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Timeline panel */}
                <div className="w-full md:w-[450px] lg:w-[550px] h-full relative z-20 shrink-0 flex flex-col bg-white/[0.02] backdrop-blur-sm border-r border-white/5">
                    <TimelineItinerary
                        trip={trip}
                        onRefresh={handleItineraryRefresh}
                        onDayChange={setSelectedDay}
                    />
                </div>

                {/* Map panel */}
                <div className="flex-1 h-full relative z-10 hidden md:block">
                    <TripMap rawItinerary={rawItinerary} selectedDay={selectedDay} />
                </div>
            </div>

            <AIChatDrawer
                tripId={initialTrip.id}
                rawItinerary={rawItinerary}
                budgetTotal={trip.budget.total}
                initialMessages={initialMessages}
                onItineraryRefresh={handleItineraryRefresh}
            />
        </div>
    );
}
