import { TripTopBar } from "@/components/trip/TripTopBar";
import { TimelineItinerary } from "@/components/trip/TimelineItinerary";
import { InteractiveMap } from "@/components/trip/InteractiveMap";
import { AIChatDrawer } from "@/components/trip/AIChatDrawer";
import { getTripById } from "@/lib/api";

export default async function TripViewPage({ params }: { params: { id: string } }) {
    const trip = await getTripById(params.id);

    return (
        <div className="h-screen flex flex-col overflow-hidden font-sans bg-[#0B0F14] text-white">
            <TripTopBar trip={trip} />

            <div className="flex-1 flex overflow-hidden relative">
                <div className="w-full md:w-[450px] lg:w-[550px] h-full relative z-20 shrink-0 flex flex-col bg-white/[0.02] backdrop-blur-sm border-r border-white/5">
                    <TimelineItinerary trip={trip} />
                </div>

                <div className="flex-1 h-full relative z-10 hidden md:block">
                    <InteractiveMap />
                </div>
            </div>

            <AIChatDrawer />
        </div>
    );
}
