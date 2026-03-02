"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    FlaskConical,
    ChevronDown,
    RotateCcw,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
} from "lucide-react";
import { simulateScenario, type ScenarioDiff } from "@/lib/analysis/simulateScenario";
import type { Itinerary } from "@/lib/ai/schemas";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScenarioSimulatorProps {
    rawItinerary:     Itinerary;
    tripBudget:       number;
    currency:         string;
    /** Called when user clicks "Refine with these params". */
    onSuggestRefine?: (text: string) => void;
}

// ─── Custom Slider ────────────────────────────────────────────────────────────

interface SliderProps {
    label:        string;
    value:        number;
    min:          number;
    max:          number;
    step:         number;
    displayValue: string;
    subLabel?:    string;
    isDirty?:     boolean;
    onChange:     (v: number) => void;
}

function SimSlider({ label, value, min, max, step, displayValue, subLabel, isDirty, onChange }: SliderProps) {
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{label}</span>
                <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold tabular-nums ${isDirty ? "text-indigo-300" : "text-white/70"}`}>
                        {displayValue}
                    </span>
                    {subLabel && (
                        <span className="text-[10px] text-white/20">{subLabel}</span>
                    )}
                </div>
            </div>
            {/* Custom track + invisible native input */}
            <div className="relative h-4 flex items-center select-none">
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/[0.07]">
                    <div
                        className={`h-full rounded-full transition-all duration-75 ${isDirty ? "bg-indigo-500/80" : "bg-white/25"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {/* Custom thumb */}
                <div
                    className={`absolute w-3.5 h-3.5 rounded-full shadow-md border pointer-events-none transition-all duration-75 -translate-x-1/2 ${
                        isDirty
                            ? "bg-indigo-400 border-indigo-200/40 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                            : "bg-white/80 border-white/20"
                    }`}
                    style={{ left: `${pct}%` }}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                />
            </div>
        </div>
    );
}

// ─── Breakdown diff row ───────────────────────────────────────────────────────

