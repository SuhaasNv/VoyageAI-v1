/**
 * LLM-based activity scheduler for the Logistics Agent.
 *
 * Calls the configured LLM (via the shared LLMClientFactory) to produce an
 * ordered, time-stamped ScheduledActivity list for a single day.
 *
 * Contract:
 *  - Throws on any LLM failure or schema/validation violation.
 *  - The caller (logisticsAgent.ts) catches and falls back to buildScheduledDay.
 *  - No mutation of input — always returns a new array.
 *  - Every input activity MUST appear exactly once in the output.
 */

import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { logError, logStructured } from "@/infrastructure/logger";
import type { Activity, HotelOption, ScheduledActivity } from "@/agents/shared/tripPipelineTypes";
import {
    LOGISTICS_SCHEDULER_SYSTEM_PROMPT,
    buildSchedulerUserPrompt,
    type SchedulerTravelPair,
} from "./schedulerPrompts";

// ─── Validation helpers ───────────────────────────────────────────────────────

const HHMM_RE = /^\d{2}:\d{2}$/;
const VALID_TIME_SLOTS = new Set(["morning", "afternoon", "evening"]);

function hhmmToMins(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

function normName(n: string): string {
    return n.toLowerCase().trim();
}

// ─── Response validation + merge ──────────────────────────────────────────────

/**
 * Validates the raw LLM JSON array and merges it back onto the original
 * Activity objects (preserving lat/lng, estimatedCost, etc.).
 *
 * Throws a descriptive Error on any schema or ordering violation so the
 * caller can fall back cleanly.
 */
function validateAndMerge(
    raw: unknown,
    sourceActivities: Array<Activity & { id: string; lat: number; lng: number }>,
): ScheduledActivity[] {
    if (!Array.isArray(raw)) {
        throw new Error("LLM response is not a JSON array");
    }
    if (raw.length !== sourceActivities.length) {
        throw new Error(
            `expected ${sourceActivities.length} activities, got ${raw.length}`,
        );
    }

    const nameMap = new Map(sourceActivities.map((a) => [normName(a.name), a]));
    const seen = new Set<string>();
    const result: ScheduledActivity[] = [];
    let prevEndMins = 0;

    for (const item of raw as Record<string, unknown>[]) {
        const name      = item["name"];
        const startTime = item["startTime"];
        const endTime   = item["endTime"];
        const timeSlot  = item["timeSlot"];
        const travelMs  = item["travelTimeFromPrevMs"];

        if (typeof name !== "string" || name.trim() === "") {
            throw new Error("item is missing a name");
        }
        if (typeof startTime !== "string" || !HHMM_RE.test(startTime)) {
            throw new Error(`invalid startTime "${startTime}" for "${name}"`);
        }
        if (typeof endTime !== "string" || !HHMM_RE.test(endTime)) {
            throw new Error(`invalid endTime "${endTime}" for "${name}"`);
        }
        if (!VALID_TIME_SLOTS.has(timeSlot as string)) {
            throw new Error(`invalid timeSlot "${timeSlot}" for "${name}"`);
        }

        const startMins = hhmmToMins(startTime);
        const endMins   = hhmmToMins(endTime);

        if (startMins < 9 * 60) {
            throw new Error(`"${name}" starts before 09:00 (got ${startTime})`);
        }
        if (endMins > 21 * 60) {
            throw new Error(`"${name}" ends after 21:00 (got ${endTime})`);
        }
        if (startMins >= endMins) {
            throw new Error(`"${name}" startTime (${startTime}) >= endTime (${endTime})`);
        }
        if (startMins < prevEndMins) {
            throw new Error(`"${name}" overlaps previous activity (starts ${startTime}, prev ended at ${hhmmToMins.toString()})`);
        }

        const source = nameMap.get(normName(name));
        if (!source) {
            throw new Error(`LLM returned unknown activity "${name}"`);
        }
        if (seen.has(normName(name))) {
            throw new Error(`LLM returned duplicate activity "${name}"`);
        }
        seen.add(normName(name));

        result.push({
            ...source,
            timeSlot: timeSlot as ScheduledActivity["timeSlot"],
            startTime,
            endTime,
            travelTimeFromPrevMs:
                typeof travelMs === "number" && travelMs >= 0 ? travelMs : 0,
        });

        prevEndMins = endMins;
    }

    // Every source activity must be present in the output
    for (const src of sourceActivities) {
        if (!seen.has(normName(src.name))) {
            throw new Error(`LLM dropped activity "${src.name}"`);
        }
    }

    return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Asks the LLM to schedule a single day's activities with clock times.
 *
 * @throws  Any error from the LLM call or from validateAndMerge — the caller
 *          is expected to catch and fall back to the deterministic router.
 */
export async function llmScheduleDay(params: {
    destination: string;
    day: number;
    theme: string;
    hotel: Pick<HotelOption, "name" | "area">;
    activities: Array<Activity & { id: string; lat: number; lng: number }>;
    travelPairs: SchedulerTravelPair[];
    pace?: string;
    style?: string;
    requestId?: string;
}): Promise<ScheduledActivity[]> {
    const {
        destination, day, theme, hotel,
        activities, travelPairs, pace, style, requestId,
    } = params;

    const userPrompt = buildSchedulerUserPrompt({
        destination, day, theme, hotel, activities, travelPairs, pace, style,
    });

    const modelConfig = selectModelConfig({ endpoint: "logistics-schedule" });
    const client = LLMClientFactory.create({ agent: "logistics" });

    logStructured({
        layer: "agent",
        agent: "logistics",
        step: "llm_schedule_attempt",
        requestId,
        data: { day, activities: activities.length, model: modelConfig.model },
    });

    let response;
    try {
        response = await executeWithRetry(
            client,
            [
                { role: "system", content: LOGISTICS_SCHEDULER_SYSTEM_PROMPT },
                { role: "user",   content: userPrompt },
            ],
            {
                ...modelConfig,
                responseFormat: "json",
                retries: 1,
            },
            "logistics",
        );
    } catch (err) {
        logError(`[Logistics] LLM call failed for day ${day}`, err);
        throw err;
    }

    let parsed: unknown;
    try {
        parsed = parseJSONResponse<unknown>(response.content);
    } catch (err) {
        logError(`[Logistics] LLM response was not valid JSON for day ${day}`, err);
        throw err;
    }

    const scheduled = validateAndMerge(parsed, activities);

    logStructured({
        layer: "agent",
        agent: "logistics",
        step: "llm_schedule_success",
        requestId,
        data: { day, scheduled: scheduled.length, latencyMs: response.latencyMs },
    });

    return scheduled;
}
