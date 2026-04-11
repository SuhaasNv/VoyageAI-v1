import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { logError, logStructured, trunc } from "@/infrastructure/logger";
import type {
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

export type BudgetResult = {
    totalEstimatedCost: number;
    costPerDay: number[];
    isOverBudget: boolean;
    budgetGap?: number;
    suggestions?: string[];
    /** Itemised ledger — every cost is traceable to a named line item. */
    ledger: CostLineItem[];
    /** Category/day aggregation derived from the ledger. */
    costBreakdown: CostBreakdown;
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

/**
 * Fallback cost range for non-meal scheduled activities.
 * Note: `restaurant` here applies only to explicitly scheduled restaurant
 * visits (isMeal === false). Injected meal activities are handled by Logistics.
 */
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic hash so a missing estimatedCost always maps to the same
 * integer within the type's activity cost range — no randomness between runs.
 * Only used for non-meal scheduled activities.
 */
function deterministicActivityCost(name: string, type: ScheduledActivity["type"]): number {
    const [min, max] = ACTIVITY_RANGE[type];
    let h = 5381;
    const str = name + type;
    for (let i = 0; i < str.length; i++) {
        h = (h * 33) ^ str.charCodeAt(i);
        h = h >>> 0; // keep uint32
    }
    return min + (h % (max - min + 1));
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

// ─── Cost Ledger Builder ──────────────────────────────────────────────────────

/**
 * Builds a fully itemised cost ledger.
 *
 * Guarantees:
 *  - Hotel:    (durationDays - 1) nights; each night is a separate line item.
 *              A single-day trip produces zero hotel cost (no overnight stay).
 *  - Food:     Consumed verbatim from context.foodCostSummary.perDay (Logistics
 *              is the single source of truth for food costs). Falls back to
 *              resolving isMeal activities when the summary is absent, using the
 *              same cost resolution order as routingUtils.computeFoodCost().
 *  - Activity: Non-meal scheduled activities only. isMeal === true entries are
 *              excluded because food costs are already in the ledger above.
 *
 * No LLM calls. Pure, deterministic.
 */
function buildCostLedger(context: OptimizedTripContext): CostLineItem[] {
    const ledger: CostLineItem[] = [];
    const nightly = hotelNightly(context.selectedHotel.priceRange);

    // nights = check-out day minus check-in day; a 1-day trip has no overnight.
    const nights = Math.max(0, context.durationDays - 1);

    // ── Hotel ─────────────────────────────────────────────────────────────────
    for (let i = 0; i < nights; i++) {
        ledger.push({
            day: i + 1,
            category: "hotel",
            name: context.selectedHotel.name,
            amount: nightly,
            meta: { source: "fallback" }, // flat rate table lookup
        });
    }

    // ── Food (Logistics is the single source of truth) ────────────────────────
    const foodPerDay = context.foodCostSummary?.perDay;

    if (Array.isArray(foodPerDay) && foodPerDay.length > 0) {
        // Primary path: use Logistics-computed per-day food cost verbatim.
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
        // Fallback path (no foodCostSummary): resolve from isMeal activities
        // using the same priority chain as routingUtils.computeFoodCost().
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
            // isMeal activities are excluded — their cost is already in food above.
            if (activity.isMeal) continue;

            const { amount, source } = resolveActivityCost(activity);
            ledger.push({
                day: optimizedDay.day,
                category: "activity",
                name: activity.name,
                amount,
                meta: { source },
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
    const categories: CostBreakdown["categories"] = {
        hotel: 0,
        food: 0,
        activity: 0,
        other: 0,
    };

    for (const item of ledger) {
        const dayIdx = item.day - 1;
        if (dayIdx >= 0 && dayIdx < durationDays) {
            perDay[dayIdx] += item.amount;
        }
        // Route to the correct category bucket; unknown categories go to "other".
        if (item.category === "hotel") categories.hotel += item.amount;
        else if (item.category === "food") categories.food += item.amount;
        else if (item.category === "activity") categories.activity += item.amount;
        else categories.other += item.amount;
    }

    // Derive total from the ledger — never from an independent accumulator.
    const total = ledger.reduce((sum, item) => sum + item.amount, 0);

    return { perDay, total, categories };
}

// ─── Budget Agent ─────────────────────────────────────────────────────────────

export class BudgetAgent {
    /**
     * Calculates the full trip cost via a unified cost ledger, evaluates
     * budget constraints, and — when the trip is over budget — asks the LLM
     * for up to 3 terse cost-reduction suggestions.
     *
     * Guarantees:
     *  - total === sum(costPerDay) === sum(ledger items) at all times.
     *  - Food cost comes exclusively from Logistics (context.foodCostSummary)
     *    when available; falls back to isMeal activity resolution otherwise.
     *  - isMeal activities are never double-counted with the food ledger.
     *  - No LLM calls for numeric calculations.
     */
    async run(context: OptimizedTripContext, requestId?: string): Promise<BudgetedTripContext> {
        logStructured({
            layer: "agent", agent: "budget", step: "start", requestId,
        });
        logStructured({
            layer: "agent", agent: "budget", step: "input", requestId,
            data: {
                destination: context.destination,
                hotel: context.selectedHotel.name,
                hotelTier: context.selectedHotel.priceRange,
                days: context.days.length,
                hasFoodSummary: Boolean(context.foodCostSummary),
            },
        });

        // ── Build ledger (single source of truth) ─────────────────────────────
        const ledger = buildCostLedger(context);
        const { perDay: costPerDay, total: totalEstimatedCost, categories } =
            aggregateLedger(ledger, context.durationDays);

        logStructured({
            layer: "agent", agent: "budget", step: "ledger_built", requestId,
            data: {
                items: ledger.length,
                total: totalEstimatedCost,
                hotel: categories.hotel,
                food: categories.food,
                activity: categories.activity,
            },
        });

        const costBreakdown: CostBreakdown = {
            perDay: costPerDay,
            total: totalEstimatedCost,
            categories,
        };

        // ── Budget constraint evaluation ──────────────────────────────────────
        const userBudget = context.preferences?.budget;
        const hasBudget = userBudget != null && isFinite(userBudget);
        const isOverBudget = hasBudget ? totalEstimatedCost > userBudget! : false;
        const budgetGap = isOverBudget ? totalEstimatedCost - userBudget! : undefined;

        logStructured({
            layer: "agent", agent: "budget", step: "output", requestId,
            data: { totalEstimatedCost, userBudget, isOverBudget, budgetGap },
        });

        // ── LLM suggestions (only when over budget) ───────────────────────────
        let suggestions: string[] | undefined;
        if (isOverBudget) {
            suggestions = await this.fetchSuggestions(context, budgetGap!, requestId);
        }

        const budget: BudgetResult = {
            totalEstimatedCost,
            costPerDay,
            isOverBudget,
            ledger,
            costBreakdown,
            ...(budgetGap !== undefined && { budgetGap }),
            ...(suggestions !== undefined && { suggestions }),
        };

        logStructured({
            layer: "agent", agent: "budget", step: "end", requestId,
            data: { totalEstimatedCost, isOverBudget, suggestions: suggestions?.length ?? 0 },
        });

        return { ...context, budget };
    }

    private async fetchSuggestions(
        context: OptimizedTripContext,
        budgetGap: number,
        requestId?: string,
    ): Promise<string[] | undefined> {
        const systemPrompt =
            "You are a travel budget advisor. " +
            "Return ONLY valid JSON in this exact shape: { \"suggestions\": string[] }. " +
            "Each suggestion is one short sentence (max 10 words). " +
            "Maximum 3 suggestions. " +
            "Do NOT change dates, destinations, or itinerary order. " +
            "Do NOT fetch new activities. " +
            "Focus only on cost reduction options. " +
            "No extra fields. No explanation outside the JSON.";

        const styleNote = context.preferences?.style
            ? ` The traveller prefers a "${context.preferences.style}" travel style.`
            : "";

        const userPrompt =
            "Generate budget constraint suggestions for this over-budget trip.\n\n" +
            `Destination: ${context.destination}\n` +
            `Duration: ${context.durationDays} day(s)\n` +
            `User budget: $${context.preferences?.budget ?? "not set"}\n` +
            `Budget gap: $${budgetGap} over the user budget\n` +
            `Hotel: ${context.selectedHotel.name} (${context.selectedHotel.priceRange})` +
            styleNote;

        try {
            const client = LLMClientFactory.create({ agent: "budget" });
            logStructured({
                layer: "agent", agent: "budget", step: "llm-call", requestId,
                data: { purpose: "suggestions", budgetGap },
            });
            const llmResponse = await executeWithRetry(
                client,
                [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
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
                data: { purpose: "suggestions", error: trunc((err as Error).message) },
            });
            logError("[BudgetAgent] LLM suggestion generation failed — skipping", err);
            return undefined;
        }
    }
}
