"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { FlowState } from "./types";

interface TripDNASummaryStripProps {
    state: FlowState;
}

interface Chip {
    id: string;
    label: string;
    colorClass: string;
}

export function TripDNASummaryStrip({ state }: TripDNASummaryStripProps) {
    const prefersReduced = useReducedMotion();
    const { plannerResult, researchResult, logisticsResult, budgetResult, input } = state;

    const chips: Chip[] = [];

    // Always show destination + dates
    chips.push({ id: "dest", label: input.destination, colorClass: "text-white" });

    if (plannerResult) {
        chips.push({
            id: "days",
            label: `${plannerResult.durationDays} days`,
            colorClass: "text-slate-300",
        });
        if (plannerResult.preferences?.style) {
            chips.push({
                id: "style",
                label: plannerResult.preferences.style.charAt(0).toUpperCase() + plannerResult.preferences.style.slice(1),
                colorClass: "text-indigo-400",
            });
        }
        if (plannerResult.preferences?.pace) {
            chips.push({
                id: "pace",
                label: `${plannerResult.preferences.pace} pace`,
                colorClass: "text-slate-400",
            });
        }
    }

    if (researchResult) {
        const total = researchResult.days.reduce((s, d) => s + d.activities.length, 0);
        chips.push({
            id: "activities",
            label: `${total} activities`,
            colorClass: "text-teal-400",
        });
        if (researchResult.hotels.length > 0) {
            chips.push({
                id: "hotel-area",
                label: `Hotel: ${researchResult.hotels[0].area || researchResult.hotels[0].name}`,
                colorClass: "text-teal-400",
            });
        }
    }

    if (logisticsResult) {
        chips.push({
            id: "route",
            label: "Route optimized",
            colorClass: "text-amber-400",
        });
    }

    if (budgetResult) {
        const cost = budgetResult.budget.totalEstimatedCost;
        const over = budgetResult.budget.isOverBudget;
        chips.push({
            id: "budget",
            label: `$${cost.toLocaleString()} est.`,
            colorClass: over ? "text-rose-400" : "text-emerald-400",
        });
        chips.push({
            id: "budget-status",
            label: over ? "Over budget" : "Within budget",
            colorClass: over ? "text-rose-400" : "text-emerald-400",
        });
    }

    if (chips.length === 1) return null; // nothing useful to show yet

    return (
        <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto hide-scrollbar">
            <AnimatePresence initial={false}>
                {chips.map((chip, idx) => (
                    <motion.span
                        key={chip.id}
                        initial={prefersReduced ? {} : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.04 }}
                        className={`flex-shrink-0 text-xs font-medium ${chip.colorClass} rounded-full px-2.5 py-0.5 bg-white/[0.04] border border-white/[0.06]`}
                    >
                        {chip.label}
                    </motion.span>
                ))}
            </AnimatePresence>
        </div>
    );
}
