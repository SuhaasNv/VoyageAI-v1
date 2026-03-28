"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { Wallet, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import type { StageProps, BudgetedTripContext } from "../types";

const CURRENCIES = [
    { code: "USD", symbol: "$", flag: "\u{1F1FA}\u{1F1F8}" },
    { code: "EUR", symbol: "\u20AC", flag: "\u{1F1EA}\u{1F1FA}" },
    { code: "GBP", symbol: "\u00A3", flag: "\u{1F1EC}\u{1F1E7}" },
    { code: "JPY", symbol: "\u00A5", flag: "\u{1F1EF}\u{1F1F5}" },
    { code: "INR", symbol: "\u20B9", flag: "\u{1F1EE}\u{1F1F3}" },
    { code: "AUD", symbol: "A$", flag: "\u{1F1E6}\u{1F1FA}" },
];

const DONUT_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#10b981"];
const DONUT_LABELS = ["Hotels", "Activities", "Transport", "Food"];

function AnimatedNumber({ to, symbol }: { to: number; symbol: string }) {
    const motionValue = useMotionValue(0);
    const rounded = useTransform(motionValue, (v) => `${symbol}${Math.round(v).toLocaleString()}`);
    const prefersReduced = useReducedMotion();

    useEffect(() => {
        const ctrl = animate(motionValue, to, {
            duration: prefersReduced ? 0 : 2,
            ease: [0, 0.55, 0.45, 1],
        });
        return ctrl.stop;
    }, [to, motionValue, prefersReduced]);

    return <motion.span>{rounded}</motion.span>;
}

function CrunchingCounter({ label, emoji, target, speed }: { label: string; emoji: string; target: number; speed: number }) {
    const motionValue = useMotionValue(0);
    const display = useTransform(motionValue, (v) => `$${Math.round(v).toLocaleString()}`);
    const prefersReduced = useReducedMotion();

    useEffect(() => {
        const ctrl = animate(motionValue, target, {
            duration: prefersReduced ? 0 : speed,
            ease: "easeOut",
        });
        return ctrl.stop;
    }, [target, motionValue, speed, prefersReduced]);

    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">{emoji} {label}</p>
            <motion.p className="text-2xl font-bold text-white">{display}</motion.p>
        </div>
    );
}