function BreakdownRow({
    label,
    orig,
    sim,
    isDirty,
}: { label: string; orig: number; sim: number; isDirty: boolean }) {
    const delta  = sim - orig;
    const colour = delta > 0 ? "bg-emerald-400" : delta < 0 ? "bg-rose-400" : "bg-white/30";

    return (
        <div className="flex items-center gap-2 group">
            <span className="text-[10px] text-white/25 w-14 shrink-0 capitalize">{label}</span>
            {/* Original bar */}
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-white/25 transition-all" style={{ width: `${orig}%` }} />
            </div>
            {isDirty && (
                <>
                    <div className="text-[9px] text-white/20 shrink-0">→</div>
                    {/* Simulated bar */}
                    <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${sim}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums w-7 text-right shrink-0 ${
                        delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-white/25"
                    }`}>
                        {delta > 0 ? "+" : ""}{delta !== 0 ? delta : "—"}
                    </span>
                </>
            )}
            {!isDirty && (
                <span className="text-[10px] tabular-nums text-white/30 w-7 text-right shrink-0">{orig}</span>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScenarioSimulator({
    rawItinerary,
    tripBudget,
    currency,
    onSuggestRefine,
}: ScenarioSimulatorProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Derived baselines
    const refBudget = useMemo(
        () => (tripBudget > 0 ? tripBudget : Math.max(rawItinerary.totalEstimatedCost.amount, 500)),
        [tripBudget, rawItinerary]
    );
    const defaultPace = useMemo(
        () => Math.ceil(rawItinerary.days.reduce((s, d) => s + d.activities.length, 0) / (rawItinerary.days.length || 1)),
        [rawItinerary]
    );
    const maxPace = useMemo(
        () => Math.max(...rawItinerary.days.map(d => d.activities.length), 3),
        [rawItinerary]
    );
    const minBudget = useMemo(() => Math.round(refBudget * 0.4), [refBudget]);
    const maxBudget = useMemo(() => Math.round(refBudget * 2.2), [refBudget]);

    // Slider state
    const [simBudget, setSimBudget] = useState(refBudget);
    const [simPace,   setSimPace]   = useState(defaultPace);
    const [simDays,   setSimDays]   = useState(rawItinerary.totalDays);

    // Reset when itinerary changes (e.g. after refine)
    useEffect(() => {
        setSimBudget(refBudget);
        setSimPace(defaultPace);
        setSimDays(rawItinerary.totalDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawItinerary.tripId]);

    // Pure simulation — runs synchronously, no network
    const diff: ScenarioDiff = useMemo(
        () => simulateScenario(
            rawItinerary,
            { simulatedBudget: simBudget, targetActivitiesPerDay: simPace, targetDays: simDays },
            refBudget,
        ),
        [rawItinerary, simBudget, simPace, simDays, refBudget]
    );

    const isDirty    = !diff.isUnchanged;
    const { scoreDelta } = diff;

    const handleReset = useCallback(() => {
        setSimBudget(refBudget);
        setSimPace(defaultPace);
        setSimDays(rawItinerary.totalDays);
    }, [refBudget, defaultPace, rawItinerary.totalDays]);

    const handleSuggestRefine = useCallback(() => {
        if (!onSuggestRefine) return;
        const parts: string[] = [];
        if (simDays < rawItinerary.totalDays)
            parts.push(`Trim to ${simDays} day${simDays > 1 ? "s" : ""}`);
        if (simPace < defaultPace)
            parts.push(`Max ${simPace} activities per day for a more relaxed pace`);
        if (simBudget < refBudget * 0.94)
            parts.push(`Fit within a ${currency} ${simBudget.toFixed(0)} budget`);
        if (simBudget > refBudget * 1.06)
            parts.push(`Expand the plan to use a ${currency} ${simBudget.toFixed(0)} budget with upgrades`);
        onSuggestRefine(parts.join(". ") || "Adjust the plan to match my preferences");
    }, [onSuggestRefine, simDays, simPace, simBudget, rawItinerary.totalDays, defaultPace, refBudget, currency]);

    // Score delta visual
    const deltaColour = scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-rose-400" : "text-white/30";
    const DeltaIcon   = scoreDelta > 0 ? TrendingUp : scoreDelta < 0 ? TrendingDown : Minus;

    return (
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            {/* Header / toggle */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
            >
                <FlaskConical className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="flex-1 text-xs text-white/50 font-medium">
                    Scenario Simulator
                </span>
                {isDirty && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        scoreDelta > 0 ? "bg-emerald-500/15 text-emerald-400" :
                        scoreDelta < 0 ? "bg-rose-500/15 text-rose-400"     :
                                         "bg-white/[0.06] text-white/30"
                    }`}>
                        {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts
                    </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="sim-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: "hidden" }}
                    >
                        <div className="border-t border-white/[0.06] px-3 pb-3 pt-3 space-y-4">

                            {/* ── Sliders ──────────────────────────────────── */}
                            <div className="space-y-4">
                                <SimSlider
                                    label="Budget"
                                    value={simBudget}
                                    min={minBudget}
                                    max={maxBudget}
                                    step={Math.max(50, Math.round(refBudget / 40))}
                                    displayValue={`${currency} ${simBudget.toLocaleString()}`}
                                    subLabel={simBudget !== refBudget ? `(${simBudget > refBudget ? "+" : ""}${((simBudget - refBudget) / refBudget * 100).toFixed(0)}%)` : "(current)"}
                                    isDirty={Math.abs(simBudget - refBudget) > 1}
                                    onChange={setSimBudget}
                                />
                                <SimSlider
                                    label="Pace"
                                    value={simPace}
                                    min={1}
                                    max={maxPace}
                                    step={1}
                                    displayValue={`${simPace} acts/day`}
                                    subLabel={simPace !== defaultPace ? `(was ${defaultPace})` : "(current)"}
                                    isDirty={simPace !== defaultPace}
                                    onChange={setSimPace}
                                />
                                <SimSlider
                                    label="Days"
                                    value={simDays}
                                    min={1}
                                    max={rawItinerary.totalDays}
                                    step={1}
                                    displayValue={`${simDays} day${simDays !== 1 ? "s" : ""}`}
                                    subLabel={simDays !== rawItinerary.totalDays ? `(of ${rawItinerary.totalDays})` : "(full trip)"}
                                    isDirty={simDays !== rawItinerary.totalDays}
                                    onChange={setSimDays}
                                />
                            </div>

                            {/* ── Score Impact ──────────────────────────────── */}
                            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 space-y-2.5">
                                <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Score Impact</p>

                                {/* Score before/after */}
                                <div className="flex items-center gap-3">
                                    <div className="text-center">
                                        <p className="text-[9px] text-white/25 mb-0.5">Current</p>
                                        <p className="text-xl font-black text-white/50 tabular-nums">{diff.original.score.score}</p>
                                    </div>
                                    {isDirty && (
                                        <>
                                            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                                                scoreDelta > 0 ? "bg-emerald-500/15 text-emerald-400" :
                                                scoreDelta < 0 ? "bg-rose-500/15 text-rose-400"     :
                                                                 "bg-white/[0.05] text-white/30"
                                            }`}>
                                                <DeltaIcon className="w-3 h-3" />
                                                {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[9px] text-white/25 mb-0.5">Simulated</p>
                                                <p className={`text-xl font-black tabular-nums ${deltaColour}`}>{diff.simulated.score.score}</p>
                                            </div>
                                        </>
                                    )}
                                    {!isDirty && (
                                        <p className="text-[10px] text-white/20 flex-1">Move sliders to simulate</p>
                                    )}
                                </div>

                                {/* Breakdown bars */}
                                <div className="space-y-1.5 pt-1 border-t border-white/[0.04]">
                                    {(["density", "distance", "budget", "diversity"] as const).map(key => (
                                        <BreakdownRow
                                            key={key}
                                            label={key}
                                            orig={diff.original.score.breakdown[key]}
                                            sim={diff.simulated.score.breakdown[key]}
                                            isDirty={isDirty}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* ── Risk Changes ──────────────────────────────── */}
                            {isDirty && (diff.resolvedAlertTypes.length > 0 || diff.newAlertTypes.length > 0) && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Risk Changes</p>
                                    {diff.resolvedAlertTypes.map(t => (
                                        <div key={t} className="flex items-center gap-2 text-[11px] text-emerald-400">
                                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                                            <span className="opacity-80">{t} resolved</span>
                                        </div>
                                    ))}
                                    {diff.newAlertTypes.map(t => (
                                        <div key={t} className="flex items-center gap-2 text-[11px] text-amber-400">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            <span className="opacity-80">{t} introduced</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {isDirty && diff.resolvedAlertTypes.length === 0 && diff.newAlertTypes.length === 0 && (
                                <p className="text-[11px] text-white/25">Risk profile unchanged</p>
                            )}

                            {/* ── Projected Changes ─────────────────────────── */}
                            {isDirty && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Projected Changes</p>
                                    {diff.projectedChanges.map((c, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            <span className="text-indigo-400/50 text-[10px] mt-0.5 shrink-0">·</span>
                                            <span className="text-[11px] text-white/45 leading-relaxed">{c}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── Actions ───────────────────────────────────── */}
                            <div className="flex gap-2 pt-0.5">
                                {isDirty && (
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/35 hover:text-white/60 text-xs font-medium transition-colors"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset
                                    </button>
                                )}
                                {isDirty && onSuggestRefine && (
                                    <button
                                        onClick={handleSuggestRefine}
                                        title="Pre-fills the Refine Trip input with these scenario params"
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 hover:bg-violet-500/25 text-xs font-medium transition-colors"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        Refine with these params
                                        <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                )}
                                {!isDirty && (
                                    <p className="text-[10px] text-white/15 px-1 py-1.5">
                                        Adjust sliders above to preview changes instantly
                                    </p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
