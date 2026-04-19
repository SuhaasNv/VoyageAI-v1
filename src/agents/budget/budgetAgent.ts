import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { logError, logStructured, trunc } from "@/infrastructure/logger";
import { computeFoodCost } from "@/agents/logistics/routingUtils";
import type {
    Activity,
    HotelOption,
    OptimizedDay,
    OptimizedTripContext,
    ScheduledActivity,
} from "@/agents/shared/tripPipelineTypes";

// Re-export so existing importers (orchestrator, tests) don't need to change.
export type { ScheduledActivity, OptimizedDay, HotelOption, OptimizedTripContext };

// ─── Cost Ledger Types ────────────────────────────────────────────────────────

/**
 * A single traceable line item in the trip cost ledger.
 * Every dollar in totalEstimatedCost maps to exactly one CostLineItem.
 */
export interface CostLineItem {
    day: number;
    category: "hotel" | "food" | "activity" | "other";
    name: string;
    amount: number;
    meta?: {
        /** Origin of the cost figure — drives explainability. */
        source?: "estimatedCost" | "priceLevel" | "logistics" | "fallback";
        mealType?: "lunch" | "dinner";
        /**
         * Stable activity ID (hash of name|type|startTime|day).
         * Present on activity line items only — used for UI-safe adjustment payloads.
         */
        activityId?: string;
    };
}

/**
 * Aggregated view derived entirely from the ledger.
 * Invariants guaranteed: total === sum(perDay) === sum(categories).
 */
export interface CostBreakdown {
    perDay: number[];
    total: number;
    categories: {
        hotel: number;
        food: number;
        activity: number;
        other: number;
    };
}

// ─── Budget Intelligence Types ────────────────────────────────────────────────

/**
 * Machine-executable instruction that tells downstream systems exactly
 * what to change in the itinerary to realise the saving.
 *
 * The UI can pass this directly to an "Apply" endpoint; the system can also
 * apply it automatically in the greedy solver without any human in the loop.
 */
export interface BudgetAdjustmentAction {
    type: "replace_restaurant" | "change_hotel" | "remove_activity";
    payload: {
        /** Stable activity ID — preferred over name for bulletproof matching. */
        activityId?: string;
        /** Human-readable fallback when activityId is absent (remove_activity). */
        activityName?: string;
        /** Day number the activity lives on (remove_activity / replace_restaurant). */
        day?: number;
        /** Current hotel price-range tier (change_hotel). */
        hotelFrom?: string;
        /** Target hotel price-range tier to downgrade to (change_hotel). */
        hotelTo?: string;
        /** Name of the current restaurant being replaced (replace_restaurant). */
        restaurantFrom?: string;
        /** Name of the cheaper target restaurant (replace_restaurant). */
        restaurantTo?: string;
    };
}

/**
 * A single deterministic, executable cost-reduction trade-off.
 * All figures come from the ledger and cost tables — no LLM guessing.
 * The `action` field makes every suggestion replayable.
 */
export interface BudgetAdjustment {
    type: "restaurant_swap" | "hotel_change" | "activity_remove";
    /** Exact dollar saving if this adjustment is applied. Always >= 0. */
    impact: number;
    /** Human-readable explanation of the trade-off shown in the UI. */
    description: string;
    /** Machine-executable instruction — apply this to get the saving. */
    action: BudgetAdjustmentAction;
}

/**
 * The minimal set of adjustments found by the greedy solver that brings
 * the trip under budget. Deterministic: same input → same plan.
 */
export interface OptimalPlan {
    /** Adjustments applied in order until the trip fell within budget. */
    appliedAdjustments: BudgetAdjustment[];
    /** Trip total after all adjustments have been applied. */
    finalTotal: number;
    /** Full cost breakdown after adjustments — derived from the ledger. */
    finalBreakdown: CostBreakdown;
    /**
     * `true`  → the plan fully bridges the gap (finalTotal <= userBudget).
     * `false` → best-effort: all suggestions applied but gap remains.
     *           UI should surface this honestly: "We reduced cost by $X but
     *           couldn't fully reach your target."
     */
    achieved: boolean;
}

/**
 * Result of the deterministic budget intelligence layer.
 * Present only when the user has a budget set.
 */
export interface BudgetAnalysis {
    /**
     * `total - userBudget`.
     * Positive = over budget (need to cut).
     * Negative or zero = within budget.
     */
    delta: number;
    /**
     * All possible trade-offs, ordered by impact descending.
     * Empty array when not over budget.
     */
    suggestions: BudgetAdjustment[];
    /**
     * Greedy-optimal plan — the minimal set of suggestions that brings the
     * trip within budget. Absent when already within budget or no path found.
     */
    optimalPlan?: OptimalPlan;
}

