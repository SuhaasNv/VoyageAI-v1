import { logInfo, logError, logStructured, trunc } from "@/infrastructure/logger";
import { getTravelTimeMatrix, isInvalidCoord } from "@/services/mapbox";
import { buildScheduledDay } from "./routingUtils";
import type { GeoCoordinate } from "@/services/mapbox";
import type {
    Activity,
    EnrichedDay,
    EnrichedTripContext,
    HotelOption,
    OptimizedDay,
    OptimizedTripContext,
    ScheduledActivity,
} from "@/agents/shared/tripPipelineTypes";

export type {
    Activity,
    EnrichedDay,
    EnrichedTripContext,
    HotelOption,
    OptimizedDay,
    OptimizedTripContext,
    ScheduledActivity,
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
        
        // 1. Hotel Selection (Fallback to scoreHotel deterministic heuristic)
        const baseHotel = context.hotels.find(h => h.name) ?? selectHotel(context);
        const safeHotelLat = isInvalidCoord(baseHotel.lat, baseHotel.lng) ? 40.7128 : (baseHotel.lat as number);
        const safeHotelLng = isInvalidCoord(baseHotel.lat, baseHotel.lng) ? -74.0060 : (baseHotel.lng as number);

        let globalIdCounter = 0;
        const allGeoPoints: Array<GeoCoordinate & { id: string }> = [
            { lat: safeHotelLat, lng: safeHotelLng, id: `hotel_${globalIdCounter++}` }
        ];

        // 2. Flatten activities & inject fallback coords
        const preprocessed = preprocessContext(context);
        const flatActivities = preprocessed.days.flatMap(d => d.activities).map(act => {
            const id = `act_${globalIdCounter++}`;
            const lat = isInvalidCoord(act.lat, act.lng) ? safeHotelLat : (act.lat as number);
            const lng = isInvalidCoord(act.lat, act.lng) ? safeHotelLng : (act.lng as number);
            
            allGeoPoints.push({ lat, lng, id });
            return { ...act, lat, lng, id };
        });

        // 3. Matrix fetch (MAX 25 points to avoid Mapbox payload errors)
        const routingPoints = allGeoPoints.slice(0, 25);
        const matrix = await getTravelTimeMatrix(routingPoints);

        const indexMap = new Map<string, number>();
        routingPoints.forEach((pt, i) => indexMap.set(pt.id, i));
        const matrixData = { matrix, indexMap };
        
        // 4. Cluster / Allocate Days
        let actOffset = 0;
        const optimizedDays: OptimizedDay[] = context.days.map((enrichedDay) => {
            // Because we used `preprocessContext`, the arrays might have shrunken/capped
            // Get the matching preprocessed day for length scaling
            const prepDay = preprocessed.days.find(d => d.day === enrichedDay.day) || enrichedDay;
            const numActs = prepDay.activities.length;
            
            const chunk = flatActivities.slice(actOffset, actOffset + numActs);
            actOffset += numActs;
             
            return {
                day: enrichedDay.day,
                theme: enrichedDay.theme,
                activities: buildScheduledDay({ lat: safeHotelLat, lng: safeHotelLng, id: allGeoPoints[0].id }, chunk, matrixData)
            };
        });

        const optimized: OptimizedTripContext = {
            ...context,
            selectedHotel: { ...baseHotel, lat: safeHotelLat, lng: safeHotelLng },
            days: optimizedDays
        };

        logStructured({ layer: "agent", agent: "logistics", step: "output", requestId, data: { selectedHotel: optimized.selectedHotel.name, days: optimized.days.length } });
        logStructured({ layer: "agent", agent: "logistics", step: "end", requestId, data: { path: "mapbox_deterministic" } });

        return optimized;
    }
}
