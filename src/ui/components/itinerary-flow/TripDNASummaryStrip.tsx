"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MapPin, Calendar, Compass, Gauge, Activity, Hotel, Route, DollarSign } from "lucide-react";
import type { FlowState } from "./types";

interface TripDNASummaryStripProps {
    state: FlowState;
    layout?: "horizontal" | "vertical";
}

interface Chip {
    id: string;
    label: string;
    colorClass: string;
    icon?: React.ReactNode;
}

export function TripDNASummaryStrip({ state, layout = "horizontal" }: TripDNASummaryStripProps) {
    const prefersReduced = useReducedMotion();
    const { plannerResult, researchResult, logisticsResult, budgetResult, input } = state;

    const chips: Chip[] = [];

    chips.push({ id: "dest", label: input.destination, colorClass: "text-white", icon: <MapPin className="w-3 h-3" /> });

    if (plannerResult) {
        chips.push({
            id: "days",
            label: `${plannerResult.durationDays} days`,
            colorClass: "text-slate-300",
            icon: <Calendar className="w-3 h-3" />,
        });
        if (plannerResult.preferences?.style) {
            chips.push({
                id: "style",
                label: plannerResult.preferences.style.charAt(0).toUpperCase() + plannerResult.preferences.style.slice(1),
                colorClass: "text-indigo-400",
                icon: <Compass className="w-3 h-3" />,
            });
        }
        if (plannerResult.preferences?.pace) {
            chips.push({
                id: "pace",
                label: `${plannerResult.preferences.pace} pace`,
                colorClass: "text-slate-400",
                icon: <Gauge className="w-3 h-3" />,
            });
        }
    }

    if (researchResult) {
        const total = researchResult.days.reduce((s, d) => s + d.activities.length, 0);
        chips.push({
            id: "activities",
            label: `${total} activities`,
            colorClass: "text-teal-400",
            icon: <Activity className="w-3 h-3" />,
        });
        if (researchResult.hotels.length > 0) {
            chips.push({
                id: "hotel-area",
                label: researchResult.hotels[0].area || researchResult.hotels[0].name,
                colorClass: "text-teal-400",
                icon: <Hotel className="w-3 h-3" />,
            });
        }
    }

    if (logisticsResult) {
        chips.push({
            id: "route",
            label: "Route optimized",
            colorClass: "text-amber-400",
            icon: <Route className="w-3 h-3" />,
        });
    }

    if (budgetResult) {
        const cost = budgetResult.budget.totalEstimatedCost;
        const over = budgetResult.budget.isOverBudget;
        chips.push({
            id: "budget",
            label: `$${cost.toLocaleString()} est.`,
            colorClass: over ? "text-rose-400" : "text-emerald-400",
            icon: <DollarSign className="w-3 h-3" />,
        });
    }

    if (chips.length === 1 && layout === "horizontal") return null;

    // ─── Vertical layout (sidebar) ────────────────────────────────────────
    if (layout === "vertical") {
        return (
            <div className="space-y-2.5">
                <p className="section-heading">Trip DNA</p>
                <AnimatePresence initial={false}>
                    {chips.map((chip, idx) => (
                        <motion.div
                            key={chip.id}
                            initial={prefersReduced ? {} : { opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: idx * 0.04 }}
                            className="flex items-center gap-2.5 py-1"
                        >
                            <span className={`${chip.colorClass} opacity-60 flex-shrink-0`}>
                                {chip.icon}
                            </span>
                            <span className={`text-[12px] font-medium ${chip.colorClass} truncate`}>
                                {chip.label}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        );
    }

    // ─── Horizontal layout (mobile / top bar) ─────────────────────────────
    return (
        <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto hide-scrollbar">
            <AnimatePresence initial={false}>
                {chips.map((chip, idx) => (
                    <motion.span
                        key={chip.id}
                        initial={prefersReduced ? {} : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.04 }}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium ${chip.colorClass} rounded-full px-2.5 py-0.5 bg-white/[0.04] border border-white/[0.06]`}
                    >
                        {chip.icon && <span className="opacity-60">{chip.icon}</span>}
                        {chip.label}
                    </motion.span>
                ))}
            </AnimatePresence>
        </div>
    );
}