export type BudgetResult = {
    totalEstimatedCost: number;
    costPerDay: number[];
    isOverBudget: boolean;
    budgetGap?: number;
    /** LLM-rephrased text tips (only when over budget and LLM succeeds). */
    suggestions?: string[];
    /** Itemised ledger — every cost is traceable to a named line item. */
    ledger: CostLineItem[];
    /** Category/day aggregation derived from the ledger. */
    costBreakdown: CostBreakdown;
    /** Deterministic intelligence layer — present when a user budget is set. */
    budgetAnalysis?: BudgetAnalysis;
};

export type BudgetedTripContext = OptimizedTripContext & {
    budget: BudgetResult;
};

// ─── Cost constants ───────────────────────────────────────────────────────────

const HOTEL_NIGHTLY: Record<string, number> = {
    $: 50,
    $$: 100,
    $$$: 200,
    $$$$: 400,
};

/** Ordered cheapest → most expensive for tier navigation in Rule 2. */
const HOTEL_TIERS: ReadonlyArray<HotelOption["priceRange"]> = ["$", "$$", "$$$", "$$$$"];

const ACTIVITY_RANGE: Record<ScheduledActivity["type"], [number, number]> = {
    attraction: [20, 50],
    experience: [50, 150],
    restaurant: [15, 40],
};

/**
 * Fallback food cost by price level when foodCostSummary is absent.
 * Mirrors FALLBACK_COST in routingUtils.ts — same source of truth.
 */
const FOOD_PRICE_LEVEL_FALLBACK: Record<string, number> = {
    $: 12,
    $$: 30,
    $$$: 75,
};
const FOOD_DEFAULT_COST = 20;

// Thresholds that trigger budget adjustment rules.
const HOTEL_SHARE_THRESHOLD = 0.50; // hotel > 50% of total → suggest hotel tier drop

/** Stable ordering for restaurant price levels (lower index = cheaper). */
const PRICE_ORDER: Readonly<Record<string, number>> = { $: 0, $$: 1, $$$: 2 };

/**
 * Minimum non-meal activities that must remain on a day after any removal.
 * Guards against creating empty / narrative-breaking days.
 */
const MIN_NON_MEAL_AFTER_REMOVE = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic hash so a missing estimatedCost always maps to the same
 * integer within the activity cost range — no randomness between runs.
 */
function deterministicActivityCost(name: string, type: ScheduledActivity["type"]): number {
    const [min, max] = ACTIVITY_RANGE[type];
    let h = 5381;
    const str = name + type;
    for (let i = 0; i < str.length; i++) {
        h = (h * 33) ^ str.charCodeAt(i);
        h = h >>> 0;
    }
    return min + (h % (max - min + 1));
}

/**
 * Generates a stable, deterministic ID for a scheduled activity.
 *
 * Built from: name | type | startTime | day
 * Uses the same djb2 hash as deterministicActivityCost — always unsigned 32-bit,
 * always the same for identical inputs.
 *
 * Stored in CostLineItem.meta.activityId and BudgetAdjustmentAction.payload.activityId
 * so the UI can reference activities without being brittle about name matching.
 */
function makeActivityId(activity: ScheduledActivity, day: number): string {
    const key = `${activity.name}|${activity.type}|${activity.startTime ?? ""}|${day}`;
    let h = 5381;
    for (let i = 0; i < key.length; i++) {
        h = (h * 33) ^ key.charCodeAt(i);
        h = h >>> 0;
    }
    return h.toString(36);
}

function resolveActivityCost(activity: ScheduledActivity): {
    amount: number;
    source: "estimatedCost" | "fallback";
} {
    if (activity.estimatedCost != null) {
        const rounded = Math.round(Number(activity.estimatedCost));
        if (!isNaN(rounded)) return { amount: rounded, source: "estimatedCost" };
    }
    return {
        amount: deterministicActivityCost(activity.name, activity.type),
        source: "fallback",
    };
}

function hotelNightly(priceRange: HotelOption["priceRange"]): number {
    return HOTEL_NIGHTLY[priceRange] ?? HOTEL_NIGHTLY["$$"];
}

/**
 * Resolves the cost of a restaurant Activity using the same fallback chain
 * as the food ledger builder — keeps both consistent.
 */
function resolveRestaurantCost(r: Activity): number {
    if (typeof r.estimatedCost === "number" && r.estimatedCost >= 0) return r.estimatedCost;
    if (r.priceLevel && FOOD_PRICE_LEVEL_FALLBACK[r.priceLevel] !== undefined) {
        return FOOD_PRICE_LEVEL_FALLBACK[r.priceLevel]!;
    }
    return FOOD_DEFAULT_COST;
}

