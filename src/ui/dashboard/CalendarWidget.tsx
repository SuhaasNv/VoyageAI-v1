"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Trip } from "@/lib/api";

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
        const days: { date: number; isInTrip: boolean; isBoundary: boolean }[] = [];
        for (let d = 1; d <= totalDays; d++) {
            const cellDate = new Date(y, m, d);
            days.push({
                date: d,
                isInTrip: isDateInTripRanges(cellDate, trips),
                isBoundary: isDateStartOrEnd(cellDate, trips),
            });
        }
        return { year: y, month: m, days, startOffset };
    }, [viewDate, trips]);

    function prevMonth() {
        setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
    }

    function nextMonth() {
        setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
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
                {days.map(({ date, isInTrip, isBoundary }) => (
                    <div key={date} className="flex items-center justify-center">
                        <span
                            className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                                isBoundary
                                    ? "bg-[#10B981] text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                                    : isInTrip
                                        ? "bg-white/5 text-white"
                                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                            }`}
                        >
                            {date}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
