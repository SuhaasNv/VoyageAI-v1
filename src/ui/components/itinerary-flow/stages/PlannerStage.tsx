"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MapPin, Sparkles, ChevronDown, Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { PlannerSkeleton } from "../skeletons/StageSkeletons";
import { stageContentVariants, stageContentTransition } from "../transitions";
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

const CARD_ACCENT_COLORS = ["#6366f1", "#f59e0b", "#a855f7", "#10b981", "#0ea5e9", "#ec4899"];

function getThemeEmoji(theme: string): string {
    const exact = DAY_THEMES.find((t) => t.label === theme);
    if (exact) return exact.emoji;
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

/**
 * Maps any LLM-returned theme string to the closest canonical DAY_THEMES label.
 * Prevents emoji/label mismatches between the dropdown and the background icon.
 */
function normalizeTheme(theme: string): string {
    if (DAY_THEMES.some((t) => t.label === theme)) return theme;
    const emoji = getThemeEmoji(theme);
    return DAY_THEMES.find((t) => t.emoji === emoji)?.label ?? DAY_THEMES[0].label;
}


// ─── Dropdown ─────────────────────────────────────────────────────────────────

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
    const [rect, setRect]       = useState<DOMRect | null>(null);
    const triggerRef            = useRef<HTMLButtonElement>(null);
    // Ref to the dropdown's own scrollable list — scroll inside it must NOT close the menu.
    const menuScrollRef         = useRef<HTMLDivElement>(null);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setMounted(true); }, []);

    // Capture rect when dropdown opens — avoids reading ref during render.
    useEffect(() => {
        if (open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        } else {
            setRect(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const close = (e: Event) => {
            // Ignore scroll events that originate inside the dropdown's scroll container.
            if (menuScrollRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [open]);

    function toggle(e: React.MouseEvent) {
        e.stopPropagation();
        setOpen((prev) => !prev);
    }

    const current = options.find((o) => o.label === value) ?? options[0];

    return (
        <>
            <button
                ref={triggerRef}
                onClick={toggle}
                type="button"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-indigo-300 transition-colors duration-200"
            >
                <span className="text-base leading-none">{current.emoji}</span>
                <span>{current.label}</span>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {mounted && open && rect && createPortal(
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 99998 }}
                    onClick={() => setOpen(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: "fixed",
                            top: rect.bottom + 8,
                            left: Math.min(rect.left, window.innerWidth - 246),
                            minWidth: Math.max(rect.width, 230),
                            zIndex: 99999,
                            background: "#0B0F19",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 16,
                            overflow: "hidden",
                            boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
                        }}
                    >
                        {/* menuScrollRef is attached here so the scroll listener knows to ignore scroll events inside */}
                        <div ref={menuScrollRef} style={{ padding: 6, maxHeight: 260, overflowY: "auto" }}>
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
    meta: _meta,
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
    const [expandedDay,      setExpandedDay]       = useState<number | null>(null);

    // Sync local copy when parent sends a fresh result (e.g. after re-plan).
    // Use useEffect to avoid reading/writing refs during render.
    useEffect(() => {
        if (result) {
            // Normalize all day themes to canonical DAY_THEMES labels so that the
            // dropdown emoji and the background icon emoji always match.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalResult({
                ...result,
                days: result.days.map((d) => ({ ...d, theme: normalizeTheme(d.theme) })),
            });

            // Resolve style index — fall back to "balanced" (1) for any unrecognised value
            // so orig and current are always in sync after a fresh result arrives.
            const STYLES = ["relaxed", "balanced", "adventure", "luxury", "budget"] as const;
            const sIdx = Math.max(0, STYLES.indexOf((result.preferences?.style ?? "balanced") as typeof STYLES[number])) || 1;
            setStyleIdx(sIdx);
            setOrigStyleIdx(sIdx);

            // Resolve pace index — fall back to "moderate" (1)
            const PACES = ["slow", "moderate", "fast"] as const;
            const pIdx = Math.max(0, PACES.indexOf((result.preferences?.pace ?? "moderate") as typeof PACES[number])) || 1;
            setPaceIdx(pIdx);
            setOrigPaceIdx(pIdx);

            // Reset arrival / departure selectors so they don't hold stale user
            // picks that would keep hasChanges === true after a successful re-plan.
            setArrivalSuffix(ARRIVAL_ACTIVITIES[0].label);
            setDepartureMorning(DEPARTURE_MORNING[0].label);
        }
    }, [result]);

    // Day themes in localResult are always normalized; compare against normalized
    // originals so LLM wording ("culture & landmarks" vs canonical label) does not
    // count as a user edit.
    const hasChanges =
        styleIdx !== origStyleIdx ||
        paceIdx !== origPaceIdx ||
        arrivalSuffix !== ARRIVAL_ACTIVITIES[0].label ||
        departureMorning !== DEPARTURE_MORNING[0].label ||
        (localResult?.days ?? []).some((d) => {
            const orig = result?.days.find((od) => od.day === d.day);
            return orig != null && normalizeTheme(orig.theme) !== d.theme;
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
                .filter((d) => {
                    const orig = result?.days.find((od) => od.day === d.day);
                    return orig != null && normalizeTheme(orig.theme) !== d.theme;
                })
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

    // ── Derived (computed regardless of load state so the skeleton can
    //    approximate the final day-card count before data arrives). ──────────
    const heroUrl          = input.imageUrl ?? null;
    const arrivalOptions   = ARRIVAL_ACTIVITIES;
    const departureOptions = DEPARTURE_MORNING;
    const totalDays        = localResult?.days.length ?? 0;
    const estimatedDays    = (() => {
        if (totalDays > 0) return totalDays;
        if (!input.startDate || !input.endDate) return 5;
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const diff = end.getTime() - start.getTime();
        if (isNaN(diff) || diff < 0) return 5;
        return Math.max(1, Math.round(diff / 86_400_000) + 1);
    })();

    return (
        <AnimatePresence mode="wait">
            {isLoading ? (
                <motion.div
                    key="loading"
                    variants={stageContentVariants}
                    initial={prefersReduced ? false : "initial"}
                    animate="animate"
                    exit={prefersReduced ? undefined : "exit"}
                    transition={stageContentTransition}
                >
                    <AgentThinkingCard
                        stage="planner"
                        destination={input.destination}
                        onRetry={onRetry}
                        skeleton={<PlannerSkeleton days={estimatedDays} />}
                    />
                </motion.div>
            ) : error ? (
                <motion.div
                    key="error"
                    variants={stageContentVariants}
                    initial={prefersReduced ? false : "initial"}
                    animate="animate"
                    exit={prefersReduced ? undefined : "exit"}
                    transition={stageContentTransition}
                >
                    <AgentThinkingCard
                        stage="planner"
                        isError
                        errorMessage={error ?? undefined}
                        onRetry={onRetry}
                        destination={input.destination}
                    />
                </motion.div>
            ) : localResult ? (
        <motion.div
            key="loaded"
            variants={stageContentVariants}
            initial={prefersReduced ? false : "initial"}
            animate="animate"
            exit={prefersReduced ? undefined : "exit"}
            transition={stageContentTransition}
            className="space-y-6"
        >
            {/* ── Hero banner ───────────────────────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden h-56 md:h-64 gradient-border">
                {!heroError && heroUrl ? (
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
                            linear-gradient(145deg, #0B0F19 0%, #06080D 100%)
                        `,
                    }} />
                )}

                <div className="absolute inset-0" style={{
                    background: "linear-gradient(to top, rgba(5,7,12,0.95) 0%, rgba(5,7,12,0.45) 45%, rgba(5,7,12,0.15) 100%)",
                }} />
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
                    <div className="flex items-end justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-2">
                                <MapPin className="w-3 h-3 text-indigo-400/70 flex-shrink-0" />
                                <span className="text-[9px] font-bold text-indigo-400/70 uppercase tracking-[0.15em]">Your Destination</span>
                            </div>
                            <h2 className="text-3xl md:text-4xl font-black text-white leading-none tracking-tight drop-shadow-2xl truncate">
                                {localResult.destination}
                            </h2>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                <span className="text-[11px] text-white/50 font-medium">
                                    {localResult.startDate} → {localResult.endDate}
                                </span>
                                <span className="text-white/25">&middot;</span>
                                <span className="text-[11px] font-bold text-indigo-300/90 bg-indigo-500/15 border border-indigo-500/25 rounded-full px-2.5 py-0.5">
                                    {localResult.durationDays} days
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onExplain}
                            className="flex-shrink-0 text-[10px] font-semibold bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 text-white/60 hover:bg-white/20 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
                        >
                            ? Why this
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Trip preferences ──────────────────────────────────────── */}
            <div className="card-premium p-5 space-y-5">
                <h3 className="text-sm font-bold text-white tracking-tight">Customize Your Trip</h3>

                {/* Style */}
                <div>
                    <p className="section-heading mb-2.5">Trip style</p>
                    <div className="flex gap-2 flex-wrap">
                        {(["relaxed","balanced","adventure","luxury","budget"] as const).map((s, i) => {
                            const icons: Record<string, string> = { relaxed:"🏖️", balanced:"⚖️", adventure:"🧗", luxury:"✨", budget:"💰" };
                            const isSelected = styleIdx === i;
                            return (
                                <button key={s} onClick={() => setStyleIdx(i)}
                                    className={`text-xs rounded-xl px-3.5 py-2 border transition-all duration-200 font-medium hover:scale-[1.03] active:scale-[0.97] ${
                                        isSelected
                                            ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                                            : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.15] hover:bg-white/[0.06]"
                                    }`}>
                                    {icons[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Pace */}
                <div>
                    <p className="section-heading mb-2.5">Daily pace</p>
                    <div className="flex gap-2">
                        {([
                            { label: "Slow",     emoji: "🐢", desc: "relaxed, fewer stops" },
                            { label: "Moderate", emoji: "🚶", desc: "balanced schedule" },
                            { label: "Fast",     emoji: "🏃", desc: "packed, see everything" },
                        ] as const).map(({ label, emoji, desc }, i) => {
                            const isSelected = paceIdx === i;
                            return (
                                <button key={label} onClick={() => setPaceIdx(i)}
                                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border transition-all duration-200 text-center hover:scale-[1.02] active:scale-[0.98] ${
                                        isSelected
                                            ? "bg-indigo-500/15 border-indigo-500/35 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                                            : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.15]"
                                    }`}>
                                    <span className="text-lg">{emoji}</span>
                                    <span className="text-[11px] font-bold">{label}</span>
                                    <span className="text-[9px] opacity-60 hidden sm:block">{desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {localResult.preferences?.budget && (
                    <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
                        <span className="section-heading">Budget</span>
                        <span className="text-base font-bold text-emerald-400">${localResult.preferences.budget.toLocaleString()}</span>
                    </div>
                )}
            </div>

            {/* ── Day-by-day timeline cards ─────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <h3 className="text-sm font-bold text-white tracking-tight whitespace-nowrap flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        Day-by-Day Blueprint
                    </h3>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                </div>
                <p className="text-[11px] text-slate-600 text-center">Tap any theme to customize</p>

                <div className="space-y-2.5 relative">
                    {/* Timeline line */}
                    <div className="absolute left-[22px] top-4 bottom-4 w-px bg-gradient-to-b from-indigo-500/30 via-purple-500/20 to-rose-500/30 hidden md:block" />

                    {localResult.days.map((day, idx) => {
                        const isFirst = day.day === 1;
                        const isLast  = day.day === totalDays;
                        const accentColor = isFirst
                            ? "#14b8a6"
                            : isLast
                            ? "#f43f5e"
                            : CARD_ACCENT_COLORS[(idx - 1) % CARD_ACCENT_COLORS.length];
                        const bgEmoji = isFirst ? "🛬" : isLast ? "🛫" : getThemeEmoji(day.theme);
                        const isExpanded = expandedDay === day.day;

                        return (
                            <motion.div
                                key={day.day}
                                initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: idx * 0.05 }}
                                className="relative group"
                            >
                                <div
                                    onClick={() => setExpandedDay(isExpanded ? null : day.day)}
                                    className="relative bg-white/[0.02] backdrop-blur-md border border-white/[0.08] rounded-2xl p-4 md:pl-12 flex items-center gap-4 overflow-hidden cursor-pointer transition-all duration-300 hover:bg-white/[0.04] hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] group-hover:-translate-y-1"
                                    style={{
                                        borderLeft: `3px solid ${accentColor}50`,
                                    }}
                                >
                                    {/* Faded emoji backdrop */}
                                    <span
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl select-none pointer-events-none opacity-[0.06] group-hover:opacity-[0.1] transition-opacity duration-300"
                                    >
                                        {bgEmoji}
                                    </span>

                                    {/* Day number badge */}
                                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                        <div
                                            className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black transition-all duration-250 group-hover:scale-110"
                                            style={{
                                                background: `${accentColor}15`,
                                                border: `1.5px solid ${accentColor}35`,
                                                color: accentColor,
                                                boxShadow: `0 0 16px ${accentColor}15`,
                                            }}
                                        >
                                            {day.day}
                                        </div>
                                        <span
                                            className="text-[7px] font-black tracking-[0.14em] uppercase"
                                            style={{ color: `${accentColor}55` }}
                                        >
                                            DAY
                                        </span>
                                    </div>

                                    {/* Content */}
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
                                            <div>
                                                <PortalDropdown
                                                    options={DAY_THEMES}
                                                    value={day.theme}
                                                    onChange={(newTheme) =>
                                                        setLocalResult((r) =>
                                                            r ? { ...r, days: r.days.map((d) => d.day === day.day ? { ...d, theme: newTheme } : d) } : r
                                                        )
                                                    }
                                                />
                                                <p className="text-[10px] text-slate-600 mt-1">
                                                    {getThemeEmoji(day.theme)} Activities will match this theme
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Expand indicator */}
                                    <ChevronDown
                                        className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                    />
                                </div>

                                {/* Expanded detail */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-4 md:pl-12 pb-3 pt-2 border-t border-white/[0.04] mt-0">
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    {isFirst
                                                        ? "Arrive, settle in, and get oriented with your surroundings."
                                                        : isLast
                                                        ? "Make the most of your last morning before heading to the airport."
                                                        : `Explore ${day.theme.toLowerCase()} — the research agent will find specific activities for this theme.`
                                                    }
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* ── Decision gate ─────────────────────────────────────────── */}
            <div className="pt-2 pb-2">
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
                                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 outline-none resize-none transition-all duration-200"
                            />
                            <button
                                onClick={handleReplan}
                                disabled={isLoading}
                                className="w-full py-4 rounded-2xl btn-primary text-white flex items-center justify-center gap-2.5 disabled:opacity-50"
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
                                className="w-full py-4 rounded-2xl btn-approve text-white flex items-center justify-center gap-2.5"
                            >
                                <Sparkles className="w-4 h-4" />
                                This plan looks good — find activities
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <p className="text-[11px] text-slate-600 text-center mt-2.5">
                                Change any theme or preference above to adjust first
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
        ) : (
            // Warmup state: CSRF not yet ready or component just mounted.
            // Show the loading card so there is never a blank screen.
            <motion.div
                key="warmup"
                variants={stageContentVariants}
                initial={prefersReduced ? false : "initial"}
                animate="animate"
                exit={prefersReduced ? undefined : "exit"}
                transition={stageContentTransition}
            >
                <AgentThinkingCard
                    stage="planner"
                    destination={input.destination}
                    skeleton={<PlannerSkeleton days={estimatedDays} />}
                />
            </motion.div>
        )}
    </AnimatePresence>
    );
}