/**
 * Returns true if `candidate` is demonstrably cheaper than `current`.
 * Prefers priceLevel comparison; falls back to estimatedCost.
 */
function isCheaperRestaurant(candidate: Activity, current: Activity): boolean {
    if (candidate.name === current.name) return false;
    const cLevel = current.priceLevel   ? PRICE_ORDER[current.priceLevel]   : undefined;
    const rLevel = candidate.priceLevel ? PRICE_ORDER[candidate.priceLevel] : undefined;
    if (rLevel !== undefined && cLevel !== undefined) return rLevel < cLevel;
    return resolveRestaurantCost(candidate) < resolveRestaurantCost(current);
}

// ─── Cost Ledger Builder ──────────────────────────────────────────────────────

/**
 * Builds a fully itemised cost ledger from a trip context.
 *
 * Guarantees:
 *  - Hotel:    (durationDays - 1) nights; each night is a separate line item.
 *  - Food:     Verbatim from context.foodCostSummary.perDay (Logistics is the
 *              single source of truth). Falls back to isMeal activity resolution.
 *  - Activity: Non-meal activities only — isMeal entries excluded.
 *
 * Pure, deterministic, no LLM calls.
 */
function buildCostLedger(context: OptimizedTripContext): CostLineItem[] {
    const ledger: CostLineItem[] = [];
    const nightly = hotelNightly(context.selectedHotel.priceRange);
    const nights  = Math.max(0, context.durationDays - 1);

    // ── Hotel ─────────────────────────────────────────────────────────────────
    for (let i = 0; i < nights; i++) {
        ledger.push({
            day: i + 1,
            category: "hotel",
            name: context.selectedHotel.name,
            amount: nightly,
            meta: { source: "fallback" },
        });
    }

    // ── Food (Logistics is the single source of truth) ────────────────────────
    const foodPerDay = context.foodCostSummary?.perDay;
    if (Array.isArray(foodPerDay) && foodPerDay.length > 0) {
        for (let i = 0; i < context.durationDays; i++) {
            const amount = foodPerDay[i] ?? 0;
            if (amount > 0) {
                ledger.push({
                    day: i + 1,
                    category: "food",
                    name: "Meals",
                    amount,
                    meta: { source: "logistics" },
                });
            }
        }
    } else {
        for (const optimizedDay of context.days ?? []) {
            let dayTotal = 0;
            for (const act of optimizedDay.activities ?? []) {
                if (!act.isMeal) continue;
                if (typeof act.estimatedCost === "number" && act.estimatedCost >= 0) {
                    dayTotal += act.estimatedCost;
                } else if (act.priceLevel && FOOD_PRICE_LEVEL_FALLBACK[act.priceLevel] !== undefined) {
                    dayTotal += FOOD_PRICE_LEVEL_FALLBACK[act.priceLevel]!;
                } else {
                    dayTotal += FOOD_DEFAULT_COST;
                }
            }
            if (dayTotal > 0) {
                ledger.push({
                    day: optimizedDay.day,
                    category: "food",
                    name: "Meals",
                    amount: dayTotal,
                    meta: { source: "fallback" },
                });
            }
        }
    }

    // ── Activities (non-meal only) ────────────────────────────────────────────
    for (const optimizedDay of context.days ?? []) {
        const idx = optimizedDay.day - 1;
        if (idx < 0 || idx >= context.durationDays) continue;
        for (const activity of optimizedDay.activities ?? []) {
            if (activity.isMeal) continue;
            const { amount, source } = resolveActivityCost(activity);
            // Generate stable ID and cache on the activity so applyAdjustment
            // can match by ID rather than fragile name-string comparison.
            const activityId = activity.id ?? makeActivityId(activity, optimizedDay.day);
            ledger.push({
                day: optimizedDay.day,
                category: "activity",
                name: activity.name,
                amount,
                meta: { source, activityId },
            });
        }
    }

    return ledger;
}

// ─── Ledger Aggregation ───────────────────────────────────────────────────────

function aggregateLedger(
    ledger: CostLineItem[],
    durationDays: number,
): { perDay: number[]; total: number; categories: CostBreakdown["categories"] } {
    const perDay = Array<number>(durationDays).fill(0);
    const categories: CostBreakdown["categories"] = { hotel: 0, food: 0, activity: 0, other: 0 };

    for (const item of ledger) {
        const dayIdx = item.day - 1;
        if (dayIdx >= 0 && dayIdx < durationDays) perDay[dayIdx] += item.amount;
        if      (item.category === "hotel")    categories.hotel    += item.amount;
        else if (item.category === "food")     categories.food     += item.amount;
        else if (item.category === "activity") categories.activity += item.amount;
        else                                   categories.other    += item.amount;
    }

    const total = ledger.reduce((sum, item) => sum + item.amount, 0);
    return { perDay, total, categories };
}

