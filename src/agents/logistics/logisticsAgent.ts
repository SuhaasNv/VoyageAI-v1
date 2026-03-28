import { LLMClientFactory, parseJSONResponse } from "@/lib/ai/llm";
import { logInfo, logError, logStructured, trunc } from "@/infrastructure/logger";

// ─────────────────────────────────────────
//  Domain Types
// ─────────────────────────────────────────

export type Activity = {
    name: string;
    type: "attraction" | "experience" | "restaurant";
    description: string;
    estimatedCost?: number;
};

export type HotelOption = {
    name: string;
    priceRange: "$" | "$$" | "$$$" | "$$$$";
    area: string;
    tags: string[];
    rating?: number;
};

export type EnrichedDay = {
    day: number;
    theme: string;
    activities: Activity[];
};

export type EnrichedTripContext = {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    preferences?: {
        budget?: number;
        style?: string;
        pace?: string;
    };
    days: EnrichedDay[];
    hotels: HotelOption[];
};

export type ScheduledActivity = Activity & {
    timeSlot: "morning" | "afternoon" | "evening";
};

export type OptimizedDay = {
    day: number;
    theme: string;
    activities: ScheduledActivity[];
};

export type OptimizedTripContext = Omit<EnrichedTripContext, "days"> & {
    days: OptimizedDay[];
    selectedHotel: HotelOption;
};

// ─────────────────────────────────────────
//  Internal constants
// ─────────────────────────────────────────

type TimeSlot = "morning" | "afternoon" | "evening";

const VALID_SLOTS = new Set<string>(["morning", "afternoon", "evening"]);

// Natural slot preference per activity type
const SLOT_PREFERENCE: Record<Activity["type"], TimeSlot> = {
    attraction: "morning",
    experience: "afternoon",
    restaurant: "evening",
};

// Below this estimated daily budget (USD), penalise $$$$ hotels
const BUDGET_LUXURY_THRESHOLD = 1500;

// ─────────────────────────────────────────
//  Preprocessing
// ─────────────────────────────────────────

function paceToCap(pace?: string): number {
    if (!pace) return 4;
    const p = pace.toLowerCase();
    if (p.includes("slow") || p.includes("relax")) return 3;
    if (p.includes("fast") || p.includes("pack") || p.includes("intense")) return 5;
    return 4;
}

/**
 * Deduplicates within a day and caps at the pace-derived target, preserving
 * type diversity: one of each type is kept first before filling remainder.
 */
