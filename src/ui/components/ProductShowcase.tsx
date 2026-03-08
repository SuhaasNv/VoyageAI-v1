"use client";

import { ContainerScroll } from "@/ui/components/ui/container-scroll-animation";
import { Clock, MapPin, Utensils, Camera, ShoppingBag, Palmtree } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Static preview data — no fetching, no state
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITIES = [
    {
        time: "09:00",
        name: "Sacred Monkey Forest",
        type: "Sightseeing",
        cost: "$8",
        Icon: Camera,
        active: true,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
    },
    {
        time: "11:30",
        name: "Tegallalang Rice Terrace",
        type: "Cultural",
        cost: "$5",
        Icon: Palmtree,
        active: false,
        color: "text-sky-400",
        bg: "bg-sky-500/10",
        border: "border-sky-500/20",
    },
    {
        time: "13:30",
        name: "Warung Babi Guling",
        type: "Dining",
        cost: "$12",
        Icon: Utensils,
        active: false,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
    },
    {
        time: "16:00",
        name: "Ubud Art Market",
        type: "Shopping",
        cost: "$20",
        Icon: ShoppingBag,
        active: false,
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
    },
];

const MAP_PINS = [
    { label: "Sacred Monkey Forest", top: "28%", left: "38%", pulse: false, emerald: false },
    { label: "Rice Terrace",          top: "52%", left: "22%", pulse: false, emerald: false },
    { label: "Warung Babi Guling",    top: "68%", left: "55%", pulse: false, emerald: false },
    { label: "You are here",          top: "38%", left: "62%", pulse: true,  emerald: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard preview — renders inside the 3-D scroll card
// ─────────────────────────────────────────────────────────────────────────────

function TripDashboardPreview() {
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
                    {["D1", "D2", "D3", "D4"].map((d, i) => (
                        <button
                            key={d}
                            className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-semibold transition-colors ${
                                i === 1
                                    ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30"
                                    : "bg-white/[0.04] text-slate-500 border border-white/[0.06]"
                            }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                {/* Activities */}
                <div className="flex-1 overflow-hidden px-2.5 py-2 space-y-1.5">
                    {ACTIVITIES.map((act) => {
                        const { Icon } = act;
                        return (
                            <div
                                key={act.name}
                                className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                                    act.active
                                        ? "bg-[#10B981]/5 border-[#10B981]/20"
                                        : "bg-white/[0.02] border-white/[0.05]"
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
                                {act.active && (
                                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Budget bar */}
                <div className="px-3 py-2.5 border-t border-white/[0.06]">
                    <div className="flex justify-between text-[9px] text-slate-500 mb-1.5">
                        <span>Day budget</span>
                        <span className="text-white/60">$45 / $65</span>
                    </div>
                    <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-[#f48c06] to-amber-300"
                            style={{ width: "69%" }}
                        />
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[8px] text-emerald-400/70">✦ On budget</span>
                    </div>
                </div>
            </div>

            {/* ── Right: map view ─────────────────────────────────────────── */}
            <div className="flex-1 relative overflow-hidden">
                {/* Destination photo as map bg */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=75"
                    alt="Bali rice terraces"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                />
                {/* Dark vignette overlay */}
                <div className="absolute inset-0 bg-[#0B0F14]/30" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F14]/40 via-transparent to-[#0B0F14]/50" />

                {/* Route SVG */}
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    <polyline
                        points="38,28 22,52 55,68 62,38"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="0.6"
                        strokeDasharray="2 1.5"
                        strokeLinecap="round"
                        opacity="0.6"
                    />
                </svg>

                {/* Location pins */}
                {MAP_PINS.map((pin) => (
                    <div
                        key={pin.label}
                        className="absolute flex items-center gap-1.5 px-2 py-1 rounded-full border backdrop-blur-md"
                        style={{
                            top: pin.top,
                            left: pin.left,
                            transform: "translate(-50%, -50%)",
                            background: pin.emerald ? "rgba(16,185,129,0.15)" : "rgba(0,0,0,0.55)",
                            borderColor: pin.emerald ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.12)",
                        }}
                    >
                        <MapPin
                            className={`w-2 h-2 shrink-0 ${pin.emerald ? "text-emerald-400" : "text-[#f48c06]"}`}
                        />
                        <span
                            className={`text-[8px] font-medium whitespace-nowrap ${
                                pin.emerald ? "text-emerald-300" : "text-white/90"
                            }`}
                        >
                            {pin.label}
                        </span>
                        {pin.pulse && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                    </div>
                ))}

                {/* AI insight chip */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
                    <span className="text-[#f48c06] text-xs">✦</span>
                    <span className="text-[9px] text-slate-300">Route optimized · 3.2 km saved</span>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section title
// ─────────────────────────────────────────────────────────────────────────────

function ShowcaseTitle() {
    return (
        <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f48c06]" />
                <span className="text-xs font-medium text-slate-300">Built for modern explorers</span>
            </div>

            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] text-white">
                Your next adventure,
                <br />
                <span
                    className="bg-clip-text text-transparent"
                    style={{
                        backgroundImage: "linear-gradient(90deg, #f48c06 0%, #e8a44a 50%, #f48c06 100%)",
                        backgroundSize: "200% auto",
                    }}
                >
                    planned by AI.
                </span>
            </h2>

            <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                Day-by-day itineraries, live map sync, smart budget tracking
                and route optimization — all in one intelligent view.
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductShowcase section
// ─────────────────────────────────────────────────────────────────────────────

export function ProductShowcase() {
    return (
        <section className="relative bg-[#0A0D12] overflow-x-hidden">
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