// ─── Budget Intelligence — Deterministic Adjustment Rules ─────────────────────

/**
 * Generates deterministic, executable budget adjustment suggestions.
 *
 * Rule 1 — Per-meal restaurant swap (concrete, not abstract):
 *   Iterates every isMeal activity. When a demonstrably cheaper alternative
 *   exists in the activity's restaurantOptions[], emits a specific
 *   "swap restaurantA → restaurantB" suggestion. Capped at the 3 highest-
 *   impact swaps so the UI is never overwhelming.
 *
 * Rule 2 — Hotel share > 50%: exact saving from one tier downgrade.
 *   action: change_hotel — changes selectedHotel.priceRange to lowerTier.
 *
 * Rule 3 — Top-3 highest-cost non-meal activities (safe-removal guard):
 *   Skips any activity whose removal would leave the day with fewer than
 *   MIN_NON_MEAL_AFTER_REMOVE non-meal activities — prevents empty days.
 *   action: remove_activity — filters the named activity from that day.
 *
 * Output sorted by impact descending with description-based tie-breaking.
 * Only called when delta > 0 (trip is over budget).
 */
function generateBudgetAdjustments(
    ledger: CostLineItem[],
    breakdown: CostBreakdown,
    context: OptimizedTripContext,
): BudgetAdjustment[] {
    const { total, categories } = breakdown;
    const { selectedHotel: hotel, durationDays } = context;
    const adjustments: BudgetAdjustment[] = [];

    if (total <= 0) return [];

    // ── Rule 1: Per-meal restaurant swap (concrete alternatives only) ─────────
    const mealSwaps: BudgetAdjustment[] = [];
    for (const day of context.days) {
        for (const act of day.activities) {
            if (!act.isMeal || !act.mealType) continue;

            const options = act.restaurantOptions ?? [];
            // Need at least one alternative beyond the current pick.
            if (options.length < 2) continue;

            const current = options[0]!;

            // Find the cheapest option that is demonstrably less expensive.
            const cheaper = options
                .filter((r) => isCheaperRestaurant(r, current))
                .sort((a, b) => resolveRestaurantCost(a) - resolveRestaurantCost(b))[0];

            if (!cheaper) continue;

            const fromCost = resolveRestaurantCost(current);
            const toCost   = resolveRestaurantCost(cheaper);
            const impact   = Math.max(0, fromCost - toCost);
            if (impact <= 0) continue;

            mealSwaps.push({
                type: "restaurant_swap",
                impact,
                description:
                    `Day ${day.day} ${act.mealType}: swap "${current.name}" → "${cheaper.name}" — saves $${impact}`,
                action: {
                    type: "replace_restaurant",
                    payload: {
                        day:            day.day,
                        restaurantFrom: current.name,
                        restaurantTo:   cheaper.name,
                    },
                },
            });
        }
    }
    // Emit the 3 highest-impact meal swaps only.
    adjustments.push(...mealSwaps.sort((a, b) => b.impact - a.impact).slice(0, 3));

    // ── Rule 2: Hotel share > 50% and tier can go down ────────────────────────
    const hotelShare = categories.hotel / total;
    if (hotelShare > HOTEL_SHARE_THRESHOLD && categories.hotel > 0) {
        const currentIdx = HOTEL_TIERS.indexOf(hotel.priceRange);
        if (currentIdx > 0) {
            const lowerTier      = HOTEL_TIERS[currentIdx - 1]!;
            const nights         = Math.max(0, durationDays - 1);
            const savingPerNight = hotelNightly(hotel.priceRange) - hotelNightly(lowerTier);
            const impact         = savingPerNight * nights;
            if (impact > 0) {
                adjustments.push({
                    type: "hotel_change",
                    impact,
                    description:
                        `Switch to a ${lowerTier}-tier hotel — saves $${savingPerNight}/night × ${nights} nights = $${impact}`,
                    action: {
                        type: "change_hotel",
                        payload: {
                            hotelFrom: hotel.priceRange,
                            hotelTo:   lowerTier,
                        },
                    },
                });
            }
        }
    }

    // ── Rule 3: Top-3 highest-cost activities (safe-removal guard) ────────────
    const activityItems = ledger
        .filter((l) => {
            if (l.category !== "activity" || l.amount <= 0) return false;
            // Skip if removing this activity would leave the day narrative-broken.
            const day = context.days.find((d) => d.day === l.day);
            if (!day) return false;
            const nonMealCount = day.activities.filter((a) => !a.isMeal).length;
            return nonMealCount > MIN_NON_MEAL_AFTER_REMOVE;
        })
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
        .slice(0, 3);

    for (const item of activityItems) {
        adjustments.push({
            type: "activity_remove",
            impact: item.amount,
            description: `Skip "${item.name}" (day ${item.day}) — saves $${item.amount}`,
            action: {
                type: "remove_activity",
                payload: {
                    // activityId is the preferred match key; name is a human-readable fallback.
                    activityId:   item.meta?.activityId,
                    activityName: item.name,
                    day:          item.day,
                },
            },
        });
    }

    // Final sort: impact desc, description asc for deterministic tie-breaking.
    return adjustments.sort(
        (a, b) => b.impact - a.impact || a.description.localeCompare(b.description),
    );
}

