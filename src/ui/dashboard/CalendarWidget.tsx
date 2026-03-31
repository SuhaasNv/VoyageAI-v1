"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Trip } from "@/lib/api";

function getTripForDate(date: Date, trips: Trip[]): Trip | null {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const ts = Date.UTC(y, m, d);
    for (const trip of trips) {
        const [sy, sm, sd] = trip.startDate.split("-").map(Number);
        const [ey, em, ed] = trip.endDate.split("-").map(Number);
        const start = Date.UTC(sy, sm - 1, sd);
        const end = Date.UTC(ey, em - 1, ed);
        if (ts >= start && ts <= end) return trip;
    }
    return null;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isDateInTripRanges(date: Date, trips: Trip[]): boolean {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const ts = Date.UTC(y, m, d);
    for (const trip of trips) {
        const [sy, sm, sd] = trip.startDate.split("-").map(Number);
        const [ey, em, ed] = trip.endDate.split("-").map(Number);
        const start = Date.UTC(sy, sm - 1, sd);
        const end = Date.UTC(ey, em - 1, ed);
        if (ts >= start && ts <= end) return true;
    }
    return false;
}

function isDateStartOrEnd(date: Date, trips: Trip[]): boolean {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    for (const trip of trips) {
        if (ds === trip.startDate || ds === trip.endDate) return true;
    }
    return false;
}

interface CalendarWidgetProps {
    trips: Trip[];
}

export function CalendarWidget({ trips }: CalendarWidgetProps) {
    const [viewDate, setViewDate] = useState(() => new Date());

    const { year, month, days, startOffset } = useMemo(() => {
        const y = viewDate.getFullYear();
        const m = viewDate.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        const startOffset = first.getDay();
        const totalDays = last.getDate();
        const days: { date: number; trip: Trip | null; isBoundary: boolean }[] = [];
        for (let d = 1; d <= totalDays; d++) {
            const cellDate = new Date(y, m, d);
            const trip = getTripForDate(cellDate, trips);
            days.push({
                date: d,
                trip,
                isBoundary: isDateStartOrEnd(cellDate, trips),
            });
        }
        return { year: y, month: m, days, startOffset };
    }, [viewDate, trips]);

    const [hoveredTrip, setHoveredTrip] = useState<{ trip: Trip; x: number; y: number } | null>(null);

    function prevMonth() {
        setViewDate((d: Date) => new Date(d.getFullYear(), d.getMonth() - 1));
    }

    function nextMonth() {
        setViewDate((d: Date) => new Date(d.getFullYear(), d.getMonth() + 1));
    }

    return (
        <div className="min-h-[320px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden transition-all hover:border-white/10">
            <div className="flex items-center justify-between mb-6">
                <button
                    type="button"
                    onClick={prevMonth}
                    className="w-8 h-8 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-white font-bold tracking-wide">
                    {MONTH_NAMES[month]} {year}
                </div>
                <button
                    type="button"
                    onClick={nextMonth}
                    className="w-8 h-8 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-7 mb-4">
                {DAY_LABELS.map((day) => (
                    <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-y-3">
                {[...Array(startOffset)].map((_, i) => (
                    <div key={`pad-${i}`} className="flex items-center justify-center" />
                ))}
                {days.map(({ date, trip, isBoundary }) => (
                    <div 
                        key={date} 
                        className="flex items-center justify-center relative"
                        onMouseEnter={(e) => {
                            if (trip) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredTrip({ trip, x: rect.left + rect.width / 2, y: rect.top });
                            }
                        }}
                        onMouseLeave={() => setHoveredTrip(null)}
                    >
                        <span
                            className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold cursor-pointer transition-colors z-10 ${
                                isBoundary
                                    ? "bg-[#10B981] text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                                    : trip
                                        ? "bg-[#10B981]/20 text-[#10B981]"
                                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                            }`}
                        >
                            {date}
                        </span>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {hoveredTrip && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: -45, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="fixed z-[100] pointer-events-none"
                        style={{ left: hoveredTrip.x, transform: "translateX(-50%)", top: hoveredTrip.y }}
                    >
                        <div className="bg-[#0B0F19] border border-white/10 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
                            <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider leading-none mb-1">Upcoming Trip</span>
                                <span className="text-white text-xs font-bold flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#10B981]" />
                                    {hoveredTrip.trip.destination}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
