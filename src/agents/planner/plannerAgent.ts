import {
    LLMClientFactory,
    AIServiceError,
    parseJSONResponse,
} from "@/lib/ai/llm";
import type { LLMClient, LLMMessage } from "@/lib/ai/types";
import { logStructured, trunc } from "@/infrastructure/logger";
import {
    PLANNER_SYSTEM_PROMPT,
    buildPlannerUserPrompt,
    PLANNER_REPAIR_USER_PROMPT,
} from "./plannerPrompts";
import type { TripContext, PlannerPreferences } from "./types";

export type { TripContext } from "./types";

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────

const VAGUE_DESTINATIONS = new Set([
    "somewhere", "anywhere", "nearby", "near airport", "unknown",
    "here", "there", "location", "place", "destination",
]);

export function normalizeDestination(raw: string): string {
    const trimmed = raw.trim().replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ");

    // Reject vague inputs before any further processing.
    if (VAGUE_DESTINATIONS.has(trimmed.toLowerCase())) {
        return "Top Travel Destination";
    }

    return trimmed
        .split(" ")
        .map((token) => {
            const trailingComma = token.endsWith(",");
            const word = trailingComma ? token.slice(0, -1) : token;
            // Preserve acronyms: all-caps words up to 4 letters (NYC, UAE, UK, USA).
            const cap = /^[A-Z]{2,4}$/.test(word)
                ? word
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            return trailingComma ? cap + "," : cap;
        })
        .join(" ");
}

export function safeDateParsing(raw: string | undefined): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
}

function isoDate(d: Date): string {
    return d.toISOString().split("T")[0];
}

function addDays(base: Date, n: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
}

const VALID_STYLES = new Set(["luxury", "budget", "balanced", "adventure", "relaxed"]);
const VALID_PACES = new Set(["slow", "moderate", "fast"]);

const STYLE_SYNONYMS: Record<string, string> = {
    luxurious: "luxury",
    cheap: "budget",
    backpacking: "budget",
    adventurous: "adventure",
    chill: "relaxed",
};

const PACE_SYNONYMS: Record<string, string> = {
    "slow-paced": "slow",
    easy: "slow",
    normal: "moderate",
    standard: "moderate",
    "fast-paced": "fast",
    packed: "fast",
};

const GENERIC_THEMES = [
    "Arrival & Orientation",
    "Culture & Landmarks",
    "Nature & Relaxation",
    "Local Life & Markets",
    "Hidden Gems",
    "Food & Culinary",
    "City Sightseeing",
    "Art & Culture",
    "Adventure & Thrills",
    "Leisure & Free Time",
];

function genericTheme(day: number): string {
    return GENERIC_THEMES[(day - 1) % GENERIC_THEMES.length];
}

// ─────────────────────────────────────────
//  Validation & Normalization
// ─────────────────────────────────────────

function validateAndNormalize(raw: unknown): TripContext {
    if (!raw || typeof raw !== "object") {
        throw new AIServiceError("SCHEMA_VALIDATION_FAILED", "Planner output is not an object");
    }

    const obj = raw as Record<string, unknown>;

    // destination
    const rawDest = typeof obj.destination === "string" ? obj.destination : "";
    const destination = normalizeDestination(rawDest);
    if (!destination) {
        throw new AIServiceError(
            "SCHEMA_VALIDATION_FAILED",
            "Planner output missing required field: destination"
        );
    }

    // durationDays
    let durationDays = typeof obj.durationDays === "number" ? Math.round(obj.durationDays) : 0;
    if (durationDays <= 0) {
        durationDays = 4; // spec default: 3–5 days; pick 4 as midpoint
    } else if (durationDays > 14) {
        durationDays = 14;
    }

    // dates
    const today = new Date();
    const defaultStart = addDays(today, 7);

    let startDate = safeDateParsing(obj.startDate as string | undefined);
    let endDate = safeDateParsing(obj.endDate as string | undefined);

    if (!startDate) {
        startDate = isoDate(defaultStart);
    }
    const startMs = new Date(startDate).getTime();

    // Preserve provided endDate when it is consistent with a reasonable trip length.
    if (endDate) {
        const expectedDuration = Math.round((new Date(endDate).getTime() - startMs) / 86_400_000) + 1;
        if (expectedDuration >= 1 && expectedDuration <= 14) {
            durationDays = expectedDuration; // trust the provided range
        } else {
            // Provided endDate implies an out-of-range duration (expectedDuration=${expectedDuration}).
            // Recomputing endDate from startDate + durationDays to restore consistency.
            logStructured({
                layer: "agent", agent: "planner", step: "fallback",
                data: { reason: "endDate_out_of_range", expectedDuration, durationDays, startDate, originalEndDate: endDate },
            });
            endDate = isoDate(new Date(startMs + (durationDays - 1) * 86_400_000));
        }
    } else {
        endDate = isoDate(new Date(startMs + (durationDays - 1) * 86_400_000));
    }

    // preferences
    const rawPrefs = (obj.preferences && typeof obj.preferences === "object")
        ? obj.preferences as Record<string, unknown>
        : {};

    const preferences: PlannerPreferences = {};

    if (typeof rawPrefs.budget === "number" && rawPrefs.budget > 0) {
        preferences.budget = rawPrefs.budget;
    }
    if (typeof rawPrefs.style === "string") {
        const tokens = rawPrefs.style
            .toLowerCase()
            .split(/[\s,]+|(?:\s+(?:and|&)\s+)/)
            .map((t) => t.trim())
            .map((t) => STYLE_SYNONYMS[t] ?? t)
            .filter((t) => VALID_STYLES.has(t));
        if (tokens.length > 0) {
            preferences.style = tokens.join(",") as PlannerPreferences["style"];
        }
        // No valid tokens → leave style undefined (don't silently force "balanced")
    }
    if (typeof rawPrefs.pace === "string") {
        const mapped = PACE_SYNONYMS[rawPrefs.pace.toLowerCase().trim()] ?? rawPrefs.pace.toLowerCase().trim();
        if (VALID_PACES.has(mapped)) {
            preferences.pace = mapped as PlannerPreferences["pace"];
        }
    }

    // days
    const rawDays = Array.isArray(obj.days) ? obj.days : [];
    const normalizedDays: TripContext["days"] = [];
    const seenThemes = new Set<string>();

    for (let i = 1; i <= durationDays; i++) {
        const found = rawDays.find(
            (d) => d && typeof d === "object" && (d as Record<string, unknown>).day === i
        ) as Record<string, unknown> | undefined;

        let theme =
            found && typeof found.theme === "string" && found.theme.trim()
                ? found.theme.trim()
                : genericTheme(i);

        if (seenThemes.has(theme.toLowerCase())) {
            // Theme already used — pick the first unused generic fallback.
            const unused = GENERIC_THEMES.find((t) => !seenThemes.has(t.toLowerCase()));
            theme = unused ?? `Day ${i} Exploration`;
        }
        seenThemes.add(theme.toLowerCase());

        normalizedDays.push({ day: i, theme });
    }

    return {
        destination,
        startDate,
        endDate,
        durationDays,
        preferences,
        days: normalizedDays,
    };
}

