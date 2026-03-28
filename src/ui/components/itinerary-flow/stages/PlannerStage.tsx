"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MapPin, Sparkles, ChevronDown, Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import type { StageProps, TripContext } from "../types";

// ─── Data ─────────────────────────────────────────────────────────────────────

const ARRIVAL_ACTIVITIES = [
    { emoji: "😌", label: "Relax & Settle In" },
    { emoji: "🌆", label: "City Walk" },
    { emoji: "🍽️", label: "Local Dinner" },
    { emoji: "🏨", label: "Check-in & Rest" },
    { emoji: "🛍️", label: "Evening Shopping" },
    { emoji: "🌃", label: "Night Life" },
];

const DEPARTURE_MORNING = [
    { emoji: "🌆", label: "City Tour" },
    { emoji: "🛍️", label: "Shopping" },
    { emoji: "☕", label: "Free Time" },
    { emoji: "🏛️", label: "Museum Visit" },
    { emoji: "🏖️", label: "Beach / Park" },
    { emoji: "🍽️", label: "Last Meal Out" },
];

const DAY_THEMES = [
    { emoji: "🏛️", label: "Culture & Landmarks" },
    { emoji: "🌿", label: "Nature & Relaxation" },
    { emoji: "🥘", label: "Local Life & Markets" },
    { emoji: "💎", label: "Hidden Gems" },
    { emoji: "🧗", label: "Adventure & Thrills" },
    { emoji: "☕", label: "Leisure & Free Time" },
    { emoji: "🌆", label: "City Sightseeing" },
    { emoji: "🛍️", label: "Shopping & Souvenirs" },
    { emoji: "🍽️", label: "Food & Culinary" },
    { emoji: "🎨", label: "Art & Culture" },
];

// Cycling accent hex colors for day cards (indigo → amber → purple → emerald → sky → pink)
const CARD_ACCENT_COLORS = ["#6366f1", "#f59e0b", "#a855f7", "#10b981", "#0ea5e9", "#ec4899"];

function getThemeEmoji(theme: string): string {
    // Exact match first
    const exact = DAY_THEMES.find((t) => t.label === theme);
    if (exact) return exact.emoji;
    // Keyword-based fallback so LLM variations still get the right emoji
    const l = theme.toLowerCase();
    if (l.includes("culture") || l.includes("landmark") || l.includes("heritage") || l.includes("historic")) return "🏛️";
    if (l.includes("nature") || l.includes("park") || l.includes("beach") || l.includes("outdoor")) return "🌿";
    if (l.includes("food") || l.includes("culinary") || l.includes("dine") || l.includes("eat") || l.includes("gastro")) return "🍽️";
    if (l.includes("market") || l.includes("local life") || l.includes("neighbourhood") || l.includes("neighborhood")) return "🥘";
    if (l.includes("hidden") || l.includes("gem") || l.includes("secret") || l.includes("off-the-beaten")) return "💎";
    if (l.includes("adventure") || l.includes("thrill") || l.includes("hike") || l.includes("sport") || l.includes("active")) return "🧗";
    if (l.includes("leisure") || l.includes("free") || l.includes("relax") || l.includes("slow")) return "☕";
    if (l.includes("city") || l.includes("urban") || l.includes("sight") || l.includes("tour")) return "🌆";
    if (l.includes("shop") || l.includes("souvenir") || l.includes("bazaar") || l.includes("mall")) return "🛍️";
    if (l.includes("art") || l.includes("museum") || l.includes("gallery") || l.includes("exhibit")) return "🎨";
    if (l.includes("orient") || l.includes("arrival") || l.includes("settle") || l.includes("check-in")) return "🛬";
    if (l.includes("depart") || l.includes("last day") || l.includes("farewell")) return "🛫";
    if (l.includes("discover") || l.includes("explor") || l.includes("day trip") || l.includes("excursion")) return "🗺️";
    return "🗺️";
}


// ─── Dropdown ─────────────────────────────────────────────────────────────────
// Full-screen backdrop as the portal root — clicking it closes the dropdown.
// The menu is a CHILD of the backdrop, so stopPropagation on the menu prevents
// backdrop's onClick from firing when clicking inside the menu.

interface DropdownOption { emoji: string; label: string }

