"use client";

import { useState } from "react";
import { ContainerScroll } from "@/ui/components/ui/container-scroll-animation";
import {
    Clock, MapPin, Utensils, Camera, ShoppingBag,
    Palmtree, Plane, Waves, Landmark, Home,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Activity {
    time: string;
    name: string;
    cost: string;
    Icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
}

interface PinData {
    label: string;
    top: string;
    left: string;
}

interface DayData {
    activities: Activity[];
    budget: { spent: number; total: number };
    image: string;
    pins: PinData[];           // pins[i] corresponds to activities[i]
    routePath: string;         // SVG path d string (viewBox 0 0 100 100)
    insight: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static per-day data
// ─────────────────────────────────────────────────────────────────────────────

const DAYS: DayData[] = [
    {
        // D1 — Arrival
        activities: [
            { time: "14:00", name: "Ngurah Rai Arrival",  cost: "$0",   Icon: Plane,       color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20"     },
            { time: "16:30", name: "Ubud Villa Check-in", cost: "$120", Icon: Home,        color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
            { time: "19:00", name: "Warung Sopa Dinner",  cost: "$18",  Icon: Utensils,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
            { time: "21:00", name: "Ubud Night Market",   cost: "$10",  Icon: ShoppingBag, color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
        ],
        budget: { spent: 148, total: 200 },
        image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=75",
        pins: [
            { label: "Airport",      top: "68%", left: "72%" },
            { label: "Ubud Villa",   top: "28%", left: "25%" },
            { label: "Warung Sopa",  top: "56%", left: "43%" },
            { label: "Night Market", top: "40%", left: "60%" },
        ],
        routePath: "M 72 68 L 25 28 L 43 56 L 60 40",
        insight: "15.4 km · 42 min drive",
    },
    {
        // D2 — Ubud Culture
        activities: [
            { time: "09:00", name: "Sacred Monkey Forest", cost: "$8",  Icon: Camera,      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            { time: "11:30", name: "Tegallalang Terrace",  cost: "$5",  Icon: Palmtree,    color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20"     },
            { time: "13:30", name: "Warung Babi Guling",   cost: "$12", Icon: Utensils,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
            { time: "16:00", name: "Ubud Art Market",      cost: "$20", Icon: ShoppingBag, color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
        ],
        budget: { spent: 45, total: 65 },
        image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=75",
        pins: [
            { label: "Monkey Forest", top: "28%", left: "38%" },
            { label: "Rice Terrace",  top: "52%", left: "22%" },
            { label: "Babi Guling",   top: "68%", left: "55%" },
            { label: "Art Market",    top: "38%", left: "62%" },
        ],
        routePath: "M 38 28 L 22 52 L 55 68 L 62 38",
        insight: "Route optimized · 3.2 km saved",
    },
    {
        // D3 — Temple Circuit
        activities: [
            { time: "07:00", name: "Tanah Lot Temple",    cost: "$5",  Icon: Landmark,    color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20"    },
            { time: "10:00", name: "Besakih Temple",      cost: "$15", Icon: Landmark,    color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
            { time: "13:00", name: "Local Warung Lunch",  cost: "$8",  Icon: Utensils,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
            { time: "16:00", name: "Tirta Empul",         cost: "$3",  Icon: Waves,       color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20"    },
        ],
        budget: { spent: 31, total: 60 },
        image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=75",
        pins: [
            { label: "Tanah Lot",    top: "65%", left: "18%" },
            { label: "Besakih",      top: "25%", left: "65%" },
            { label: "Warung Lunch", top: "50%", left: "42%" },
            { label: "Tirta Empul",  top: "35%", left: "30%" },
        ],
        routePath: "M 18 65 L 65 25 L 42 50 L 30 35",
        insight: "23.1 km total · 1h 10min",
    },
    {
        // D4 — Beach Day
        activities: [
            { time: "08:00", name: "Seminyak Beach",    cost: "$0",  Icon: Waves,       color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20"     },
            { time: "11:00", name: "Surf Lesson",       cost: "$35", Icon: Waves,       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            { time: "14:00", name: "Jimbaran Seafood",  cost: "$25", Icon: Utensils,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
            { time: "17:00", name: "GWK Cultural Park", cost: "$12", Icon: Camera,      color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
        ],
        budget: { spent: 72, total: 100 },
        image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=75",
        pins: [
            { label: "Seminyak",     top: "35%", left: "20%" },
            { label: "Surf Break",   top: "58%", left: "30%" },
            { label: "Jimbaran Bay", top: "70%", left: "65%" },
            { label: "GWK Park",     top: "28%", left: "57%" },
        ],
        routePath: "M 20 35 L 30 58 L 65 70 L 57 28",
        insight: "18.7 km total · 35 min",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Interactive dashboard preview
// ─────────────────────────────────────────────────────────────────────────────

function TripDashboardPreview() {
    // Default: D2 (index 1) active, first activity selected — matches original screenshot
    const [activeDay, setActiveDay] = useState(1);
    const [activeActivityIdx, setActiveActivityIdx] = useState(0);

    const day = DAYS[activeDay];
    const budgetPct = Math.round((day.budget.spent / day.budget.total) * 100);

    const handleDayChange = (idx: number) => {
        if (idx === activeDay) return;
        setActiveDay(idx);
        setActiveActivityIdx(0);
    };

    return (
        <div className="w-full h-full flex overflow-hidden select-none">

            {/* ── Left: timeline sidebar ──────────────────────────────────── */}
            <div className="w-[42%] md:w-[38%] shrink-0 flex flex-col bg-white/[0.025] border-r border-white/[0.06] overflow-hidden">

                {/* Trip header */}
                <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                    <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Active Trip</p>
                    <p className="text-white font-semibold text-xs md:text-sm leading-tight">Bali, Indonesia</p>
                    <p className="text-[9px] text-slate-500 mt-0.5">Dec 12 – Dec 19 · 7 days</p>
                </div>

                {/* Day tab strip */}
                <div className="flex gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
                    {(["D1", "D2", "D3", "D4"] as const).map((d, i) => (
                        <button
                            key={d}
                            onClick={() => handleDayChange(i)}
                            className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-semibold transition-colors cursor-pointer ${
                                i === activeDay
                                    ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30"
                                    : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:bg-white/[0.07] hover:text-slate-400"
                            }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                {/* Activities — animated swap on day change */}
                <div className="flex-1 overflow-hidden px-2.5 py-2">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeDay}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="space-y-1.5"
                        >
                            {day.activities.map((act, i) => {
                                const { Icon } = act;
                                const isActive = i === activeActivityIdx;
                                return (
                                    <motion.div
                                        key={act.name}
                                        onClick={() => setActiveActivityIdx(i)}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.04, duration: 0.18 }}
                                        className={`flex items-center gap-2 p-2 rounded-xl border transition-colors cursor-pointer ${
                                            isActive
                                                ? "bg-[#10B981]/5 border-[#10B981]/20"
                                                : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.09]"
                                        }`}
                                    >
                                        <div className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center border ${act.bg} ${act.border}`}>
                                            <Icon className={`w-3 h-3 ${act.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] md:text-[10px] text-white font-medium truncate leading-tight">
                                                {act.name}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Clock className="w-2 h-2 text-slate-600" />
                                                <span className="text-[8px] text-slate-500">{act.time}</span>
                                                <span className="text-[8px] text-slate-600">·</span>
                                                <span className="text-[8px] text-slate-500">{act.cost}</span>
                                            </div>
                                        </div>
                                        {isActive && (
                                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                                        )}
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Budget bar — re-fills from zero on day change */}
                <div className="px-3 py-2.5 border-t border-white/[0.06]">
                    <div className="flex justify-between text-[9px] text-slate-500 mb-1.5">
                        <span>Day budget</span>
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={activeDay}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-white/60"
                            >
                                ${day.budget.spent} / ${day.budget.total}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                    <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                        <motion.div
                            key={activeDay}
                            className="h-full rounded-full bg-gradient-to-r from-[#f48c06] to-amber-300"
                            initial={{ width: "0%" }}
                            animate={{ width: `${budgetPct}%` }}
                            transition={{ duration: 0.65, ease: "easeOut", delay: 0.15 }}
                        />
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[8px] text-emerald-400/70">✦ On budget</span>
                    </div>
                </div>
            </div>

            {/* ── Right: map view ─────────────────────────────────────────── */}
            <div className="flex-1 relative overflow-hidden">

                {/* Destination photo */}
                <Image
                    src={day.image}
                    alt="Bali destination"
                    fill
                    className="object-cover"
                    draggable={false}
                />

                {/* Dark overlays */}
                <div className="absolute inset-0 bg-[#0B0F14]/30" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F14]/40 via-transparent to-[#0B0F14]/50" />

                {/* Route SVG — redraws (pathLength 0→1) whenever day changes */}
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    <motion.path
                        key={`route-${activeDay}`}
                        d={day.routePath}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="0.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.65 }}
                        transition={{
                            pathLength: { duration: 0.9, ease: "easeInOut" },
                            opacity:    { duration: 0.2 },
                        }}
                    />
                </svg>

                {/* Location pins — stagger in on day change, update style on activity change */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`pins-${activeDay}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                    >
                        {day.pins.map((pin, i) => {
                            const isActive = i === activeActivityIdx;
                            return (
                                <motion.div
                                    key={pin.label}
                                    initial={{ scale: 0.7, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: i * 0.09, duration: 0.22, ease: "easeOut" }}
                                    onClick={() => setActiveActivityIdx(i)}
                                    className="absolute flex items-center gap-1.5 px-2 py-1 rounded-full border backdrop-blur-md cursor-pointer transition-colors duration-200"
                                    style={{
                                        top: pin.top,
                                        left: pin.left,
                                        transform: "translate(-50%, -50%)",
                                        background: isActive
                                            ? "rgba(16,185,129,0.15)"
                                            : "rgba(0,0,0,0.55)",
                                        borderColor: isActive
                                            ? "rgba(16,185,129,0.35)"
                                            : "rgba(255,255,255,0.12)",
                                    }}
                                >
                                    <MapPin
                                        className={`w-2 h-2 shrink-0 ${isActive ? "text-emerald-400" : "text-[#f48c06]"}`}
                                    />
                                    <span
                                        className={`text-[8px] font-medium whitespace-nowrap ${
                                            isActive ? "text-emerald-300" : "text-white/90"
                                        }`}
                                    >
                                        {isActive ? "You are here" : pin.label}
                                    </span>
                                    {isActive && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                    )}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>

                {/* AI insight chip — swaps on day change */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`insight-${activeDay}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.25, delay: 0.35 }}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10"
                    >
                        <span className="text-[#f48c06] text-xs">✦</span>
                        <span className="text-[9px] text-slate-300">{day.insight}</span>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section title (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function ShowcaseTitle() {
    return (
        <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f48c06]" />
                <span className="text-xs font-medium text-slate-300">Trip planning, reimagined</span>
            </div>

            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] text-white">
                Go anywhere.
                <br />
                <span
                    className="bg-clip-text text-transparent"
                    style={{
                        backgroundImage: "linear-gradient(90deg, #f48c06 0%, #e8a44a 50%, #f48c06 100%)",
                        backgroundSize: "200% auto",
                    }}
                >
                    Plan nothing.
                </span>
            </h2>

            <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                Describe your dream trip and VoyageAI builds the full itinerary —
                day-by-day stops, optimized routes, real-time budget tracking.
                Ready in seconds.
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductShowcase section (unchanged wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export function ProductShowcase() {
    return (
        <section
            id="about"
            className="relative scroll-mt-28 bg-[#0A0D12] overflow-x-hidden"
        >
            {/* Ambient background glows */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#f48c06]/[0.04] rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute top-1/3 right-0 w-[400px] h-[600px] bg-sky-900/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[400px] bg-[#0f2922]/40 rounded-full blur-[100px] pointer-events-none" />

            <ContainerScroll titleComponent={<ShowcaseTitle />}>
                <TripDashboardPreview />
            </ContainerScroll>
        </section>
    );
}
