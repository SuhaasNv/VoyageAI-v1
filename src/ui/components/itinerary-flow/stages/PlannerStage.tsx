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

type Mood = "relaxed" | "moderate" | "packed";
const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
    { value: "relaxed",  emoji: "😌", label: "Relaxed"  },
    { value: "moderate", emoji: "⚡", label: "Moderate" },
    { value: "packed",   emoji: "🔥", label: "Packed"   },
];

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
    const [dayMoods,         setDayMoods]          = useState<Record<number, Mood>>({});
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
        Object.keys(dayMoods).length > 0 ||
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

        const moodChanges = Object.entries(dayMoods);
        if (moodChanges.length) parts.push(moodChanges.map(([d, m]) => `Day ${d}: ${m}`).join(", "));

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
        setDayMoods({});
    }

    // ── Loading state ────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <AgentThinkingCard
                stage="planner"
                onRetry={onRetry}
                skeleton={
                    <div className="space-y-3 animate-pulse">
                        <div className="h-44 bg-white/[0.04] rounded-2xl" />
                        <div className="h-28 bg-white/[0.04] rounded-2xl" />
                        {[1,2,3,4].map((i) => <div key={i} className="h-24 bg-white/[0.04] rounded-2xl" />)}
                    </div>
                }
            />
        );
    }

    if (error) {
        return <AgentThinkingCard stage="planner" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    }

    if (!localResult) return null;

    const heroUrl   = `https://source.unsplash.com/featured/1200x400?${encodeURIComponent(localResult.destination)},travel`;
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
            <div className="relative rounded-2xl overflow-hidden h-44">
                {!heroError ? (
                    <img src={heroUrl} alt={localResult.destination}
                        className="w-full h-full object-cover" onError={() => setHeroError(true)} />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900/60 to-slate-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                    <div className="inline-flex items-center gap-2.5 bg-white/[0.12] backdrop-blur-md border border-white/[0.15] rounded-2xl px-4 py-2.5">
                        <MapPin className="w-4 h-4 text-indigo-300 flex-shrink-0" />
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">{localResult.destination}</h2>
                            <p className="text-xs text-slate-300">
                                {localResult.startDate} → {localResult.endDate} · {localResult.durationDays} days
                            </p>
                        </div>
                    </div>
                </div>
                <button onClick={onExplain}
                    className="absolute top-3 right-3 text-xs bg-white/[0.12] backdrop-blur-md border border-indigo-500/30 rounded-full px-3 py-1 text-indigo-300 hover:bg-white/[0.2] transition-all">
                    ? Why this
                </button>
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
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                    Day-by-Day Blueprint · tap a theme to change it
                </p>
                <div className="space-y-2.5">
                    {localResult.days.map((day, idx) => {
                        const isFirst = day.day === 1;
                        const isLast  = day.day === totalDays;

                        return (
                            <motion.div
                                key={day.day}
                                initial={prefersReduced ? {} : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.28, delay: idx * 0.055 }}
                                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 flex items-start gap-3"
                            >
                                {/* Day badge */}
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                    isFirst ? "bg-teal-500/15 border border-teal-500/25 text-teal-300"
                                    : isLast ? "bg-rose-500/15 border border-rose-500/25 text-rose-300"
                                    : "bg-indigo-500/15 border border-indigo-500/25 text-indigo-300"
                                }`}>
                                    {day.day}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {/* Theme selector */}
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

                                    {/* Mood chips */}
                                    <div className="mt-2.5 flex gap-1.5 flex-wrap">
                                        {MOOD_OPTIONS.map((mood) => {
                                            const isActive = (dayMoods[day.day] ?? "moderate") === mood.value;
                                            return (
                                                <button
                                                    key={mood.value}
                                                    onClick={() => setDayMoods((m) => ({ ...m, [day.day]: mood.value }))}
                                                    className={`text-xs rounded-full px-2.5 py-1 transition-all border ${
                                                        isActive
                                                            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                                                            : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.12]"
                                                    }`}
                                                >
                                                    {mood.emoji} {mood.label}
                                                </button>
                                            );
                                        })}
                                    </div>
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
