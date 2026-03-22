/**
 * Research Agent — Evan
 *
 * Enriches a TripContext with:
 *   - 3–5 activities per day (attractions, experiences, restaurants)
 *   - 3–5 hotel options total (MANDATORY — not per day)
 *
 * Data pipeline:
 *   1. Parallel Bright Data searches ground the LLM in real-world results.
 *   2. Grounding context + trip structure are fed to the LLM.
 *   3. LLM returns structured JSON conforming to EnrichedTripContext.
 *   4. Output is validated and sanitized before merging back into context.
 *
 * This agent MUST NOT: select a final hotel, optimise routes, calculate
 * cost totals, modify dates/duration, or call other agents.
 */

import { getLLMClient, createLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { selectModelConfig } from "../../lib/ai/modelRouter";
import { buildFullPrompt } from "../../lib/ai/prompts/index";
import { logError, logInfo } from "@/infrastructure/logger";
import {
    searchAttractions,
    searchHotels,
    searchRestaurants,
} from "../../tools/brightDataTool";
import {
    RESEARCH_SYSTEM_PROMPT,
    RESEARCH_SCHEMA_INSTRUCTION,
} from "./researchPrompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripContext {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    preferences?: {
        budget?: number;
        style?: string;
        pace?: string;
    };
    days: Array<{
        day: number;
        theme: string;
    }>;
}

export type ActivityType = "attraction" | "experience" | "restaurant";

export interface Activity {
    name: string;
    type: ActivityType;
    description: string;
    estimatedCost?: number;
}

export type PriceRange = "$" | "$$" | "$$$" | "$$$$";

export interface HotelOption {
    name: string;
    priceRange: PriceRange;
    area: string;
    tags: string[];
    rating?: number;
}

export interface EnrichedDay {
    day: number;
    theme: string;
    activities: Activity[];
}