// ─── Executable Adjustment Engine ─────────────────────────────────────────────

/**
 * Applies a single BudgetAdjustment to an OptimizedTripContext and returns
 * a new context with the change applied.
 *
 * Pure function — no mutation, no side effects.
 * Deterministic: identical inputs always produce identical outputs.
 *
 * Actions:
 *  - remove_activity: removes the named activity from its day (never isMeal).
 *  - change_hotel: changes the selected hotel's priceRange to the lower tier.
 *  - replace_restaurant: swaps the named meal to a concrete cheaper alternative
 *    from the activity's restaurantOptions[], then recomputes foodCostSummary
 *    so the ledger stays consistent.
 */
export function applyAdjustment(
    context: OptimizedTripContext,
    adjustment: BudgetAdjustment,
): OptimizedTripContext {
    const { action } = adjustment;

    switch (action.type) {
        case "remove_activity": {
            const { activityId, activityName, day } = action.payload;
            return {
                ...context,
                days: context.days.map((d) => {
                    if (day !== undefined && d.day !== day) return d;
                    return {
                        ...d,
                        activities: d.activities.filter((a) => {
                            if (a.isMeal) return true; // meals are never candidates for removal
                            if (activityId) {
                                // Prefer stable ID matching — immune to duplicate names.
                                const aId = a.id ?? makeActivityId(a, d.day);
                                return aId !== activityId;
                            }
                            // Fallback: name matching when no ID is available.
                            return a.name !== activityName;
                        }),
                    };
                }),
            };
        }

        case "change_hotel": {
            const { hotelTo } = action.payload;
            if (!hotelTo) return context;
            return {
                ...context,
                selectedHotel: {
                    ...context.selectedHotel,
                    priceRange: hotelTo as HotelOption["priceRange"],
                },
            };
        }

        case "replace_restaurant": {
            const { day, restaurantFrom, restaurantTo } = action.payload;

            const newDays = context.days.map((d) => {
                if (day !== undefined && d.day !== day) return d;
                return {
                    ...d,
                    activities: d.activities.map((act) => {
                        // Only touch the matching meal on this day.
                        if (!act.isMeal || act.name !== restaurantFrom) return act;

                        const options     = act.restaurantOptions ?? [];
                        const newOption   = options.find((r) => r.name === restaurantTo);
                        if (!newOption) return act; // target not found — leave unchanged

                        // Swap restaurant content fields; preserve all scheduling +
                        // meal metadata (isMeal, mealType, timeSlot, times, options).
                        return {
                            ...act,
                            name:             newOption.name,
                            description:      newOption.description,
                            estimatedCost:    newOption.estimatedCost,
                            cuisine:          newOption.cuisine,
                            shortDescription: newOption.shortDescription,
                            priceLevel:       newOption.priceLevel,
                        };
                    }),
                };
            });

            // Recompute foodCostSummary from the updated activities so that
            // buildCostLedger (which reads foodCostSummary as its source of
            // truth) will reflect the real new restaurant cost.
            const newFoodSummary = computeFoodCost(newDays);

            return { ...context, days: newDays, foodCostSummary: newFoodSummary };
        }

        default:
            return context;
    }
}

/**
 * Simulates the effect of applying a BudgetAdjustment without mutating state.
 *
 * Returns the projected total and cost breakdown after the adjustment.
 * Safe to call from UI for "preview" tooltips or a dry-run before confirm.
 */