function selectActivities(activities: Activity[], cap: number): Activity[] {
    const seen = new Set<string>();
    const unique: Activity[] = [];
    for (const act of activities) {
        const key = `${act.type}|${act.name.trim().toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(act);
        }
    }
    if (unique.length <= cap) return unique;

    // Round-robin by type to maximise variety when trimming
    const groups: Record<Activity["type"], Activity[]> = {
        attraction: unique.filter((a) => a.type === "attraction"),
        experience: unique.filter((a) => a.type === "experience"),
        restaurant: unique.filter((a) => a.type === "restaurant"),
    };
    const typeOrder: Activity["type"][] = ["attraction", "experience", "restaurant"];
    const result: Activity[] = [];
    while (result.length < cap) {
        let added = false;
        for (const t of typeOrder) {
            if (result.length >= cap) break;
            const next = groups[t].shift();
            if (next) { result.push(next); added = true; }
        }
        if (!added) break;
    }
    return result;
}

function preprocessContext(context: EnrichedTripContext): EnrichedTripContext {
    const cap = paceToCap(context.preferences?.pace);
    const days = context.days.map((d): EnrichedDay => {
        // Guard against empty days
        const activities = d.activities.length > 0
            ? d.activities
            : [{
                name: `Free time in ${context.destination}`,
                type: "experience" as const,
                description: `Explore ${context.destination} at your own pace.`,
            }];
        return { ...d, activities: selectActivities(activities, cap) };
    });
    return { ...context, days };
}

// ─────────────────────────────────────────
//  Deterministic slot assignment
// ─────────────────────────────────────────

/**
 * Assigns time slots to a day's activities using preference-based bucketing,
 * then fixes any consecutive same-type runs to ensure variety.
 */
function assignSlots(activities: Activity[]): ScheduledActivity[] {
    if (activities.length === 0) return [];

    const buckets: Record<TimeSlot, Activity[]> = { morning: [], afternoon: [], evening: [] };
    for (const act of activities) {
        buckets[SLOT_PREFERENCE[act.type]].push(act);
    }

    // Overflow extra morning attractions into afternoon to avoid back-to-back
    while (buckets.morning.length > 1) {
        buckets.afternoon.unshift(buckets.morning.pop()!);
    }

    // Flatten in slot order, carrying the assigned slot
    const ordered: Array<{ act: Activity; slot: TimeSlot }> = [
        ...buckets.morning.map((act) => ({ act, slot: "morning" as TimeSlot })),
        ...buckets.afternoon.map((act) => ({ act, slot: "afternoon" as TimeSlot })),
        ...buckets.evening.map((act) => ({ act, slot: "evening" as TimeSlot })),
    ];

    // Eliminate consecutive same-type by swapping forward
    for (let i = 0; i < ordered.length - 1; i++) {
        if (ordered[i]!.act.type === ordered[i + 1]!.act.type) {
            const swapIdx = ordered.findIndex(
                (item, idx) => idx > i + 1 && item.act.type !== ordered[i]!.act.type,
            );
            if (swapIdx !== -1) {
                [ordered[i + 1], ordered[swapIdx]] = [ordered[swapIdx]!, ordered[i + 1]!];
            }
        }
    }

    return ordered.map(({ act, slot }) => ({ ...act, timeSlot: slot }));
}

// ─────────────────────────────────────────
//  Hotel selection
// ─────────────────────────────────────────

const PLACEHOLDER_HOTEL: HotelOption = {
    name: "Accommodation — to be confirmed",
    priceRange: "$$",
    area: "Central",
    tags: [],
};

function tokenize(text: string): Set<string> {
    return new Set(
        text.toLowerCase()
            .split(/\W+/)
            .filter((t) => t.length > 2),
    );
}

function scoreHotel(hotel: HotelOption, context: EnrichedTripContext): number {
    const corpus = context.days
        .flatMap((d) => d.activities.map((a) => `${a.name} ${a.description} ${d.theme}`))
        .concat(context.destination)
        .join(" ");

    const corpusTokens = tokenize(corpus);
    const hotelTokens = tokenize(`${hotel.area} ${hotel.tags.join(" ")}`);

    let score = 0;

    // Semantic overlap with destination activities
    for (const tok of hotelTokens) {
        if (corpusTokens.has(tok)) score += 1;
    }

    // Rating bonus (0–5 scale)
    if (hotel.rating !== undefined) score += hotel.rating;

    // Central location bonus — multi-day trips strongly benefit
    if (/central|downtown|centre|center/i.test(hotel.area)) score += 2;

    // Budget fit
    const budget = context.preferences?.budget;
    if (hotel.priceRange === "$$$$" && budget !== undefined && budget < BUDGET_LUXURY_THRESHOLD) {
        score -= 10;
    }
    // Style affinity — supports comma-separated multi-style strings
    const styleTokens = context.preferences?.style
        ? context.preferences.style.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (styleTokens.length > 0 && hotel.tags.some((t) => styleTokens.some((s) => t.toLowerCase().includes(s)))) score += 2;

    return score;
}

function selectHotel(context: EnrichedTripContext): HotelOption {
    if (context.hotels.length === 0) {
        return { ...PLACEHOLDER_HOTEL, area: context.destination };
    }
    return context.hotels.reduce((best, candidate) =>
        scoreHotel(candidate, context) >= scoreHotel(best, context) ? candidate : best,
    );
}

// ─────────────────────────────────────────
//  Deterministic full fallback
// ─────────────────────────────────────────

function deterministicOptimize(context: EnrichedTripContext): OptimizedTripContext {
    const days: OptimizedDay[] = context.days.map((d) => ({
        day: d.day,
        theme: d.theme,
        activities: assignSlots(d.activities),
    }));
    return { ...context, days, selectedHotel: selectHotel(context) };
}

// ─────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────

function validateResult(result: OptimizedTripContext, original: EnrichedTripContext): boolean {
    if (!result.selectedHotel?.name) return false;
    if (result.days.length !== original.days.length) return false;
    for (let i = 0; i < original.days.length; i++) {
        const orig = original.days[i]!;
        const opt = result.days[i]!;
        if (opt.day !== orig.day || opt.theme !== orig.theme) return false;
        if (!opt.activities || opt.activities.length === 0 || opt.activities.length > 5) return false;
        for (const act of opt.activities) {
            if (!VALID_SLOTS.has(act.timeSlot)) return false;
        }
    }
    return true;
}

// ─────────────────────────────────────────
//  LLM response types + merge-back
// ─────────────────────────────────────────

type LLMActivity = { name: string; type: string; timeSlot: string };
type LLMDay = { day: number; theme: string; activities: LLMActivity[] };
type LLMResponse = { days: LLMDay[]; selectedHotel: { name: string; priceRange: string } };

/**
 * Merges LLM scheduling output back onto the original Activity objects so that
 * no field (estimatedCost, description, etc.) is ever lost or hallucinated.
 * Throws if any activity cannot be matched — caller falls back to deterministic.
 */
function mergeLLMResult(
    raw: LLMResponse,
    preprocessed: EnrichedTripContext,
    original: EnrichedTripContext,
): OptimizedTripContext {
    const days: OptimizedDay[] = raw.days.map((llmDay) => {
        const origDay = original.days.find((d) => d.day === llmDay.day);
        const prepDay = preprocessed.days.find((d) => d.day === llmDay.day);
        if (!origDay || !prepDay) throw new Error(`Day ${llmDay.day} not in source context`);

        const activities: ScheduledActivity[] = llmDay.activities.map((llmAct) => {
            const matched = prepDay.activities.find(
                (a) =>
                    a.name.trim().toLowerCase() === llmAct.name.trim().toLowerCase() &&
                    a.type === llmAct.type,
            );
            if (!matched) throw new Error(`Cannot match activity "${llmAct.name}" (${llmAct.type}) in day ${llmDay.day}`);
            if (!VALID_SLOTS.has(llmAct.timeSlot)) throw new Error(`Invalid timeSlot "${llmAct.timeSlot}"`);
            return { ...matched, timeSlot: llmAct.timeSlot as TimeSlot };
        });

        return { day: origDay.day, theme: origDay.theme, activities };
    });

    // Hotel must exist in the original list; fall back to scorer if hallucinated
    const selectedHotel =
        original.hotels.find(
            (h) => h.name === raw.selectedHotel?.name && h.priceRange === raw.selectedHotel?.priceRange,
        ) ?? selectHotel(original);

    return { ...original, days, selectedHotel };
}

// ─────────────────────────────────────────
//  LLM Prompts
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are a travel logistics optimizer.

Your only responsibilities:
1. Reorder activities within each day and assign a timeSlot (morning / afternoon / evening).
2. Select ONE hotel from the hotels array in the input.

Scheduling rules:
- morning  → major attractions
- afternoon → experiences and secondary sights
- evening   → restaurants and relaxed activities
- Never place two attractions consecutively
- Ensure variety: no two consecutive activities of the same type
- Max 3–5 activities per day

Hotel selection rules:
- Pick one hotel from the provided list ONLY — never invent one
- Prefer hotels near the activities (area / tags overlap)
- Avoid $$$$ hotels when budget is low
- Prefer central / downtown areas for multi-day trips

Return ONLY valid JSON — no markdown, no explanation, no extra keys:
{
  "days": [
    {
      "day": <number>,
      "theme": "<exact original theme>",
      "activities": [
        { "name": "<exact original name>", "type": "<exact original type>", "timeSlot": "morning|afternoon|evening" }
      ]
    }
  ],
  "selectedHotel": { "name": "<name from list>", "priceRange": "<priceRange from list>" }
}`;

// ─────────────────────────────────────────
//  LogisticsAgent
// ─────────────────────────────────────────

export class LogisticsAgent {
    async run(context: EnrichedTripContext, requestId?: string): Promise<OptimizedTripContext> {
        logStructured({ layer: "agent", agent: "logistics", step: "start", requestId });
        logStructured({ layer: "agent", agent: "logistics", step: "input", requestId, data: { days: context.days.length, hotels: context.hotels.length, totalActivities: context.days.reduce((s, d) => s + d.activities.length, 0), pace: context.preferences?.pace } });
        const preprocessed = preprocessContext(context);
        const client = LLMClientFactory.create({ agent: "logistics" });

        const messages = [
            { role: "system" as const, content: SYSTEM_PROMPT },
            { role: "user" as const, content: JSON.stringify(preprocessed) },
        ];
        const options = { temperature: 0.4, maxTokens: 4096, timeoutMs: 30_000 };

        let lastError: unknown;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                logStructured({ layer: "agent", agent: "logistics", step: "llm-call", requestId, data: { attempt: attempt + 1, maxTokens: 4096 } });
                const response = await client.execute(messages, options);
                const raw = parseJSONResponse<LLMResponse>(response.content);
                const merged = mergeLLMResult(raw, preprocessed, context);
                if (validateResult(merged, context)) {
                    logInfo("[LogisticsAgent] LLM optimisation succeeded", { attempt: attempt + 1 });
                    logStructured({ layer: "agent", agent: "logistics", step: "llm-response", requestId, data: { attempt: attempt + 1, latencyMs: response.latencyMs, path: "llm" } });
                    logStructured({ layer: "agent", agent: "logistics", step: "output", requestId, data: { selectedHotel: merged.selectedHotel.name, days: merged.days.length } });
                    logStructured({ layer: "agent", agent: "logistics", step: "end", requestId, data: { path: "llm" } });
                    return merged;
                }
                lastError = new Error("LLM result failed post-merge validation");
                logInfo("[LogisticsAgent] LLM result invalid, will retry or fall back", { attempt: attempt + 1 });
            } catch (err) {
                lastError = err;
                logStructured({ layer: "agent", agent: "logistics", step: "error", requestId, data: { attempt: attempt + 1, error: trunc((err as Error).message) } });
                logError(`[LogisticsAgent] LLM attempt ${attempt + 1} error`, err);
            }
        }

        logInfo("[LogisticsAgent] Falling back to deterministic optimizer", {
            reason: lastError instanceof Error ? lastError.message : String(lastError),
        });
        logStructured({ layer: "agent", agent: "logistics", step: "fallback", requestId, data: { reason: trunc(lastError instanceof Error ? lastError.message : String(lastError)) } });
        const fallback = deterministicOptimize(preprocessed);
        logStructured({ layer: "agent", agent: "logistics", step: "output", requestId, data: { selectedHotel: fallback.selectedHotel.name, days: fallback.days.length } });
        logStructured({ layer: "agent", agent: "logistics", step: "end", requestId, data: { path: "deterministic" } });
        return fallback;
    }
}