export type EnrichedTripContext = TripContext & {
    days: EnrichedDay[];
    hotels: HotelOption[];
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Map a numeric budget hint to a Bright Data query budget string. */
function budgetHint(preferences?: TripContext["preferences"]): string | undefined {
    if (!preferences?.budget) return undefined;
    if (preferences.budget < 100) return "budget cheap";
    if (preferences.budget < 300) return "mid-range";
    return "luxury";
}

/** Map a style preference to a price range cap for hotel filtering. */
function maxHotelPriceRange(style?: string): PriceRange {
    if (!style) return "$$$$";
    const lower = style.toLowerCase();
    if (lower === "luxury") return "$$$$";
    if (lower === "adventure" || lower === "relaxed") return "$$$";
    return "$$$$";
}

const PRICE_RANK: Record<PriceRange, number> = { $: 1, "$$": 2, "$$$": 3, "$$$$": 4 };

/** True if priceRange is within the allowed maximum. */
function withinBudget(priceRange: PriceRange, max: PriceRange): boolean {
    return PRICE_RANK[priceRange] <= PRICE_RANK[max];
}

/** Normalise a string for deduplication comparison. */
function normaliseName(name: string): string {
    return name.toLowerCase().trim();
}

/**
 * Validate, sanitise, and preference-filter raw LLM output.
 *
 * Throws if:
 *   - hotels array is missing or empty (mandatory)
 *   - any hotel has an empty name
 *   - any activity has an empty name
 */
function validateAndSanitize(
    raw: unknown,
    context: TripContext
): { days: EnrichedDay[]; hotels: HotelOption[] } {
    if (typeof raw !== "object" || raw === null) {
        throw new Error("[ResearchAgent] LLM output is not an object");
    }

    const obj = raw as Record<string, unknown>;
    const style = context.preferences?.style;
    const maxPrice = maxHotelPriceRange(style);

    // ── Hotels ──────────────────────────────────────────────────────────────
    if (!Array.isArray(obj.hotels) || (obj.hotels as unknown[]).length === 0) {
        throw new Error("[ResearchAgent] hotels array is empty — mandatory field");
    }

    const seenHotels = new Set<string>();
    const hotels: HotelOption[] = (obj.hotels as unknown[])
        .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
        .filter((h) => {
            const name = (h.name as string | undefined) ?? "";
            return name.trim().length > 0;
        })
        .filter((h) => {
            const pr = h.priceRange as PriceRange | undefined;
            return pr ? withinBudget(pr, maxPrice) : true;
        })
        .reduce<HotelOption[]>((acc, h) => {
            const key = normaliseName((h.name as string) ?? "");
            if (seenHotels.has(key)) return acc;
            seenHotels.add(key);

            acc.push({
                name: (h.name as string).trim(),
                priceRange: (h.priceRange as PriceRange) ?? "$$",
                area: typeof h.area === "string" ? h.area.trim() : "",
                tags: Array.isArray(h.tags)
                    ? (h.tags as unknown[])
                        .filter((t) => typeof t === "string" && t.trim().length > 0)
                        .map((t) => (t as string).trim())
                    : [],
                ...(typeof h.rating === "number" ? { rating: Math.min(5, Math.max(1, h.rating)) } : {}),
            });
            return acc;
        }, [])
        .slice(0, 5);

    if (hotels.length < 3) {
        throw new Error(
            `[ResearchAgent] hotels has only ${hotels.length} valid entries (minimum 3 required)`
        );
    }

    // ── Days / Activities ────────────────────────────────────────────────────
    const inputDays = new Map(context.days.map((d) => [d.day, d.theme]));
    const rawDays = Array.isArray(obj.days) ? (obj.days as unknown[]) : [];

    const seenActivities = new Set<string>();
    const days: EnrichedDay[] = rawDays
        .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
        .map((d) => {
            const dayNum = typeof d.day === "number" ? d.day : 0;
            const theme = (inputDays.get(dayNum) ?? (typeof d.theme === "string" ? d.theme : "")).trim();

            const rawActivities = Array.isArray(d.activities) ? (d.activities as unknown[]) : [];
            const isAdventureStyle = style?.toLowerCase() === "adventure";

            const activities: Activity[] = rawActivities
                .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
                .filter((a) => {
                    const name = (a.name as string | undefined) ?? "";
                    return name.trim().length > 0;
                })
                .filter((a) => {
                    // For relaxed style, deprioritise adventure — keep only 1 max
                    if (style?.toLowerCase() === "relaxed" && a.type === "adventure") return false;
                    return true;
                })
                .reduce<Activity[]>((acc, a) => {
                    if (acc.length >= 5) return acc;
                    const key = normaliseName((a.name as string) ?? "");
                    if (seenActivities.has(key)) return acc;
                    seenActivities.add(key);

                    const validTypes: ActivityType[] = ["attraction", "experience", "restaurant"];
                    const type: ActivityType = validTypes.includes(a.type as ActivityType)
                        ? (a.type as ActivityType)
                        : "attraction";

                    acc.push({
                        name: (a.name as string).trim(),
                        type,
                        description: typeof a.description === "string" ? a.description.trim() : "",
                        ...(typeof a.estimatedCost === "number" && a.estimatedCost >= 0
                            ? { estimatedCost: a.estimatedCost }
                            : {}),
                    });
                    return acc;
                }, []);

            // Adventure style: ensure at least one adventure/experience activity exists
            const hasExperience = activities.some((a) => a.type === "experience");
            if (isAdventureStyle && !hasExperience && activities.length > 0) {
                activities[0] = { ...activities[0], type: "experience" };
            }

            return { day: dayNum, theme, activities };
        });

    return { days, hotels };
}

/** Merge sanitised LLM output back into the original context, preserving all fields. */
function mergeIntoContext(
    context: TripContext,
    enriched: { days: EnrichedDay[]; hotels: HotelOption[] }
): EnrichedTripContext {
    const enrichedDayMap = new Map(enriched.days.map((d) => [d.day, d]));

    const mergedDays: EnrichedDay[] = context.days.map((inputDay) => {
        const enrichedDay = enrichedDayMap.get(inputDay.day);
        return {
            day: inputDay.day,
            theme: inputDay.theme,
            activities: enrichedDay?.activities ?? [],
        };
    });

    return {
        ...context,
        days: mergedDays,
        hotels: enriched.hotels,
    };
}

// ─── ResearchAgent ────────────────────────────────────────────────────────────

export class ResearchAgent {
    /**
     * Enrich a TripContext with attractions, experiences, restaurants, and
     * mandatory hotel options sourced from Bright Data + LLM structuring.
     *
     * @throws if hotels cannot be populated after one retry
     */
    async run(context: TripContext): Promise<EnrichedTripContext> {
        logInfo("[ResearchAgent] starting enrichment", {
            destination: context.destination,
            days: context.durationDays,
        });

        // ── Step 1: Parallel Bright Data searches ──────────────────────────
        const budget = budgetHint(context.preferences);
        const themes = context.days.map((d) => d.theme).join(", ");

        const [attractionsRaw, hotelsRaw, restaurantsRaw] = await Promise.all([
            searchAttractions(context.destination, themes),
            searchHotels(context.destination, budget),
            searchRestaurants(context.destination),
        ]);

        const hasGrounding = attractionsRaw || hotelsRaw || restaurantsRaw;
        if (!hasGrounding) {
            logInfo("[ResearchAgent] no Bright Data results — proceeding with LLM-only generation");
        }

        // ── Step 2: Build grounding context ───────────────────────────────
        const groundingParts: string[] = [];
        if (attractionsRaw) groundingParts.push(`## Attractions & Experiences\n${attractionsRaw}`);
        if (hotelsRaw) groundingParts.push(`## Hotels & Accommodation\n${hotelsRaw}`);
        if (restaurantsRaw) groundingParts.push(`## Restaurants & Dining\n${restaurantsRaw}`);
        const groundingContext = groundingParts.join("\n\n");

        // ── Step 3: Build LLM prompt ───────────────────────────────────────
        const daysList = context.days
            .map((d) => `  - Day ${d.day}: ${d.theme}`)
            .join("\n");

        const prefSummary = context.preferences
            ? [
                context.preferences.budget != null
                    ? `Budget: $${context.preferences.budget}/day`
                    : null,
                context.preferences.style ? `Style: ${context.preferences.style}` : null,
                context.preferences.pace ? `Pace: ${context.preferences.pace}` : null,
              ]
                .filter(Boolean)
                .join(", ")
            : "No specific preferences";

        const task = `
## Task
Enrich this trip plan with realistic options for activities and hotels.

Destination: ${context.destination}
Duration: ${context.durationDays} days (${context.startDate} → ${context.endDate})
Traveler preferences: ${prefSummary}

Days to enrich:
${daysList}

Instructions:
- Use the web search results above as your primary source of places.
- Provide 3–5 activities per day matching each day's theme.
- Provide exactly 3–5 hotel options total (shared across all days).
- Hotels are MANDATORY — you must include them.
- Return ONLY the JSON object. No markdown, no commentary.
`.trim();

        const fullPrompt = buildFullPrompt({
            system: RESEARCH_SYSTEM_PROMPT,
            context: groundingContext,
            schema: RESEARCH_SCHEMA_INSTRUCTION,
            task,
        });

        // Prefer GPT-4.1 (OpenAI) for the Research Agent; fall back to the
        // globally-configured provider if OPENAI_API_KEY is not available.
        const client = process.env.OPENAI_API_KEY
            ? createLLMClient("openai")
            : getLLMClient();

        const modelConfig = selectModelConfig({ endpoint: "research" });
        const llmOptions = {
            ...modelConfig,
            // Always target gpt-4.1 when we have an OpenAI key, regardless of
            // what the global LLM_PROVIDER resolves to.
            model: process.env.OPENAI_API_KEY ? "gpt-4.1" : modelConfig.model,
            responseFormat: "json" as const,
            retries: 1,
        };

        // ── Step 4: LLM call with single retry on validation failure ───────
        const attempt = async (): Promise<EnrichedTripContext> => {
            const llmResponse = await executeWithRetry(
                client,
                [{ role: "user", content: fullPrompt }],
                llmOptions
            );
            const raw = parseJSONResponse<unknown>(llmResponse.content);
            const sanitized = validateAndSanitize(raw, context);
            return mergeIntoContext(context, sanitized);
        };

        try {
            return await attempt();
        } catch (firstErr) {
            logError("[ResearchAgent] first attempt failed — retrying once", firstErr);
            try {
                return await attempt();
            } catch (secondErr) {
                logError("[ResearchAgent] failed after retry — hotels could not be populated", secondErr);
                throw secondErr;
            }
        }
    }
}
