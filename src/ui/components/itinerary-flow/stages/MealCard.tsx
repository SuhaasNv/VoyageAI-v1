"use client";

/**
 * MealCard.tsx
 *
 * Interactive card for an auto-injected meal stop (lunch or dinner).
 *
 * Features:
 *  - Visually distinct from regular activities (warm orange palette).
 *  - Shows current restaurant: name, cuisine, price level, estimated cost.
 *  - "Change" button expands an inline restaurant selector (no modal needed).
 *  - Selecting an alternative updates the parent immediately.
 *  - "Best match" badge on the default (index 0) option.
 *  - Graceful fallback: no Change button when only one option exists.
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, UtensilsCrossed, Check } from "lucide-react";
import type { Activity, ScheduledActivity } from "@/agents/shared/tripPipelineTypes";

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

// ─── Sub-components ───────────────────────────────────────────────────────────

interface OptionCardProps {
    restaurant: Activity;
    isSelected: boolean;
    isBestMatch: boolean;
    onClick: () => void;
}

function OptionCard({ restaurant, isSelected, isBestMatch, onClick }: OptionCardProps) {
    const detail = restaurant.shortDescription || restaurant.description;
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-150 ${
                isSelected
                    ? "bg-orange-500/15 border-orange-500/40"
                    : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]"
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">
                            {restaurant.name}
                        </span>
                        {isBestMatch && (
                            <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5">
                                Best match
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        {restaurant.cuisine && (
                            <span className="text-xs text-slate-400">{restaurant.cuisine}</span>
                        )}
                        {restaurant.priceLevel && (
                            <>
                                <span className="text-slate-600">·</span>
                                <span className={`text-xs font-semibold ${priceColor(restaurant.priceLevel)}`}>
                                    {PRICE_LABEL[restaurant.priceLevel] ?? restaurant.priceLevel}
                                </span>
                            </>
                        )}
                    </div>
                    {/* Show shortDescription with description as fallback so details
                        are always visible in the selector even without enrichment. */}
                    {detail && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {detail}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-bold text-emerald-400">
                        {costDisplay(restaurant.estimatedCost)}
                    </span>
                    {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-orange-500/30 border border-orange-400/60 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-orange-300" />
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

// ─── MealCard ─────────────────────────────────────────────────────────────────

export interface MealCardProps {
    /** The injected meal ScheduledActivity from the Logistics Agent. */
    meal:        ScheduledActivity;
    /** The currently selected restaurant for this meal slot. */
    selected:    Activity;
    /** Whether the inline restaurant selector is expanded. */
    isOpen:      boolean;
    /** Toggle open/closed state — controlled externally so only one opens at a time. */
    onToggle:    () => void;
    /** Called when user picks a different restaurant. */
    onSelect:    (restaurant: Activity) => void;
}

export function MealCard({ meal, selected, isOpen, onToggle, onSelect }: MealCardProps) {
    const prefersReduced = useReducedMotion();

    const options   = meal.restaurantOptions ?? [];
    // Show "Change" whenever there are alternatives to pick from.
    // "No alternatives" only when there is literally nothing else to offer.
    const canSwitch = options.length > 1;
    const mealLabel = meal.mealType === "lunch" ? "Lunch" : "Dinner";
    const mealEmoji = meal.mealType === "lunch" ? "☀️" : "🌙";
    const detail    = selected.shortDescription || selected.description;

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

                {canSwitch ? (
                    <button
                        onClick={onToggle}
                        className="flex items-center gap-0.5 text-[11px] font-semibold text-orange-400 hover:text-orange-300 transition-colors"
                    >
                        {isOpen ? (
                            <>Done <ChevronUp className="w-3 h-3" /></>
                        ) : (
                            <>Change <ChevronDown className="w-3 h-3" /></>
                        )}
                    </button>
                ) : (
                    <span className="text-[10px] text-slate-600 italic">Fixed venue</span>
                )}
            </div>

            {/* ── Selected restaurant summary ──────────────────────────────── */}
            <div className="flex items-start justify-between px-3 pb-2.5 gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selected.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {selected.cuisine && (
                            <span className="text-xs text-slate-400">{selected.cuisine}</span>
                        )}
                        {selected.priceLevel && (
                            <>
                                <span className="text-slate-600">·</span>
                                <span className={`text-xs font-semibold ${priceColor(selected.priceLevel)}`}>
                                    {PRICE_LABEL[selected.priceLevel] ?? selected.priceLevel}
                                </span>
                            </>
                        )}
                    </div>
                    {/* Always show a description — shortDescription preferred,
                        falls back to the general description so the card is never
                        left with just a name and price tier. */}
                    {detail && (
                        <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                            {detail}
                        </p>
                    )}
                </div>
                <span className="text-sm font-bold text-emerald-400 flex-shrink-0">
                    {costDisplay(selected.estimatedCost)}
                </span>
            </div>

            {/* ── Inline restaurant selector (animated) ───────────────────── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="selector"
                        initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 space-y-2 border-t border-orange-500/[0.15] pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                                Nearby restaurants
                            </p>
                            {options.map((opt, i) => (
                                <OptionCard
                                    key={`${opt.name}-${i}`}
                                    restaurant={opt}
                                    isSelected={opt.name === selected.name}
                                    isBestMatch={i === 0}
                                    onClick={() => {
                                        onSelect(opt);
                                        onToggle();
                                    }}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