// ─────────────────────────────────────────
//  PlannerAgent
// ─────────────────────────────────────────

export class PlannerAgent {
    private readonly client: LLMClient;

    constructor(client?: LLMClient) {
        this.client = client ?? LLMClientFactory.create({ agent: "planner" });
    }

    async run(input: string, requestId?: string): Promise<TripContext> {
        logStructured({ layer: "agent", agent: "planner", step: "start", requestId });
        logStructured({ layer: "agent", agent: "planner", step: "input", requestId, data: { inputPreview: trunc(input) } });

        const messages: LLMMessage[] = [
            { role: "system", content: PLANNER_SYSTEM_PROMPT },
            { role: "user", content: buildPlannerUserPrompt(input) },
        ];

        const options = {
            temperature: 0.3,
            responseFormat: "json" as const,
            maxTokens: 1024,
        };

        let rawText: string;

        try {
            logStructured({ layer: "agent", agent: "planner", step: "llm-call", requestId, data: { maxTokens: 1024, temperature: 0.3 } });
            const response = await this.client.execute(messages, options);
            rawText = response.content;
            logStructured({ layer: "agent", agent: "planner", step: "llm-response", requestId, data: { contentLength: rawText.length } });
        } catch (err) {
            logStructured({ layer: "agent", agent: "planner", step: "error", requestId, data: { error: trunc((err as Error).message) } });
            if (err instanceof AIServiceError) throw err;
            throw new AIServiceError("LLM_ERROR", `Planner LLM call failed: ${(err as Error).message}`, err);
        }

        let parsed: unknown;

        try {
            parsed = parseJSONResponse(rawText);
        } catch {
            // One retry with a repair prompt
            logStructured({ layer: "agent", agent: "planner", step: "llm-call", requestId, data: { attempt: "repair", reason: "invalid-json" } });
            const repairMessages: LLMMessage[] = [
                ...messages,
                { role: "assistant", content: rawText },
                { role: "user", content: PLANNER_REPAIR_USER_PROMPT },
            ];

            let repairText: string;
            try {
                const repairResponse = await this.client.execute(repairMessages, options);
                repairText = repairResponse.content;
                logStructured({ layer: "agent", agent: "planner", step: "llm-response", requestId, data: { attempt: "repair", contentLength: repairText.length } });
            } catch (err) {
                logStructured({ layer: "agent", agent: "planner", step: "error", requestId, data: { attempt: "repair", error: trunc((err as Error).message) } });
                if (err instanceof AIServiceError) throw err;
                throw new AIServiceError("LLM_ERROR", `Planner repair LLM call failed: ${(err as Error).message}`, err);
            }

            try {
                parsed = parseJSONResponse(repairText);
            } catch {
                logStructured({ layer: "agent", agent: "planner", step: "error", requestId, data: { error: "invalid-json-after-repair" } });
                throw new AIServiceError(
                    "SCHEMA_VALIDATION_FAILED",
                    "Planner Agent returned invalid JSON after retry",
                    { initial: rawText.substring(0, 300), repair: repairText.substring(0, 300) }
                );
            }
        }

        const result = validateAndNormalize(parsed);
        logStructured({ layer: "agent", agent: "planner", step: "output", requestId, data: { destination: result.destination, durationDays: result.durationDays, days: result.days.length } });
        logStructured({ layer: "agent", agent: "planner", step: "end", requestId });
        return result;
    }
}
