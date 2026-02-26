"use client";

import { useState } from "react";
import { Clock, MapPin, DollarSign, GripVertical, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import type { Trip } from "@/lib/api";

interface TimelineItineraryProps {
    trip: Trip;
}

export function TimelineItinerary({ trip }: TimelineItineraryProps) {
    const [activeDay, setActiveDay] = useState(1);
    const { itinerary } = trip;

    const getEventIconColor = (type: string) => {
        switch (type) {
            case "transit": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
            case "hotel": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
            case "food": return "bg-amber-500/20 text-amber-500 border-amber-500/30";
            case "sightseeing": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
            case "entertainment": return "bg-pink-500/20 text-pink-400 border-pink-500/30";
            default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
        }
    };

    return (
        <div className="flex flex-col h-full z-10">
            <div className="flex-none p-4 overflow-x-auto border-b border-white/5 bg-transparent sticky top-[72px] z-20 hide-scrollbar flex gap-2">
                {itinerary.map((day) => (
                    <button
                        key={day.day}
                        onClick={() => setActiveDay(day.day)}
                        className={`flex flex-col items-center min-w-[70px] px-3 py-2 rounded-xl transition-all duration-200 ease-out border ${activeDay === day.day
                            ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                            : "bg-white/[0.02] text-zinc-500 border-white/5 hover:text-white hover:bg-white/[0.04]"
                            }`}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Day {day.day}</span>
                        <span className="text-sm font-semibold">{day.date.split(" ")[1]}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth">
                {itinerary.map((day) => (
                    activeDay === day.day && (
                        <div key={day.day} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="mb-6 pb-2 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-white tracking-tight">{day.title}</h2>
                                    <p className="text-xs text-zinc-500">{day.events.length} activities planned</p>
                                </div>
                            </div>

                            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-gradient-to-b before:from-[#10B981]/30 before:via-white/[0.04] before:to-transparent">
                                {day.events.map((event, i) => (
                                    <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">

                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full border shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform duration-200 ${i === 0 ? "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-110" : getEventIconColor(event.type)}`}>
                                            {i === 0 ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                        </div>

                                        <div className={`w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-4 rounded-2xl bg-white/[0.02] backdrop-blur-sm border border-white/5 transition-all duration-200 ease-out ml-4 md:ml-0 cursor-grab active:cursor-grabbing ${i === 0 ? "border-[#10B981]/20 bg-[#10B981]/5" : "hover:border-white/15 hover:bg-white/[0.04]"}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${i === 0 ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20" : "text-zinc-400 bg-white/5 border-white/5"}`}>{event.time}</span>
                                                <GripVertical className="w-4 h-4 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <h4 className="text-base font-bold text-white mb-2 leading-tight">{event.title}</h4>

                                            <div className="flex items-center justify-between mt-4">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                    <MapPin className="w-3.5 h-3.5" />
                                                    {event.location}
                                                </div>
                                                {event.cost > 0 && (
                                                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-300 bg-white/[0.06] border border-white/[0.06] px-2 py-1 rounded-lg">
                                                        <DollarSign className="w-3 h-3 text-emerald-400" />
                                                        {event.cost}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}
