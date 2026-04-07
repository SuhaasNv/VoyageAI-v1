"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion, AnimatePresence } from "framer-motion";
import { Wallet, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { BudgetSkeleton } from "../skeletons/StageSkeletons";
import { stageContentVariants, stageContentTransition } from "../transitions";
import type { StageProps, BudgetedTripContext } from "../types";

const CURRENCIES = [
    { code: "USD", symbol: "$", flag: "🇺🇸", rate: 1 },
    { code: "EUR", symbol: "€", flag: "🇪🇺", rate: 0.92 },
    { code: "GBP", symbol: "£", flag: "🇬🇧", rate: 0.79 },
    { code: "JPY", symbol: "¥", flag: "🇯🇵", rate: 150 },
    { code: "INR", symbol: "₹", flag: "🇮🇳", rate: 83 },
    { code: "AUD", symbol: "A$", flag: "🇦🇺", rate: 1.53 },
];

const DONUT_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#10b981"];
const DONUT_LABELS = [
    { name: "Hotels", desc: "Base rate & taxes" },
    { name: "Activities", desc: "Tours & experiences" },
    { name: "Transport", desc: "Flights or rentals" },
    { name: "Food", desc: "Dining & snacks allowance" },
];

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

function DonutChart({ values, colors, labels, currency }: { values: number[]; colors: string[]; labels: { name: string, desc: string }[]; currency: typeof CURRENCIES[0] }) {
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
                        {currency.symbol}{Math.round(total).toLocaleString()}
                    </text>
                </svg>
                {hoveredIdx !== null && (
                    <div className="absolute top-1 right-1 bg-[#0B0F19] border border-white/[0.08] rounded-xl px-2 py-1 text-xs text-white pointer-events-none shadow-lg z-10">
                        {labels[hoveredIdx].name}: {currency.symbol}{Math.round(values[hoveredIdx]).toLocaleString()}
                        <br />
                        <span className="text-slate-400">{Math.round(slices[hoveredIdx].pct * 100)}%</span>
                    </div>
                )}
            </div>
            <div className="space-y-2 flex-1">
                {labels.map((label, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i] }} />
                        <div className="flex-1 flex flex-col">
                            <span className="text-slate-200">{label.name}</span>
                            <span className="text-slate-500 text-[10px]">{label.desc}</span>
                        </div>
                        <span className="text-slate-300 font-medium">{currency.symbol}{Math.round(values[i]).toLocaleString()}</span>
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

    const cxRate = currency.rate;
    const budget = result?.budget;
    const total = (budget?.totalEstimatedCost ?? 0) * cxRate;
    const userBudget = result?.preferences?.budget ? result.preferences.budget * cxRate : undefined;
    const isOver = budget?.isOverBudget ?? false;
    const budgetGap = budget?.budgetGap ? budget.budgetGap * cxRate : 0;

    const totalColor = isOver
        ? "text-rose-400"
        : userBudget && total > userBudget * 0.9
        ? "text-amber-400"
        : "text-emerald-400";

    const hotelNights = result?.durationDays ?? 0;
    const hotelCostPerNight = (result?.selectedHotel?.priceRange === "$$$$" ? 400
        : result?.selectedHotel?.priceRange === "$$$" ? 200
        : result?.selectedHotel?.priceRange === "$$" ? 100 : 50) * cxRate;
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
                        stage="budget"
                        destination={input.destination}
                        onRetry={onRetry}
                        skeleton={<BudgetSkeleton days={result?.durationDays} />}
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
                        stage="budget"
                        isError
                        errorMessage={error ?? undefined}
                        onRetry={onRetry}
                        destination={input.destination}
                    />
                </motion.div>
            ) : result && budget ? (
        <motion.div
            key="loaded"
            variants={stageContentVariants}
            initial={prefersReduced ? false : "initial"}
            animate="animate"
            exit={prefersReduced ? undefined : "exit"}
            transition={stageContentTransition}
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
                            <option key={c.code} value={c.code} className="bg-[#0B0F19]">
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
                        vs. your budget: {currency.symbol}{Math.round(userBudget).toLocaleString()}
                        {isOver && budgetGap > 0 && (
                            <span className="text-rose-400"> · {currency.symbol}{Math.round(budgetGap).toLocaleString()} over</span>
                        )}
                    </p>
                )}
            </div>

            {/* Donut chart */}
            <div className="card-premium p-5">
                <p className="section-heading mb-4">Cost Breakdown</p>
                <DonutChart values={donutValues} colors={DONUT_COLORS} labels={DONUT_LABELS} currency={currency} />
            </div>

            {/* Per-day accordion */}
            <div className="space-y-2">
                <p className="section-heading">Per-Day Costs</p>
                {result.days.map((day, idx) => {
                    const rawDayCost = budget.costPerDay?.[idx] ?? (budget.totalEstimatedCost / result.durationDays);
                    const dayCost = rawDayCost * cxRate;
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
                                            <span className="text-slate-500">{currency.symbol}{Math.round((act.estimatedCost ?? 20) * cxRate)}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/[0.04]">
                                        <span>Hotel (1 night)</span>
                                        <span className="text-slate-500">{currency.symbol}{Math.round(hotelCostPerNight)}</span>
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
            ) : null}
        </AnimatePresence>
    );
}
