"use client";

/**
 * MealCard.tsx
 *
 * Display card for an auto-injected meal stop (lunch or dinner).
 * Shows meal type, timing, restaurant name, cuisine, price level, and cost.
 */

import { UtensilsCrossed } from "lucide-react";
import type { ScheduledActivity } from "@/agents/shared/tripPipelineTypes";

// ─── Price level display helpers ──────────────────────────────────────────────

const PRICE_LABEL: Record<string, string> = { "$": "$", "$$": "$$", "$$$": "$$$" };
const PRICE_COLOR: Record<string, string> = {
    "$":   "text-emerald-400",
    "$$":  "text-amber-400",
    "$$$": "text-rose-400",
};

function priceColor(level?: string): string {
    return level ? (PRICE_COLOR[level] ?? "text-slate-400") : "text-slate-400";
}

function costDisplay(cost?: number): string {
    if (typeof cost === "number" && cost >= 0) return `~$${cost}`;
    return "~$20";
}

// ─── MealCard ─────────────────────────────────────────────────────────────────

export interface MealCardProps {
    /** The injected meal ScheduledActivity from the Logistics Agent. */
    meal: ScheduledActivity;
}

export function MealCard({ meal }: MealCardProps) {
    const mealLabel = meal.mealType === "lunch" ? "Lunch" : "Dinner";
    const mealEmoji = meal.mealType === "lunch" ? "☀️" : "🌙";
    const detail    = meal.shortDescription || meal.description;

    return (
        <div className="rounded-xl bg-orange-500/[0.07] border border-orange-500/[0.22] overflow-hidden">
            {/* ── Meal header row ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
                <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-orange-400">
                        {mealEmoji} {mealLabel}
                    </span>
                    {(meal.startTime || meal.endTime) && (
                        <span className="text-[10px] text-slate-500 font-mono">
                            {meal.startTime ?? "—"}–{meal.endTime ?? "—"}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Restaurant summary ───────────────────────────────────────── */}
            <div className="flex items-start justify-between px-3 pb-2.5 gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{meal.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {meal.cuisine && (
                            <span className="text-xs text-slate-400">{meal.cuisine}</span>
                        )}
                        {meal.priceLevel && (
                            <>
                                <span className="text-slate-600">·</span>
                                <span className={`text-xs font-semibold ${priceColor(meal.priceLevel)}`}>
                                    {PRICE_LABEL[meal.priceLevel] ?? meal.priceLevel}
                                </span>
                            </>
                        )}
                    </div>
                    {detail && (
                        <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                            {detail}
                        </p>
                    )}
                </div>
                <span className="text-sm font-bold text-emerald-400 flex-shrink-0">
                    {costDisplay(meal.estimatedCost)}
                </span>
            </div>
        </div>
    );
}
