import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { logError } from "@/infrastructure/logger";

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ScheduledActivity = {
    name: string;
    type: "attraction" | "experience" | "restaurant";
    description: string;
    estimatedCost?: number;
    timeSlot: "morning" | "afternoon" | "evening";
};

export type OptimizedDay = {
    day: number;
    theme: string;
    activities: ScheduledActivity[];
};

export type HotelOption = {
    name: string;
    priceRange: "$" | "$$" | "$$$" | "$$$$";
    area: string;
    tags: string[];
    rating?: number;
};

export type OptimizedTripContext = {
    destination: string;
    durationDays: number;
    preferences?: {
        budget?: number;
        style?: string;
    };
    days: OptimizedDay[];
    selectedHotel: HotelOption;
};

export type BudgetResult = {
    totalEstimatedCost: number;
    costPerDay: number[];
    isOverBudget: boolean;
    budgetGap?: number;
    suggestions?: string[];
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

const ACTIVITY_RANGE: Record<ScheduledActivity["type"], [number, number]> = {
    attraction: [20, 50],
    experience: [50, 150],
    restaurant: [15, 40],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tiny deterministic hash so a missing estimatedCost always maps to the same
 * integer within the type's range — no randomness between runs.
 */
function deterministicCost(name: string, type: ScheduledActivity["type"]): number {
    const [min, max] = ACTIVITY_RANGE[type];
    let h = 5381;
    const str = name + type;
    for (let i = 0; i < str.length; i++) {
        h = (h * 33) ^ str.charCodeAt(i);
        h = h >>> 0; // keep uint32
    }
    return min + (h % (max - min + 1));
}

function resolveActivityCost(activity: ScheduledActivity): number {
    if (activity.estimatedCost != null) {
        const rounded = Math.round(Number(activity.estimatedCost));
        if (!isNaN(rounded)) return rounded;
    }
    return deterministicCost(activity.name, activity.type);
}

function hotelNightly(priceRange: HotelOption["priceRange"]): number {
    return HOTEL_NIGHTLY[priceRange] ?? HOTEL_NIGHTLY["$$"];
}

// ─── Budget Agent ─────────────────────────────────────────────────────────────

export class BudgetAgent {
    /**
     * Calculates total trip cost, evaluates budget constraints, and — when the
     * trip is over budget — asks the LLM for up to 3 terse suggestions.
     * All numeric logic is performed in TypeScript; the LLM is never trusted
     * for calculations.
     */
    async run(context: OptimizedTripContext): Promise<BudgetedTripContext> {
        const nightly = hotelNightly(context.selectedHotel.priceRange);

        // Initialize costPerDay with hotel cost for each night.
        const costPerDay: number[] = Array.from(
            { length: context.durationDays },
            () => nightly,
        );

        // Distribute activity costs into the correct day bucket.
        for (const optimizedDay of context.days ?? []) {
            const idx = optimizedDay.day - 1;
            if (idx < 0 || idx >= context.durationDays) continue;
            for (const activity of optimizedDay.activities ?? []) {
                costPerDay[idx] += resolveActivityCost(activity);
            }
        }

        let totalEstimatedCost = costPerDay.reduce((sum, d) => sum + d, 0);

        // Guard degenerate zero-cost case so the invariant totalEstimatedCost > 0 holds.
        if (totalEstimatedCost <= 0) totalEstimatedCost = 1;

        // ── Budget constraint evaluation ──────────────────────────────────────
        const userBudget = context.preferences?.budget;
        const hasBudget =
            userBudget != null && isFinite(userBudget);

        const isOverBudget = hasBudget
            ? totalEstimatedCost > userBudget!
            : false;

        const budgetGap =
            isOverBudget ? totalEstimatedCost - userBudget! : undefined;

        // ── LLM suggestions (only when over budget) ───────────────────────────
        let suggestions: string[] | undefined;
        if (isOverBudget) {
            suggestions = await this.fetchSuggestions(context, budgetGap!);
        }

        const budget: BudgetResult = {
            totalEstimatedCost,
            costPerDay,
            isOverBudget,
            ...(budgetGap !== undefined && { budgetGap }),
            ...(suggestions !== undefined && { suggestions }),
        };

        return { ...context, budget };
    }

    private async fetchSuggestions(
        context: OptimizedTripContext,
        budgetGap: number,
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
            const client = getLLMClient();
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

            const parsed = parseJSONResponse<{ suggestions?: unknown }>(
                llmResponse.content,
            );

            if (!Array.isArray(parsed?.suggestions)) return undefined;

            return (parsed.suggestions as unknown[])
                .filter((s): s is string => typeof s === "string")
                .slice(0, 3);
        } catch (err) {
            logError("[BudgetAgent] LLM suggestion generation failed — skipping", err);
            return undefined;
        }
    }
}