export function simulateAdjustment(
    context: OptimizedTripContext,
    adjustment: BudgetAdjustment,
): { total: number; breakdown: CostBreakdown } {
    const modified = applyAdjustment(context, adjustment);
    const ledger   = buildCostLedger(modified);
    const { total, categories, perDay } = aggregateLedger(ledger, modified.durationDays);
    return {
        total,
        breakdown: { total, categories, perDay },
    };
}

// ─── Atomic Plan Application ──────────────────────────────────────────────────

/**
 * The complete state transition produced by applying an OptimalPlan.
 *
 * The UI replaces its old state wholesale with these values — no partial
 * updates, no manual merging:
 *
 *   const result = applyOptimalPlan(context, plan);
 *   setItinerary(result.updatedContext);
 *   setBudget(result.updatedBudget);
 *   setWarnings(result.warnings);
 */
export interface ApplyPlanResult {
    /** The updated trip context — itinerary changes are baked in. */
    updatedContext: OptimizedTripContext;
    /** Recomputed cost figures derived from the ledger of the updated context. */
    updatedBudget: {
        total: number;
        breakdown: CostBreakdown;
        ledger: CostLineItem[];
    };
    /**
     * Non-fatal warnings surfaced during application.
     * Examples: "Activity X not found — skipped", "Restaurant swap target missing".
     * Empty array means clean application.
     */
    warnings: string[];
}

/**
 * Applies all adjustments in an OptimalPlan atomically and returns the full
 * new state ready for the UI to consume.
 *
 * Contract:
 *  - NEVER mutates the original context.
 *  - Each adjustment is applied via applyAdjustment() (pure, validated).
 *  - Ledger is rebuilt once from the fully-updated context — not per step.
 *  - Invariants verified after application: no empty days, meals preserved.
 *
 * Idempotent: applying the same plan twice produces the same result.
 * Deterministic: identical inputs always produce identical outputs.
 */
export function applyOptimalPlan(
    context: OptimizedTripContext,
    plan: OptimalPlan,
    requestId?: string,
): ApplyPlanResult {
    const warnings: string[] = [];
    let current = context;

    for (const adjustment of plan.appliedAdjustments) {
        const before = current;
        current = applyAdjustment(current, adjustment);

        // Detect no-op: if context reference is unchanged the adjustment found
        // nothing to modify (e.g. restaurant target not in options). Warn but
        // continue — don't abort the whole plan for one miss.
        if (current === before) {
            warnings.push(
                `Adjustment "${adjustment.description}" had no effect — target not found, skipped.`,
            );
        }
    }

    // ── Invariant validation ──────────────────────────────────────────────────
    for (const day of current.days) {
        if (day.activities.length === 0) {
            warnings.push(
                `Day ${day.day} has no activities after plan application — review adjustments.`,
            );
        }
        const meals = day.activities.filter((a) => a.isMeal);
        if (meals.length === 0 && context.days.find((d) => d.day === day.day)?.activities.some((a) => a.isMeal)) {
            // Meals existed before but are gone now — this should never happen
            // since applyAdjustment never removes isMeal activities.
            warnings.push(`Day ${day.day} lost all meal entries — possible data corruption.`);
        }
    }

    // ── Recompute ledger + breakdown from final context ───────────────────────
    const ledger = buildCostLedger(current);
    const { total, categories, perDay } = aggregateLedger(ledger, current.durationDays);
    const breakdown: CostBreakdown = { total, categories, perDay };

    logStructured({
        layer: "agent", agent: "budget", step: "plan_applied", requestId,
        data: {
            appliedCount:  plan.appliedAdjustments.length,
            finalTotal:    total,
            achieved:      plan.achieved,
            warningCount:  warnings.length,
            ...(warnings.length > 0 && { warnings }),
        },
    });

    return {
        updatedContext: current,
        updatedBudget:  { total, breakdown, ledger },
        warnings,
    };
}

// ─── Greedy Combination Solver ────────────────────────────────────────────────

/**
 * Finds the minimal set of adjustments that brings the trip under budget using
 * a greedy algorithm (highest-impact first).
 *
 * Steps:
 *  1. Sort suggestions by impact descending (stable — already sorted on input).
 *  2. Apply each adjustment in order, rebuilding the ledger after each step.
 *  3. Stop as soon as the total falls at or below userBudget.
 *
 * Deterministic: identical inputs → identical plan every time.
 * No LLM involved — pure TypeScript math.
 *
 * Returns undefined when no adjustments are needed (already within budget)
 * or when no combination exists that fully bridges the gap.
 */