function BudgetLoadingCard() {
    const prefersReduced = useReducedMotion();
    const [lineIdx, setLineIdx] = useState(0);
    const lines = [
        "Calculating hotel costs...",
        "Tallying activity costs...",
        "Estimating transport...",
        "Adding daily food budget...",
    ];

    useEffect(() => {
        const iv = setInterval(() => {
            setLineIdx((i) => (i + 1) % lines.length);
        }, 1200);
        return () => clearInterval(iv);
    }, [lines.length]);

    return (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-3xl p-6 space-y-5">
            <div className="flex items-center gap-3">
                <motion.div
                    className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                    animate={prefersReduced ? {} : {
                        boxShadow: [
                            "0 0 0px rgba(16,185,129,0.35)",
                            "0 0 24px rgba(16,185,129,0.35)",
                            "0 0 0px rgba(16,185,129,0.35)",
                        ],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                    <Wallet className="w-6 h-6 text-emerald-400" />
                </motion.div>
                <div>
                    <p className="text-sm font-semibold text-white">Budget Agent</p>
                    <p className="text-xs text-emerald-400">Crunching the numbers...</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <CrunchingCounter emoji="\u{1F3E8}" label="Hotels" target={1200} speed={1.2} />
                <CrunchingCounter emoji="\u{1F3AF}" label="Activities" target={840} speed={1.8} />
                <CrunchingCounter emoji="\u{1F68C}" label="Transport" target={240} speed={0.9} />
                <CrunchingCounter emoji="\u{1F37D}" label="Food" target={360} speed={2.1} />
            </div>

            <p className="font-mono text-xs text-emerald-400/70">{lines[lineIdx]}</p>

            <div className="flex justify-end">
                <span className="text-[10px] text-slate-500 border border-white/[0.06] rounded-full px-2 py-0.5">
                    Transparent AI · Budget
                </span>
            </div>
        </div>
    );
}

function DonutChart({ values, colors, labels }: { values: number[]; colors: string[]; labels: string[] }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const prefersReduced = useReducedMotion();
    const total = values.reduce((a, b) => a + b, 0);
    const size = 160;
    const cx = size / 2;
    const cy = size / 2;
    const r = 58;
    const stroke = 24;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const slices = values.map((v, i) => {
        const pct = v / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const slice = { dash, gap, offset, pct, i };
        offset += dash;
        return slice;
    });

    return (
        <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
                <svg width={size} height={size}>
                    {slices.map((s) => (
                        <motion.circle
                            key={s.i}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={colors[s.i]}
                            strokeWidth={stroke}
                            strokeLinecap="butt"
                            initial={{ strokeDasharray: `0 ${circumference}`, strokeDashoffset: circumference / 4 - s.offset }}
                            animate={{
                                strokeDasharray: `${s.dash} ${s.gap}`,
                                strokeDashoffset: circumference / 4 - s.offset,
                            }}
                            transition={{
                                duration: prefersReduced ? 0 : 0.8,
                                delay: prefersReduced ? 0 : s.i * 0.15,
                                ease: "easeOut",
                            }}
                            style={{ opacity: hoveredIdx === null || hoveredIdx === s.i ? 1 : 0.3, transition: "opacity 0.2s", cursor: "pointer" }}
                            onMouseEnter={() => setHoveredIdx(s.i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        />
                    ))}
                    <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="500">Total</text>
                    <text x={cx} y={cy + 12} textAnchor="middle" fontSize="13" fill="white" fontWeight="bold">
                        ${Math.round(total).toLocaleString()}
                    </text>
                </svg>
                {hoveredIdx !== null && (
                    <div className="absolute top-1 right-1 bg-[#10141a] border border-white/[0.08] rounded-xl px-2 py-1 text-xs text-white pointer-events-none shadow-lg">
                        {labels[hoveredIdx]}: ${Math.round(values[hoveredIdx]).toLocaleString()}
                        <br />
                        <span className="text-slate-400">{Math.round(slices[hoveredIdx].pct * 100)}%</span>
                    </div>
                )}
            </div>
            <div className="space-y-2 flex-1">
                {labels.map((label, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i] }} />
                        <span className="text-slate-400 flex-1">{label}</span>
                        <span className="text-slate-300 font-medium">${Math.round(values[i]).toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function BudgetStage({
    input,
    result,
    meta,
    isLoading,
    error,
    onApprove,
    onAdjust,
    onExplain,
    onRetry,
}: StageProps<BudgetedTripContext>) {
    const prefersReduced = useReducedMotion();
    const [currency, setCurrency] = useState(CURRENCIES[0]);
    const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

    if (isLoading) return <BudgetLoadingCard />;
    if (error) return <AgentThinkingCard stage="budget" isError errorMessage={error ?? undefined} onRetry={onRetry} />;
    if (!result) return null;

    const { budget } = result;
    const total = budget.totalEstimatedCost;
    const userBudget = result.preferences?.budget;
    const isOver = budget.isOverBudget;

    const totalColor = isOver
        ? "text-rose-400"
        : userBudget && total > userBudget * 0.9
        ? "text-amber-400"
        : "text-emerald-400";

    const hotelNights = result.durationDays;
    const hotelCostPerNight = result.selectedHotel?.priceRange === "$$$$" ? 400
        : result.selectedHotel?.priceRange === "$$$" ? 200
        : result.selectedHotel?.priceRange === "$$" ? 100 : 50;
    const hotelTotal = hotelCostPerNight * hotelNights;
    const activitiesTotal = Math.round(total * 0.45);
    const transportTotal = Math.round(total * 0.1);
    const foodTotal = total - hotelTotal - activitiesTotal - transportTotal;

    const donutValues = [
        Math.max(hotelTotal, 0),
        Math.max(activitiesTotal, 0),
        Math.max(transportTotal, 0),
        Math.max(foodTotal, 0),
    ];

    return (
        <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                    Budget Breakdown
                </h3>
                <div className="flex items-center gap-2">
                    <select
                        value={currency.code}
                        onChange={(e) => setCurrency(CURRENCIES.find((c) => c.code === e.target.value) ?? CURRENCIES[0])}
                        className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 text-slate-300 outline-none appearance-none"
                    >
                        {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code} className="bg-[#10141a]">
                                {c.flag} {c.code}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={onExplain}
                        className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-0.5 hover:scale-105 active:scale-95"
                    >
                        ? Explain
                    </button>
                </div>
            </div>

            {/* Hero cost */}
            <div className="card-premium p-6 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Estimated Total</p>
                <p className={`text-5xl font-bold tracking-tight ${totalColor}`}>
                    <AnimatedNumber to={total} symbol={currency.symbol} />
                </p>
                {userBudget && (
                    <p className="text-sm text-slate-500 mt-2">
                        vs. your budget: {currency.symbol}{userBudget.toLocaleString()}
                        {isOver && budget.budgetGap && (
                            <span className="text-rose-400"> · {currency.symbol}{Math.round(budget.budgetGap).toLocaleString()} over</span>
                        )}
                    </p>
                )}
            </div>

            {/* Donut chart */}
            <div className="card-premium p-5">
                <p className="section-heading mb-4">Cost Breakdown</p>
                <DonutChart values={donutValues} colors={DONUT_COLORS} labels={DONUT_LABELS} />
            </div>

            {/* Per-day accordion */}
            <div className="space-y-2">
                <p className="section-heading">Per-Day Costs</p>
                {result.days.map((day, idx) => {
                    const dayCost = budget.costPerDay?.[idx] ?? Math.round(total / result.durationDays);
                    const isExp = expandedDays.has(day.day);
                    return (
                        <div key={day.day} className="bg-white/[0.04] border border-white/[0.08] rounded-xl transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12]">
                            <button
                                onClick={() =>
                                    setExpandedDays((s) => {
                                        const n = new Set(s);
                                        if (n.has(day.day)) n.delete(day.day); else n.add(day.day);
                                        return n;
                                    })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <span className="text-sm text-slate-300 font-medium">Day {day.day} · {day.theme}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white">{currency.symbol}{Math.round(dayCost).toLocaleString()}</span>
                                    {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                                </div>
                            </button>
                            {isExp && (
                                <div className="px-4 pb-3 space-y-1.5 border-t border-white/[0.04]">
                                    {day.activities.map((act, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-slate-400 py-0.5">
                                            <span>{act.name}</span>
                                            <span className="text-slate-500">{currency.symbol}{act.estimatedCost ?? 20}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/[0.04]">
                                        <span>Hotel (1 night)</span>
                                        <span className="text-slate-500">{currency.symbol}{hotelCostPerNight}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Over-budget suggestions */}
            {isOver && budget.suggestions && budget.suggestions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Saving Suggestions
                    </p>
                    {budget.suggestions.map((s, i) => (
                        <div key={i} className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
                            {s}
                        </div>
                    ))}
                </div>
            )}

            {/* Decision gate */}
            <div className="space-y-3 pt-2">
                <button
                    onClick={() => onApprove(result)}
                    className="w-full py-4 rounded-2xl btn-approve text-white flex items-center justify-center gap-2 transition-all duration-200"
                >
                    <Sparkles className="w-4 h-4" />
                    Budget approved!
                </button>
                <button
                    onClick={() => onAdjust()}
                    className="w-full py-3 rounded-2xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 font-semibold text-sm transition-all duration-200"
                >
                    Optimize for lower cost
                </button>
            </div>
        </motion.div>
    );
}
