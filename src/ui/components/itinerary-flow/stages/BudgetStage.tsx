"use client";

import { useEffect, useState } from "react";
import {
    motion,
    useMotionValue,
    useTransform,
    animate,
    useReducedMotion,
    AnimatePresence,
} from "framer-motion";
import {
    Wallet, ChevronDown, ChevronUp, Sparkles, AlertTriangle,
    CheckCircle2, Loader2, Zap,
    Info, TrendingDown, ArrowRight,
} from "lucide-react";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { BudgetSkeleton } from "../skeletons/StageSkeletons";
import { stageContentVariants, stageContentTransition } from "../transitions";
import type { StageProps, BudgetedTripContext, ApplyChange } from "../types";
import type { CostLineItem, OptimalPlan, BudgetAdjustment } from "@/agents/budget/budgetAgent";

// ─── Currency ─────────────────────────────────────────────────────────────────

const CURRENCIES = [
    { code: "USD", symbol: "$",  flag: "🇺🇸", rate: 1     },
    { code: "EUR", symbol: "€",  flag: "🇪🇺", rate: 0.92  },
    { code: "GBP", symbol: "£",  flag: "🇬🇧", rate: 0.79  },
    { code: "JPY", symbol: "¥",  flag: "🇯🇵", rate: 150   },
    { code: "INR", symbol: "₹",  flag: "🇮🇳", rate: 83    },
    { code: "AUD", symbol: "A$", flag: "🇦🇺", rate: 1.53  },
    { code: "CNY", symbol: "¥",  flag: "🇨🇳", rate: 7.25  },
];
type Currency = (typeof CURRENCIES)[number];

// ─── Category config (matches ledger categories exactly) ─────────────────────

const CAT = {
    hotel:    { label: "Hotel",      color: "#6366f1", text: "text-indigo-400", desc: "Per-night rate" },
    activity: { label: "Activities", color: "#14b8a6", text: "text-teal-400",   desc: "Tours & experiences" },
    food:     { label: "Food",       color: "#f59e0b", text: "text-amber-400",  desc: "Dining & snacks" },
    other:    { label: "Transport",  color: "#475569", text: "text-slate-400",  desc: "Local transit & transport" },
} as const;
type CatKey = keyof typeof CAT;
const CAT_ORDER: CatKey[] = ["hotel", "activity", "food", "other"];

// ─── Adjustment type display config ──────────────────────────────────────────