function solveOptimalPlan(
    context: OptimizedTripContext,
    suggestions: BudgetAdjustment[],
    userBudget: number,
    requestId?: string,
): OptimalPlan | undefined {
    // Already within budget — no plan needed.
    const initialLedger = buildCostLedger(context);
    const { total: initialTotal } = aggregateLedger(initialLedger, context.durationDays);
    if (initialTotal <= userBudget) return undefined;

    const applied: BudgetAdjustment[] = [];
    let current = context;

    for (const adj of suggestions) {
        if (applied.length > 0) {
            // Re-check after previous adjustment was applied.
            const ledger = buildCostLedger(current);
            const { total } = aggregateLedger(ledger, current.durationDays);
            if (total <= userBudget) break;
        }
        current = applyAdjustment(current, adj);
        applied.push(adj);
        logStructured({
            layer: "agent", agent: "budget", step: "adjustment_applied", requestId,
            data: { type: adj.type, impact: adj.impact, description: adj.description },
        });
    }

    if (applied.length === 0) return undefined;

    // Derive the final state from the fully-applied context.
    const finalLedger = buildCostLedger(current);
    const { total: finalTotal, categories, perDay } = aggregateLedger(
        finalLedger,
        current.durationDays,
    );

    const achieved = finalTotal <= userBudget;

    logStructured({
        layer: "agent", agent: "budget", step: "optimization_complete", requestId,
        data: {
            achieved,
            finalTotal,
            target:             userBudget,
            adjustmentsApplied: applied.length,
            ...(achieved ? {} : { remainingGap: finalTotal - userBudget }),
        },
    });

    return {
        appliedAdjustments: applied,
        finalTotal,
        finalBreakdown: { total: finalTotal, categories, perDay },
        achieved,
    };
}

// ─── Budget Agent ─────────────────────────────────────────────────────────────

export class BudgetAgent {
    /**
     * Calculates the full trip cost via a unified cost ledger, runs the
     * deterministic budget intelligence layer (including the greedy solver),
     * and — when over budget — asks the LLM to rephrase the top adjustments.
     *
     * Guarantees:
     *  - total === sum(costPerDay) === sum(ledger) at all times.
     *  - Food cost comes exclusively from Logistics (context.foodCostSummary).
     *  - isMeal activities never double-counted with the food ledger.
     *  - No LLM for numeric calculations or decisions — only phrasing.
     *  - Deterministic: identical inputs → identical outputs (LLM aside).
     */
    async run(context: OptimizedTripContext, requestId?: string): Promise<BudgetedTripContext> {
        logStructured({ layer: "agent", agent: "budget", step: "start", requestId });
        logStructured({
            layer: "agent", agent: "budget", step: "input", requestId,
            data: {
                destination:   context.destination,
                hotel:         context.selectedHotel.name,
                hotelTier:     context.selectedHotel.priceRange,
                days:          context.days.length,
                hasFoodSummary: Boolean(context.foodCostSummary),
            },
        });

        // ── Build ledger ──────────────────────────────────────────────────────
        const ledger = buildCostLedger(context);
        const { perDay: costPerDay, total: totalEstimatedCost, categories } =
            aggregateLedger(ledger, context.durationDays);

        logStructured({
            layer: "agent", agent: "budget", step: "ledger_built", requestId,
            data: {
                items:    ledger.length,
                total:    totalEstimatedCost,
                hotel:    categories.hotel,
                food:     categories.food,
                activity: categories.activity,
            },
        });

        const costBreakdown: CostBreakdown = { perDay: costPerDay, total: totalEstimatedCost, categories };

        // ── Budget constraint evaluation ──────────────────────────────────────
        const userBudget  = context.preferences?.budget;
        const hasBudget   = userBudget != null && isFinite(userBudget);
        const isOverBudget = hasBudget ? totalEstimatedCost > userBudget! : false;
        const budgetGap   = isOverBudget ? totalEstimatedCost - userBudget! : undefined;

        logStructured({
            layer: "agent", agent: "budget", step: "output", requestId,
            data: { totalEstimatedCost, userBudget, isOverBudget, budgetGap },
        });

        // ── Deterministic intelligence layer ──────────────────────────────────
        let budgetAnalysis: BudgetAnalysis | undefined;
        if (hasBudget) {
            const delta       = totalEstimatedCost - userBudget!;
            const suggestions = delta > 0
                ? generateBudgetAdjustments(ledger, costBreakdown, context)
                : [];

            // Greedy solver: find the minimal set of adjustments that closes gap.
            const optimalPlan = delta > 0
                ? solveOptimalPlan(context, suggestions, userBudget!, requestId)
                : undefined;

            budgetAnalysis = { delta, suggestions, ...(optimalPlan && { optimalPlan }) };

            logStructured({
                layer: "agent", agent: "budget", step: "budget_analysis", requestId,
                data: {
                    isOverBudget,
                    delta,
                    suggestionsCount: suggestions.length,
                },
            });

            if (optimalPlan) {
                logStructured({
                    layer: "agent", agent: "budget", step: "budget_optimization", requestId,
                    data: {
                        originalTotal:       totalEstimatedCost,
                        finalTotal:          optimalPlan.finalTotal,
                        adjustmentsApplied:  optimalPlan.appliedAdjustments.length,
                        stillOverBudget:     optimalPlan.finalTotal > userBudget!,
                    },
                });
            }
        }

        // ── LLM rephrasing (only when over budget) ────────────────────────────
        let suggestions: string[] | undefined;
        if (isOverBudget) {
            suggestions = await this.fetchSuggestions(
                context,
                budgetGap!,
                budgetAnalysis?.suggestions ?? [],
                requestId,
            );
        }

        const budget: BudgetResult = {
            totalEstimatedCost,
            costPerDay,
            isOverBudget,
            ledger,
            costBreakdown,
            ...(budgetGap    !== undefined && { budgetGap }),
            ...(suggestions  !== undefined && { suggestions }),
            ...(budgetAnalysis !== undefined && { budgetAnalysis }),
        };

        logStructured({
            layer: "agent", agent: "budget", step: "end", requestId,
            data: {
                totalEstimatedCost,
                isOverBudget,
                adjustments: budgetAnalysis?.suggestions.length ?? 0,
                suggestions: suggestions?.length ?? 0,
            },
        });

        return { ...context, budget };
    }

