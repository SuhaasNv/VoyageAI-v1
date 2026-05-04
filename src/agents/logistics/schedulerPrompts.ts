/**
 * Prompts for the LLM-based activity scheduler inside the Logistics Agent.
 *
 * The LLM receives the day's activities plus real Mapbox travel times and
 * produces an ordered, time-stamped schedule.  The deterministic routing
 * engine (buildScheduledDay) is kept as a fallback.
 */

import type { Activity, HotelOption } from "@/agents/shared/tripPipelineTypes";

// ─── System prompt ────────────────────────────────────────────────────────────

export const LOGISTICS_SCHEDULER_SYSTEM_PROMPT = `You are VoyageAI's Logistics Scheduler — a precise day-planner for travel itineraries.

Your ONLY job: given a list of activities for a single day, assign a realistic order and clock times.

## Time rules
- Day window: 09:00 – 21:00. Every activity MUST start at or after 09:00 and END by 21:00.
- No overlaps: each activity's startTime must be ≥ the previous activity's endTime.
- Leave at least 15 minutes between consecutive activities as a travel/transition buffer.

## Stay durations (default — adjust ±20% only when context strongly warrants it)
- attraction:  90–150 minutes
- experience:  90–180 minutes
- restaurant:  60–90 minutes

## Ordering logic
1. Use the travel times provided to minimise total travel. Cluster nearby activities.
2. Prefer attractions and museums in the morning (09:00–12:00) when energy is highest.
3. Place a restaurant in the lunch window (12:00–14:30) when one is available.
4. Place a restaurant in the dinner window (18:30–20:30) when one is available.
5. Schedule lower-energy experiences (café, park, market, spa) in the afternoon or evening.
6. If a slow/relaxed pace is indicated, reduce activity count mentally but still schedule ALL given activities — just with longer stays and more buffer.

## Coverage rule
Return EVERY activity from the input — do NOT drop, rename, hallucinate, or add any.

## Output format
Return ONLY a valid JSON array — no markdown, no prose, no code fences.

[
  {
    "name": "<exact name from input>",
    "startTime": "HH:MM",
    "endTime":   "HH:MM",
    "timeSlot":  "morning" | "afternoon" | "evening",
    "travelTimeFromPrevMs": <integer milliseconds — 0 for the first activity>
  },
  ...
]

timeSlot derivation (based on startTime):
  "morning"   — startTime before 12:00
  "afternoon" — 12:00 ≤ startTime < 17:00
  "evening"   — startTime ≥ 17:00`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerTravelPair {
    from: string;
    to: string;
    minutes: number;
}

export interface SchedulerActivityInput {
    name: string;
    type: Activity["type"];
    description: string;
    estimatedCost?: number;
}

// ─── User prompt builder ──────────────────────────────────────────────────────

export function buildSchedulerUserPrompt(params: {
    destination: string;
    day: number;
    theme: string;
    hotel: Pick<HotelOption, "name" | "area">;
    activities: SchedulerActivityInput[];
    travelPairs: SchedulerTravelPair[];
    pace?: string;
    style?: string;
}): string {
    const { destination, day, theme, hotel, activities, travelPairs, pace, style } = params;

    const actLines = activities
        .map(
            (a, i) =>
                `  ${i + 1}. [${a.type}] ${a.name}${a.estimatedCost != null ? ` (~$${a.estimatedCost})` : ""}\n     ${a.description}`,
        )
        .join("\n");

    const travelBlock =
        travelPairs.length > 0
            ? travelPairs.map((t) => `  ${t.from} → ${t.to}: ${t.minutes} min`).join("\n")
            : "  (no travel data available — use typical urban distances)";

    const prefParts: string[] = [];
    if (pace) prefParts.push(`pace: ${pace}`);
    if (style) prefParts.push(`style: ${style}`);

    return `Destination : ${destination}
Day ${day}     Theme : ${theme}
Hotel       : ${hotel.name} (${hotel.area})${prefParts.length > 0 ? `\nPreferences : ${prefParts.join(", ")}` : ""}

Activities (${activities.length}) — schedule ALL of them:
${actLines}

Travel times (real-world driving, minutes):
${travelBlock}

Return ONLY the JSON array for these ${activities.length} activities.`;
}
