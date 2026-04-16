"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, MapPin, Calendar } from "lucide-react";
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
        const start = Date.UTC(sy!, sm! - 1, sd!);
        const end   = Date.UTC(ey!, em! - 1, ed!);
        if (ts >= start && ts <= end) return trip;
    }
    return null;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LABELS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isDateStartOrEnd(date: Date, trips: Trip[]): boolean {
    const y  = date.getFullYear();
    const m  = date.getMonth();
    const d  = date.getDate();
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    for (const trip of trips) {
        if (ds === trip.startDate || ds === trip.endDate) return true;
    }
    return false;
}

/** Friendly short date: "Apr 8" */
function shortDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[(m! - 1)]} ${d}`;
}

/** Total trip duration in days (inclusive). */
function tripDuration(trip: Trip): number {
    const [sy, sm, sd] = trip.startDate.split("-").map(Number);
    const [ey, em, ed] = trip.endDate.split("-").map(Number);
    const start = Date.UTC(sy!, sm! - 1, sd!);
    const end   = Date.UTC(ey!, em! - 1, ed!);
    return Math.round((end - start) / 86_400_000) + 1;
}

interface HoveredInfo {
    trip:  Trip;
    /** Calendar day number (1–31) within the current view month. */
    day:   number;
    /** Viewport-relative X centre of the hovered cell. */
    x:     number;
    /** Viewport-relative top of the hovered cell. */
    y:     number;
}

interface CalendarWidgetProps {
    trips: Trip[];
}

export function CalendarWidget({ trips }: CalendarWidgetProps) {
    const [viewDate,    setViewDate]    = useState(() => new Date());
    const [hovered,     setHovered]     = useState<HoveredInfo | null>(null);
    const [mounted,     setMounted]     = useState(false);

    useEffect(() => setMounted(true), []);

    const { year, month, days, startOffset } = useMemo(() => {
        const y    = viewDate.getFullYear();
        const m    = viewDate.getMonth();
        const first = new Date(y, m, 1);
        const last  = new Date(y, m + 1, 0);
        const startOffset = first.getDay();
        const totalDays   = last.getDate();
        const days: { date: number; trip: Trip | null; isBoundary: boolean }[] = [];
        for (let d = 1; d <= totalDays; d++) {
            const cellDate = new Date(y, m, d);
            const trip     = getTripForDate(cellDate, trips);
            days.push({ date: d, trip, isBoundary: isDateStartOrEnd(cellDate, trips) });
        }
        return { year: y, month: m, days, startOffset };
    }, [viewDate, trips]);

    function prevMonth() { setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1)); }
    function nextMonth() { setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1)); }

    // ── Tooltip content (computed when hovered) ──────────────────────────────
    const tooltipInfo = useMemo(() => {
        if (!hovered) return null;
        const { trip, day } = hovered;
        const [sy, sm, sd] = trip.startDate.split("-").map(Number);
        const start    = Date.UTC(sy!, sm! - 1, sd!);
        const hoveredTs = Date.UTC(year, month, day);
        const dayNum   = Math.floor((hoveredTs - start) / 86_400_000) + 1;
        const total    = tripDuration(trip);
        return {
            destination: trip.destination,
            dayNum,
            total,
            range: `${shortDate(trip.startDate)} – ${shortDate(trip.endDate)}`,
        };
    }, [hovered, year, month]);

    // ── Tooltip portal ────────────────────────────────────────────────────────
    // Rendered via portal so it escapes the parent's backdrop-filter containing
    // block, which otherwise clips position:fixed children.
    const tooltip = (
        <AnimatePresence>
            {hovered && tooltipInfo && (
                <motion.div
                    key="calendar-tooltip"
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="fixed z-[9999] pointer-events-none"
                    style={{
                        left: hovered.x,
                        top:  hovered.y - 8,
                        transform: "translate(-50%, -100%)",
                    }}
                >
                    <div className="bg-[#0D1117] border border-white/[0.12] rounded-2xl px-3.5 py-2.5 shadow-2xl backdrop-blur-xl flex flex-col gap-1 min-w-[160px]">
                        {/* Destination */}
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Destination</span>
                        </div>
                        <div className="flex items-center gap-1.5 pl-3">
                            <MapPin className="w-3 h-3 text-[#10B981] flex-shrink-0" />
                            <span className="text-white text-xs font-bold leading-tight">{tooltipInfo.destination}</span>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/[0.06] my-0.5" />

                        {/* Day info */}
                        <div className="flex items-center gap-1.5 pl-3">
                            <Calendar className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            <span className="text-zinc-400 text-[11px]">
                                Day <span className="text-white font-semibold">{tooltipInfo.dayNum}</span>
                                <span className="text-zinc-600"> / {tooltipInfo.total}</span>
                                <span className="text-zinc-600 ml-1">· {tooltipInfo.range}</span>
                            </span>
                        </div>
                    </div>
                    {/* Arrow */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-2.5 h-2.5 bg-[#0D1117] border-r border-b border-white/[0.12] rotate-45" />
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="min-h-[320px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden transition-all hover:border-white/10">
            {/* Header */}
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

            {/* Day labels */}
            <div className="grid grid-cols-7 mb-4">
                {DAY_LABELS.map((day) => (
                    <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {day}
                    </div>
                ))}
            </div>

            {/* Date cells */}
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
                                setHovered({
                                    trip,
                                    day: date,
                                    x:   rect.left + rect.width / 2,
                                    y:   rect.top + window.scrollY,
                                });
                            }
                        }}
                        onMouseLeave={() => setHovered(null)}
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

            {/* Portal tooltip — rendered outside this container to escape backdrop-filter containing block */}
            {mounted && createPortal(tooltip, document.body)}
        </div>
    );
}