function PortalDropdown({
    options,
    value,
    onChange,
}: {
    options: DropdownOption[];
    value: string;
    onChange: (v: string) => void;
}) {
    const [open, setOpen]       = useState(false);
    const [mounted, setMounted] = useState(false);
    const triggerRef            = useRef<HTMLButtonElement>(null);

    useEffect(() => { setMounted(true); }, []);

    // Close on scroll so the menu doesn't drift from the trigger
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [open]);

    function toggle(e: React.MouseEvent) {
        e.stopPropagation();
        setOpen((prev) => !prev);
    }

    // Compute position from the ref on every render so it always reflects current scroll
    const rect = open && triggerRef.current ? triggerRef.current.getBoundingClientRect() : null;

    const current = options.find((o) => o.label === value) ?? options[0];

    return (
        <>
            {/* Trigger */}
            <button
                ref={triggerRef}
                onClick={toggle}
                type="button"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-indigo-300 transition-colors"
            >
                <span className="text-base leading-none">{current.emoji}</span>
                <span>{current.label}</span>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {/* Portal: full-screen backdrop wraps the menu so stopPropagation works */}
            {mounted && open && rect && createPortal(
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 99998 }}
                    onClick={() => setOpen(false)}
                >
                    {/* Menu — child of backdrop; stopPropagation prevents backdrop close */}
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: "fixed",
                            top: rect.bottom + 8,
                            left: Math.min(rect.left, window.innerWidth - 246),
                            minWidth: Math.max(rect.width, 230),
                            zIndex: 99999,
                            background: "#0d1018",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 16,
                            overflow: "hidden",
                            boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
                        }}
                    >
                        <div style={{ padding: 6, maxHeight: 260, overflowY: "auto" }}>
                            {options.map((opt) => (
                                <button
                                    key={opt.label}
                                    type="button"
                                    onClick={() => { onChange(opt.label); setOpen(false); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        width: "100%",
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        fontSize: 13,
                                        textAlign: "left",
                                        cursor: "pointer",
                                        border: "none",
                                        background: value === opt.label ? "rgba(99,102,241,0.2)" : "transparent",
                                        color: value === opt.label ? "#c7d2fe" : "#94a3b8",
                                        fontWeight: value === opt.label ? 600 : 400,
                                        transition: "background 0.1s",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (value !== opt.label)
                                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (value !== opt.label)
                                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                    }}
                                >
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>{opt.emoji}</span>
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlannerStageProps extends StageProps<TripContext> {
    onSubmitFeedback: (feedback: string) => void;
}

// ─── PlannerStage ─────────────────────────────────────────────────────────────

export function PlannerStage({
    input,
    result,
    meta,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onSubmitFeedback,
}: PlannerStageProps) {
    const prefersReduced = useReducedMotion();

    const [localResult,      setLocalResult]      = useState<TripContext | null>(result);
    const [styleIdx,         setStyleIdx]          = useState(0);
    const [origStyleIdx,     setOrigStyleIdx]      = useState(0);
    const [paceIdx,          setPaceIdx]           = useState(1);
    const [origPaceIdx,      setOrigPaceIdx]       = useState(1);
    const [arrivalSuffix,    setArrivalSuffix]     = useState(ARRIVAL_ACTIVITIES[0].label);
    const [departureMorning, setDepartureMorning]  = useState(DEPARTURE_MORNING[0].label);
    const [feedback,         setFeedback]          = useState("");
    const [heroError,        setHeroError]         = useState(false);

    // Sync when a new result arrives from the planner agent
    const prevPlannerResultRef = useRef<TripContext | null>(null);
    if (result !== prevPlannerResultRef.current) {
        prevPlannerResultRef.current = result;
        if (result) {
            setLocalResult(result);
            const sIdx = ["relaxed","balanced","adventure","luxury","budget"]
                .indexOf(result.preferences?.style ?? "balanced");
            if (sIdx >= 0) { setStyleIdx(sIdx); setOrigStyleIdx(sIdx); }
            const pIdx = ["slow","moderate","fast"]
                .indexOf(result.preferences?.pace ?? "moderate");
            if (pIdx >= 0) { setPaceIdx(pIdx); setOrigPaceIdx(pIdx); }
        }
    }

    // Any user edit → show Re-plan instead of "Looks good"
    const hasChanges =
        styleIdx !== origStyleIdx ||
        paceIdx !== origPaceIdx ||
        arrivalSuffix !== ARRIVAL_ACTIVITIES[0].label ||
        departureMorning !== DEPARTURE_MORNING[0].label ||
        (localResult?.days ?? []).some((d) => {
            const orig = result?.days.find((od) => od.day === d.day);
            return orig && orig.theme !== d.theme;
        });

    function buildFeedbackString(): string {
        const parts: string[] = [];
        if (feedback.trim()) parts.push(feedback.trim());

        const styles = ["relaxed","balanced","adventure","luxury","budget"];
        const paces  = ["slow","moderate","fast"];
        if (styleIdx !== origStyleIdx) parts.push(`Style: ${styles[styleIdx]}`);
        if (paceIdx  !== origPaceIdx)  parts.push(`Pace: ${paces[paceIdx]}`);
        if (arrivalSuffix !== ARRIVAL_ACTIVITIES[0].label)
            parts.push(`Arrival day: Arrival & ${arrivalSuffix}`);
        if (departureMorning !== DEPARTURE_MORNING[0].label)
            parts.push(`Last morning: ${departureMorning}`);

        if (localResult) {
            const themeChanges = localResult.days
                .filter((d) => result?.days.find((od) => od.day === d.day)?.theme !== d.theme)
                .map((d) => `Day ${d.day}: ${d.theme}`);
            if (themeChanges.length) parts.push(themeChanges.join(", "));
        }
        return parts.join(". ");
    }

    function handleReplan() {
        const fb = buildFeedbackString() || "Re-plan with my adjustments";
        onSubmitFeedback(fb);
        setFeedback("");
    }

    // ── Loading state ────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <AgentThinkingCard
                stage="planner"
                onRetry={onRetry}
                skeleton={
                    <div className="space-y-3 animate-pulse">
                        <div className="h-64 bg-white/[0.04] rounded-2xl" />
                        <div className="h-28 bg-white/[0.04] rounded-2xl" />
                        {[1,2,3,4].map((i) => <div key={i} className="h-16 bg-white/[0.04] rounded-2xl" />)}
                    </div>
                }
            />
        );
    }

    if (error) {
        return <AgentThinkingCard stage="planner" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    }

    if (!localResult) return null;

    const heroUrl   = `https://source.unsplash.com/1600x900/?${encodeURIComponent(localResult.destination + ',landmark,city,travel')}`;
    const totalDays = localResult.days.length;
    const arrivalOptions    = ARRIVAL_ACTIVITIES;
    const departureOptions  = DEPARTURE_MORNING;

    return (
        <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
        >
            {/* ── Hero banner ───────────────────────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden h-64">
                {/* Background: destination photo or rich gradient fallback */}
                {!heroError ? (
                    <img
                        src={heroUrl}
                        alt={localResult.destination}
                        className="w-full h-full object-cover scale-[1.06] transition-transform duration-[10000ms] hover:scale-100"
                        onError={() => setHeroError(true)}
                    />
                ) : (
                    <div className="w-full h-full" style={{
                        background: `
                            radial-gradient(ellipse at 25% 60%, rgba(99,102,241,0.55) 0%, transparent 55%),
                            radial-gradient(ellipse at 75% 25%, rgba(168,85,247,0.45) 0%, transparent 50%),
                            radial-gradient(ellipse at 60% 85%, rgba(20,184,166,0.35) 0%, transparent 45%),
                            linear-gradient(145deg, #080b12 0%, #0d1018 100%)
                        `,
                    }} />
                )}

                {/* Cinematic vignette overlay */}
                <div className="absolute inset-0" style={{
                    background: "linear-gradient(to top, rgba(5,7,12,0.95) 0%, rgba(5,7,12,0.45) 45%, rgba(5,7,12,0.15) 100%)",
                }} />
                {/* Subtle top fade */}
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />

                {/* Destination info — floating at bottom */}
                <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                    <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-2">
                                <MapPin className="w-3 h-3 text-indigo-400/70 flex-shrink-0" />
                                <span className="text-[9px] font-bold text-indigo-400/70 uppercase tracking-[0.15em]">Your Destination</span>
                            </div>
                            <h2 className="text-4xl font-black text-white leading-none tracking-tight drop-shadow-2xl truncate">
                                {localResult.destination}
                            </h2>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-[11px] text-white/50 font-medium">
                                    {localResult.startDate} → {localResult.endDate}
                                </span>
                                <span className="text-white/25">·</span>
                                <span className="text-[11px] font-bold text-indigo-300/90 bg-indigo-500/15 border border-indigo-500/25 rounded-full px-2 py-0.5">
                                    {localResult.durationDays} days
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onExplain}
                            className="flex-shrink-0 text-[10px] font-semibold bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 text-white/60 hover:bg-white/20 hover:text-white transition-all"
                        >
                            ? Why this
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Trip preferences ──────────────────────────────────────── */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-4">
                {/* Style */}
                <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Trip style</p>
                    <div className="flex gap-1.5 flex-wrap">
                        {(["relaxed","balanced","adventure","luxury","budget"] as const).map((s, i) => {
                            const icons: Record<string, string> = { relaxed:"🏖️", balanced:"⚖️", adventure:"🧗", luxury:"✨", budget:"💰" };
                            return (
                                <button key={s} onClick={() => setStyleIdx(i)}
                                    className={`text-xs rounded-full px-3 py-1.5 border transition-all font-medium ${
                                        styleIdx === i
                                            ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200"
                                            : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.12]"
                                    }`}>
                                    {icons[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Pace */}
                <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Daily pace</p>
                    <div className="flex gap-1.5">
                        {([
                            { label: "Slow",     emoji: "🐢", desc: "relaxed, fewer stops" },
                            { label: "Moderate", emoji: "🚶", desc: "balanced schedule" },
                            { label: "Fast",     emoji: "🏃", desc: "packed, see everything" },
                        ] as const).map(({ label, emoji, desc }, i) => (
                            <button key={label} onClick={() => setPaceIdx(i)}
                                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-2 rounded-xl border transition-all text-center ${
                                    paceIdx === i
                                        ? "bg-indigo-500/15 border-indigo-500/35 text-indigo-200"
                                        : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.12]"
                                }`}>
                                <span className="text-base">{emoji}</span>
                                <span className="text-[11px] font-semibold">{label}</span>
                                <span className="text-[9px] opacity-60 hidden sm:block">{desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {localResult.preferences?.budget && (
                    <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Budget</span>
                        <span className="text-sm font-bold text-emerald-400">${localResult.preferences.budget.toLocaleString()}</span>
                    </div>
                )}
            </div>

            {/* ── Day-by-day cards ─────────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-bold whitespace-nowrap">
                        Day-by-Day Blueprint
                    </p>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <p className="text-[11px] text-slate-600 text-center -mt-1">Tap any theme to change it</p>
                <div className="space-y-2">
                    {localResult.days.map((day, idx) => {
                        const isFirst = day.day === 1;
                        const isLast  = day.day === totalDays;
                        const accentColor = isFirst
                            ? "#14b8a6"
                            : isLast
                            ? "#f43f5e"
                            : CARD_ACCENT_COLORS[(idx - 1) % CARD_ACCENT_COLORS.length];
                        const bgEmoji = isFirst ? "🛬" : isLast ? "🛫" : getThemeEmoji(day.theme);

                        return (
                            <motion.div
                                key={day.day}
                                initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: idx * 0.045 }}
                                className="relative bg-white/[0.035] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3 overflow-hidden hover:bg-white/[0.055] transition-colors"
                                style={{ borderLeft: `3px solid ${accentColor}40` }}
                            >
                                {/* Faded emoji backdrop */}
                                <span
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl select-none pointer-events-none"
                                    style={{ opacity: 0.08 }}
                                >
                                    {bgEmoji}
                                </span>

                                {/* Day badge */}
                                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-9">
                                    <div
                                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black"
                                        style={{
                                            background: `${accentColor}1a`,
                                            border: `1px solid ${accentColor}30`,
                                            color: accentColor,
                                        }}
                                    >
                                        {day.day}
                                    </div>
                                    <span
                                        className="text-[7px] font-black tracking-[0.12em] uppercase"
                                        style={{ color: `${accentColor}60` }}
                                    >
                                        DAY
                                    </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    {isFirst ? (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-base">🛬</span>
                                            <span className="text-sm font-semibold text-teal-300 flex-shrink-0">Arrival &</span>
                                            <PortalDropdown
                                                options={arrivalOptions}
                                                value={arrivalSuffix}
                                                onChange={setArrivalSuffix}
                                            />
                                        </div>
                                    ) : isLast ? (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[10px] text-slate-500 flex-shrink-0">Morning:</span>
                                                <PortalDropdown
                                                    options={departureOptions}
                                                    value={departureMorning}
                                                    onChange={setDepartureMorning}
                                                />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-base">🛫</span>
                                                <span className="text-sm font-semibold text-rose-300">Departure</span>
                                                <span className="text-[9px] text-slate-600 border border-white/[0.06] rounded-full px-1.5 py-0.5">fixed</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <PortalDropdown
                                            options={DAY_THEMES}
                                            value={day.theme}
                                            onChange={(newTheme) =>
                                                setLocalResult((r) =>
                                                    r ? { ...r, days: r.days.map((d) => d.day === day.day ? { ...d, theme: newTheme } : d) } : r
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* ── Decision gate ─────────────────────────────────────────── */}
            <div className="pt-4 pb-2">
                <AnimatePresence mode="wait">
                    {hasChanges ? (
                        <motion.div
                            key="replan"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="space-y-3"
                        >
                            <p className="text-xs text-slate-500 text-center">
                                You changed the plan — re-run the planner to apply your edits.
                            </p>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Optional: add extra notes… e.g. 'fewer museums, more food experiences'"
                                rows={2}
                                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/40 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 outline-none resize-none transition-all"
                            />
                            <button
                                onClick={handleReplan}
                                disabled={isLoading}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-400 hover:opacity-90 hover:scale-[1.01] text-white font-bold text-sm transition-all shadow-[0_0_28px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2.5 disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                Re-plan with my changes
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="proceed"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                        >
                            <button
                                onClick={() => onApprove(localResult!)}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:opacity-90 hover:scale-[1.01] text-white font-bold text-sm transition-all shadow-[0_0_32px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2.5"
                            >
                                <Sparkles className="w-4 h-4" />
                                This plan looks good — find activities
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <p className="text-xs text-slate-600 text-center mt-2">
                                Change any theme or preference above to adjust first
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