    /**
     * Asks the LLM to rephrase the deterministic adjustments as friendly tips.
     * The adjustments are supplied as explicit grounding — the LLM cannot
     * invent its own numbers or change the decisions. Returns undefined on
     * failure (non-blocking — the numeric output is already complete).
     */
    private async fetchSuggestions(
        context: OptimizedTripContext,
        budgetGap: number,
        adjustments: BudgetAdjustment[],
        requestId?: string,
    ): Promise<string[] | undefined> {
        const systemPrompt =
            "You are a friendly travel budget advisor. " +
            "Return ONLY valid JSON in this exact shape: { \"suggestions\": string[] }. " +
            "Each suggestion is one concise, friendly sentence (max 12 words). " +
            "Maximum 3 suggestions. " +
            "Rephrase the provided trade-offs in natural language — do not invent new ones. " +
            "Do NOT change dates, destinations, or itinerary order. " +
            "No extra fields. No explanation outside the JSON.";

        const adjustmentContext = adjustments.length > 0
            ? "\n\nIdentified trade-offs (rephrase these — do not invent others):\n" +
              adjustments
                  .slice(0, 3)
                  .map((a, i) => `${i + 1}. ${a.description}`)
                  .join("\n")
            : "";

        const styleNote = context.preferences?.style
            ? ` The traveller prefers a "${context.preferences.style}" travel style.`
            : "";

        const userPrompt =
            `Trip to ${context.destination} (${context.durationDays} day(s)) is $${budgetGap} over budget.\n` +
            `User budget: $${context.preferences?.budget ?? "not set"}\n` +
            `Hotel: ${context.selectedHotel.name} (${context.selectedHotel.priceRange})` +
            styleNote +
            adjustmentContext;

        try {
            const client = LLMClientFactory.create({ agent: "budget" });
            logStructured({
                layer: "agent", agent: "budget", step: "llm-call", requestId,
                data: { purpose: "rephrase_adjustments", budgetGap, adjustmentCount: adjustments.length },
            });
            const llmResponse = await executeWithRetry(
                client,
                [
                    { role: "system", content: systemPrompt },
                    { role: "user",   content: userPrompt   },
                ],
                {
                    ...selectModelConfig({ endpoint: "budget" }),
                    responseFormat: "json" as const,
                    retries: 2,
                },
            );
            logStructured({
                layer: "agent", agent: "budget", step: "llm-response", requestId,
                data: { contentLength: llmResponse.content.length },
            });

            const parsed = parseJSONResponse<{ suggestions?: unknown }>(llmResponse.content);
            if (!Array.isArray(parsed?.suggestions)) return undefined;

            return (parsed.suggestions as unknown[])
                .filter((s): s is string => typeof s === "string")
                .slice(0, 3);
        } catch (err) {
            logStructured({
                layer: "agent", agent: "budget", step: "error", requestId,
                data: { purpose: "rephrase_adjustments", error: trunc((err as Error).message) },
            });
            logError("[BudgetAgent] LLM suggestion rephrasing failed — skipping", err);
            return undefined;
        }
    }
}