const ADJ_META: Record<BudgetAdjustment["type"], { label: string; colorCls: string }> = {
    hotel_change:    { label: "Hotel downgrade", colorCls: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
    activity_remove: { label: "Skip activity",   colorCls: "text-rose-400 bg-rose-500/10 border-rose-500/20"     },
};

// ─── Source badge config ──────────────────────────────────────────────────────

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
    logistics:     { label: "Calculated", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    estimatedCost: { label: "Estimated",  cls: "text-sky-400 bg-sky-500/10 border-sky-500/20"             },
    priceLevel:    { label: "Estimated",  cls: "text-amber-400 bg-amber-500/10 border-amber-500/20"       },
    fallback:      { label: "Estimated",  cls: "text-slate-400 bg-white/[0.04] border-white/[0.08]"       },
};

// ─── AnimatedNumber ───────────────────────────────────────────────────────────

function AnimatedNumber({ to, symbol }: { to: number; symbol: string }) {
    const motionValue   = useMotionValue(0);
    const rounded       = useTransform(motionValue, (v) => `${symbol}${Math.round(v).toLocaleString()}`);
    const prefersReduced = useReducedMotion();

    useEffect(() => {
        const ctrl = animate(motionValue, to, {
            duration: prefersReduced ? 0 : 1.8,
            ease: [0, 0.55, 0.45, 1],
        });
        return ctrl.stop;
    }, [to, motionValue, prefersReduced]);

    return <motion.span>{rounded}</motion.span>;
}

// ─── DonutChart — real category data ─────────────────────────────────────────

function DonutChart({
    categories,
    currency,
}: {
    categories: Record<CatKey, number>;
    currency: Currency;
}) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const prefersReduced = useReducedMotion();

    const values = CAT_ORDER.map((k) => Math.max(categories[k] * currency.rate, 0));
    const total  = values.reduce((a, b) => a + b, 0);

    const size = 160; const cx = size / 2; const cy = size / 2;
    const r = 58; const stroke = 24;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const slices = values.map((v, i) => {
        const pct = total > 0 ? v / total : 0;
        const dash = pct * circumference;
        const gap  = circumference - dash;
        const s = { dash, gap, offset, pct, i };
        offset += dash;
        return s;
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
                            stroke={CAT[CAT_ORDER[s.i]!].color}
                            strokeWidth={stroke}
                            strokeLinecap="butt"
                            initial={{ strokeDasharray: `0 ${circumference}`, strokeDashoffset: circumference / 4 - s.offset }}
                            animate={{
                                strokeDasharray: `${s.dash} ${s.gap}`,
                                strokeDashoffset: circumference / 4 - s.offset,
                            }}
                            transition={{ duration: prefersReduced ? 0 : 0.8, delay: prefersReduced ? 0 : s.i * 0.12, ease: "easeOut" }}
                            style={{ opacity: hoveredIdx === null || hoveredIdx === s.i ? 1 : 0.25, transition: "opacity 0.2s", cursor: "pointer" }}
                            onMouseEnter={() => setHoveredIdx(s.i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        />
                    ))}
                    <text x={cx} y={cy - 4}  textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="500">Total</text>
                    <text x={cx} y={cy + 12} textAnchor="middle" fontSize="13" fill="white"   fontWeight="bold">
                        {currency.symbol}{Math.round(total).toLocaleString()}
                    </text>
                </svg>
                {hoveredIdx !== null && (
                    <div className="absolute top-1 right-1 bg-[#0B0F19] border border-white/[0.08] rounded-xl px-2 py-1 text-xs text-white pointer-events-none shadow-lg z-10">
                        {CAT[CAT_ORDER[hoveredIdx]!].label}: {currency.symbol}{Math.round(values[hoveredIdx]).toLocaleString()}
                        <br />
                        <span className="text-slate-400">{Math.round(slices[hoveredIdx].pct * 100)}%</span>
                    </div>
                )}
            </div>
            <div className="space-y-2 flex-1">
                {CAT_ORDER.map((key, i) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CAT[key].color }} />
                        <div className="flex-1 flex flex-col">
                            <span className="text-slate-200">{CAT[key].label}</span>
                            <span className="text-slate-500 text-[10px]">{CAT[key].desc}</span>
                        </div>
                        <span className="text-slate-300 font-medium">
                            {currency.symbol}{Math.round(values[i]).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── LedgerDayRow — per-day expandable using real ledger items ────────────────

function LedgerDayRow({
    dayNum, theme, items, dayCost, currency, expanded, onToggle,
}: {
    dayNum: number;
    theme: string;
    items: CostLineItem[];
    dayCost: number;
    currency: Currency;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12]">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3"
            >
                <span className="text-sm text-slate-300 font-medium">Day {dayNum} · {theme}</span>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                        {currency.symbol}{Math.round(dayCost * currency.rate).toLocaleString()}
                    </span>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                </div>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 space-y-1.5 border-t border-white/[0.04]">
                            {items.map((item, i) => {
                                const catCfg = CAT[item.category as CatKey] ?? CAT.other;
                                const srcKey = item.meta?.source ?? "fallback";
                                const badge  = SOURCE_BADGE[srcKey] ?? SOURCE_BADGE.fallback;
                                return (
                                    <div key={i} className="flex items-center gap-2 py-0.5">
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${catCfg.text} bg-white/[0.04] border-white/[0.06]`}>
                                            {catCfg.label}
                                        </span>
                                        <span className="text-xs text-slate-400 flex-1 truncate">{item.name}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                                            {badge.label}
                                        </span>
                                        <span className="text-xs text-slate-300 font-medium w-16 text-right">
                                            {currency.symbol}{Math.round(item.amount * currency.rate).toLocaleString()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── OptimalPlanPanel ─────────────────────────────────────────────────────────

function OptimalPlanPanel({
    plan, originalTotal, userBudget, currency, isApplying, onApply,
}: {
    plan: OptimalPlan;
    originalTotal: number;
    userBudget?: number;
    currency: Currency;
    isApplying: boolean;
    onApply: () => Promise<void>;
}) {
    const totalSaved = originalTotal - plan.finalTotal;
    const sym = currency.symbol;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.03] border border-indigo-500/20 rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Optimization Plan</span>
                </div>
                <span className="text-xs text-indigo-400 font-medium">
                    saves {sym}{Math.round(totalSaved * currency.rate).toLocaleString()}
                </span>
            </div>

            {/* Adjustment list */}
            <div className="px-5 py-3 space-y-2.5">
                {plan.appliedAdjustments.map((adj, i) => {
                    const meta = ADJ_META[adj.type];
                    return (
                        <div key={i} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mt-0.5">
                                <span className="text-[9px] font-bold text-indigo-400">{i + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-200 leading-snug">{adj.description}</p>
                                <span className={`inline-flex items-center mt-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${meta.colorCls}`}>
                                    {meta.label}
                                </span>
                            </div>
                            <span className="text-xs text-emerald-400 font-semibold flex-shrink-0 pt-0.5">
                                −{sym}{Math.round(adj.impact * currency.rate).toLocaleString()}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Outcome bar */}
            <div className={`mx-5 mb-4 px-4 py-3 rounded-xl border flex items-center justify-between ${
                plan.achieved
                    ? "bg-emerald-500/[0.06] border-emerald-500/20"
                    : "bg-amber-500/[0.06] border-amber-500/20"
            }`}>
                <div>
                    <p className="text-xs text-slate-400">New total</p>
                    <p className="text-base font-bold text-white">
                        {sym}{Math.round(plan.finalTotal * currency.rate).toLocaleString()}
                        <span className="text-xs font-normal text-slate-500 ml-1.5">
                            (was {sym}{Math.round(originalTotal * currency.rate).toLocaleString()})
                        </span>
                    </p>
                </div>
                {plan.achieved ? (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-semibold">Within budget</span>
                    </div>
                ) : (
                    <div className="text-right">
                        <p className="text-[10px] text-amber-400 font-medium">Best effort</p>
                        {userBudget && (
                            <p className="text-xs text-amber-300">
                                still {sym}{Math.round((plan.finalTotal - userBudget) * currency.rate).toLocaleString()} over
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* CTA */}
            <div className="px-5 pb-5">
                <button
                    onClick={onApply}
                    disabled={isApplying}
                    className="w-full py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isApplying ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Applying plan…
                        </>
                    ) : (
                        <>
                            <Zap className="w-4 h-4" />
                            Apply This Plan
                            <ArrowRight className="w-3.5 h-3.5" />
                        </>
                    )}
                </button>
            </div>
        </motion.div>
    );
}

// ─── WarningsBanner ───────────────────────────────────────────────────────────

function WarningsBanner({ warnings }: { warnings: string[] }) {
    if (warnings.length === 0) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3 space-y-1"
        >
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                <Info className="w-3 h-3" />
                Your assistant noticed
            </p>
            {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300/80 pl-4">{w}</p>
            ))}
        </motion.div>
    );
}

// ─── AppliedSuccessBanner ─────────────────────────────────────────────────────
//
// Shows a before / after / saved breakdown so the user immediately understands
// the financial impact of the applied plan.

function AppliedSuccessBanner({
    savedAmount,
    originalTotal,
    newTotal,
    achieved,
    budgetGap,
    currency,
}: {
    savedAmount: number;
    originalTotal: number;
    newTotal: number;
    achieved: boolean;
    budgetGap: number;
    currency: Currency;
}) {
    const sym  = currency.symbol;
    const rate = currency.rate;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`border rounded-xl overflow-hidden ${
                achieved
                    ? "bg-emerald-500/[0.06] border-emerald-500/20"
                    : "bg-amber-500/[0.06] border-amber-500/20"
            }`}
        >
            {/* Header row */}
            <div className={`px-4 pt-3.5 pb-3 flex items-center gap-2 border-b ${
                achieved ? "border-emerald-500/[0.15]" : "border-amber-500/[0.15]"
            }`}>
                {achieved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                )}
                <p className={`text-sm font-semibold ${achieved ? "text-emerald-300" : "text-amber-300"}`}>
                    {achieved
                        ? "We adjusted your trip to fit your budget"
                        : "We reduced costs as much as we could"}
                </p>
            </div>

            {/* Before / After / Saved grid */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                {[
                    { label: "Before", value: Math.round(originalTotal * rate), color: "text-slate-400",  prefix: ""   },
                    { label: "After",  value: Math.round(newTotal      * rate), color: achieved ? "text-emerald-400" : "text-amber-400", prefix: "" },
                    { label: "Saved",  value: Math.round(savedAmount   * rate), color: "text-emerald-400", prefix: "↓ " },
                ].map(({ label, value, color, prefix }) => (
                    <div key={label} className="px-4 py-3 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-sm font-bold ${color}`}>
                            {prefix}{sym}{value.toLocaleString()}
                        </p>
                    </div>
                ))}
            </div>

            {/* Remaining gap (only when not achieved) */}
            {!achieved && budgetGap > 0 && (
                <div className="px-4 py-2.5 bg-amber-500/[0.04] border-t border-amber-500/[0.12]">
                    <p className="text-xs text-amber-400/80 text-center">
                        Still {sym}{Math.round(budgetGap * rate).toLocaleString()} over your target
                    </p>
                </div>
            )}
        </motion.div>
    );
}

// ─── ChangeSummaryPanel ───────────────────────────────────────────────────────
//
// Lists exactly what the optimizer changed — removed activities + hotel tier
// drops — so the user understands the trade-offs they just accepted.

function ChangeSummaryPanel({ changes }: { changes: ApplyChange[] }) {
    if (changes.length === 0) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3"
        >
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">
                What changed
            </p>
            <div className="space-y-1.5">
                {changes.map((change, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs">
                        {change.type === "activity_removed" ? (
                            <>
                                <span className="w-4 h-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[8px] font-bold text-rose-400 leading-none">✕</span>
                                </span>
                                <span className="text-slate-500">Removed</span>
                                <span className="text-slate-300 truncate">{change.description}</span>
                            </>
                        ) : (
                            <>
                                <span className="w-4 h-4 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[9px] font-bold text-indigo-400 leading-none">↓</span>
                                </span>
                                <span className="text-slate-500">Hotel</span>
                                <span className="text-slate-300">{change.description}</span>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

// ─── BudgetStage ──────────────────────────────────────────────────────────────

export interface BudgetStageProps extends StageProps<BudgetedTripContext> {
    onApplyPlan: () => Promise<void>;
    isApplyingPlan: boolean;
    applyPlanWarnings: string[];
    appliedSavings: number;
    /** What the optimizer changed — derived from plan.appliedAdjustments. */
    applyChanges: ApplyChange[];
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
    onApplyPlan,
    isApplyingPlan,
    applyPlanWarnings,
    appliedSavings,
    applyChanges,
}: BudgetStageProps) {
    const prefersReduced = useReducedMotion();
    const [currency, setCurrency] = useState(CURRENCIES[0]!);
    const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

    const cxRate    = currency.rate;
    const budget    = result?.budget;
    const total     = (budget?.totalEstimatedCost ?? 0) * cxRate;
    const userBudget = result?.preferences?.budget ? result.preferences.budget * cxRate : undefined;
    const isOver    = budget?.isOverBudget ?? false;
    const budgetGap = budget?.budgetGap ? budget.budgetGap * cxRate : 0;

    const totalColor = isOver
        ? "text-rose-400"
        : userBudget && total > userBudget * 0.9
        ? "text-amber-400"
        : "text-emerald-400";

    // Real categories from ledger
    const categories = budget?.costBreakdown?.categories ?? {
        hotel: 0, food: 0, activity: 0, other: 0,
    };

    // Ledger items — separate transport (uniform flat cost) for a single grouped row
    const ledger         = budget?.ledger ?? [];
    const mainLedger     = ledger.filter((item) => item.category !== "other");
    const transportItems = ledger.filter((item) => item.category === "other");
    const transportTotal = transportItems.reduce((sum, item) => sum + item.amount, 0);
    const transportDays  = result?.days?.length ?? 0;

    // Build per-day groups from non-transport items only; compute dayCost from items
    // so the accordion header always matches the sum of what's shown inside.
    const ledgerByDay = (result?.days ?? []).map((day) => {
        const items   = mainLedger.filter((item) => item.day === day.day);
        const dayCost = items.reduce((sum, item) => sum + item.amount, 0);
        return { day, items, dayCost };
    });

    const optimalPlan    = budget?.budgetAnalysis?.optimalPlan;
    const planWasApplied = appliedSavings > 0;

    function toggleDay(dayNum: number) {
        setExpandedDays((s) => {
            const n = new Set(s);
            if (n.has(dayNum)) n.delete(dayNum); else n.add(dayNum);
            return n;
        });
    }

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
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                            Budget Breakdown
                        </h3>
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end gap-0.5">
                                <select
                                    value={currency.code}
                                    onChange={(e) => setCurrency(CURRENCIES.find((c) => c.code === e.target.value) ?? CURRENCIES[0]!)}
                                    className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-1 text-slate-300 outline-none appearance-none"
                                >
                                    {CURRENCIES.map((c) => (
                                        <option key={c.code} value={c.code} className="bg-[#0B0F19]">
                                            {c.flag} {c.code}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[9px] text-slate-600 leading-none">
                                    Rates are approximate and may vary.
                                </p>
                            </div>
                            <button
                                onClick={onExplain}
                                className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-0.5 hover:scale-105 active:scale-95"
                            >
                                ? Explain
                            </button>
                        </div>
                    </div>

                    {/* ── Applied success: before/after card + change list ── */}
                    {planWasApplied && (
                        <>
                            <AppliedSuccessBanner
                                savedAmount={appliedSavings}
                                originalTotal={budget.totalEstimatedCost + appliedSavings}
                                newTotal={budget.totalEstimatedCost}
                                achieved={!isOver}
                                budgetGap={budget.budgetGap ?? 0}
                                currency={currency}
                            />
                            <ChangeSummaryPanel changes={applyChanges} />
                        </>
                    )}

                    {/* ── Hero cost ── */}
                    <div className="card-premium p-6 text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Estimated Total</p>
                        <p className={`text-5xl font-bold tracking-tight ${totalColor}`}>
                            <AnimatedNumber to={total} symbol={currency.symbol} />
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Includes accommodation, food, activities, and transport estimates
                        </p>
                        {userBudget && (
                            <p className="text-sm text-slate-500 mt-2">
                                vs. your budget: {currency.symbol}{Math.round(userBudget).toLocaleString()}
                                {isOver && budgetGap > 0 && (
                                    <span className="text-rose-400">
                                        {" "}· {currency.symbol}{Math.round(budgetGap).toLocaleString()} over
                                    </span>
                                )}
                                {!isOver && (
                                    <span className="text-emerald-400"> · within budget ✓</span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* ── Over-budget alert ── */}
                    {isOver && !optimalPlan && !planWasApplied && (
                        <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-rose-300">You&apos;re over budget</p>
                                <p className="text-xs text-rose-400/70">
                                    You&apos;re {currency.symbol}{Math.round(budgetGap).toLocaleString()} over your target.
                                    {" "}Hit &ldquo;Optimize for lower cost&rdquo; and we&apos;ll find savings.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Optimal plan panel ── */}
                    {optimalPlan && !planWasApplied && (
                        <OptimalPlanPanel
                            plan={optimalPlan}
                            originalTotal={budget.totalEstimatedCost}
                            userBudget={result.preferences?.budget}
                            currency={currency}
                            isApplying={isApplyingPlan}
                            onApply={onApplyPlan}
                        />
                    )}

                    {/* ── Apply-plan warnings ── */}
                    <WarningsBanner warnings={applyPlanWarnings} />

                    {/* ── LLM saving tips (only when over budget and no optimal plan) ── */}
                    {isOver && !optimalPlan && budget.suggestions && budget.suggestions.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                <TrendingDown className="w-3.5 h-3.5" />
                                Saving Suggestions
                            </p>
                            {budget.suggestions.map((s, i) => (
                                <div key={i} className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
                                    {s}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Donut chart — real data ── */}
                    <div className="card-premium p-5">
                        <p className="section-heading mb-4">Cost Breakdown</p>
                        <DonutChart categories={categories} currency={currency} />
                    </div>

                    {/* ── Per-day ledger accordion ── */}
                    <div className="space-y-2">
                        <p className="section-heading">Per-Day Costs</p>
                        {ledgerByDay.map(({ day, items, dayCost }) => (
                            <LedgerDayRow
                                key={day.day}
                                dayNum={day.day}
                                theme={day.theme}
                                items={items}
                                dayCost={dayCost}
                                currency={currency}
                                expanded={expandedDays.has(day.day)}
                                onToggle={() => toggleDay(day.day)}
                            />
                        ))}

                        {/* Transport summary — collapsed into one row across the trip */}
                        {transportDays > 0 && (
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border text-slate-400 bg-white/[0.04] border-white/[0.06] flex-shrink-0">
                                        Transport
                                    </span>
                                    <span className="text-sm text-slate-300 font-medium truncate">
                                        Transport &amp; local transit
                                    </span>
                                    <span className="text-xs text-slate-600 flex-shrink-0">
                                        ({transportDays} {transportDays === 1 ? "day" : "days"})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${SOURCE_BADGE.fallback!.cls}`}>
                                        {SOURCE_BADGE.fallback!.label}
                                    </span>
                                    <span className="text-sm font-semibold text-white w-16 text-right">
                                        {currency.symbol}{Math.round(transportTotal * currency.rate).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Decision gate ── */}
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
