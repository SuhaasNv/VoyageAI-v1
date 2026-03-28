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

export function normalizeDestination(raw: string): string {
    return raw
        .trim()
        .replace(/\s+/g, " ")
        .split(/[\s,]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ")
        .replace(/,\s*/g, ", ");
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
    }

    // dates
    const today = new Date();
    const defaultStart = addDays(today, 7);

    let startDate = safeDateParsing(obj.startDate as string | undefined);
    let endDate = safeDateParsing(obj.endDate as string | undefined);

    if (!startDate) {
        startDate = isoDate(defaultStart);
    }
    // Always derive endDate from startDate + duration to keep consistency
    const startMs = new Date(startDate).getTime();
    endDate = isoDate(new Date(startMs + (durationDays - 1) * 86_400_000));

    // preferences
    const rawPrefs = (obj.preferences && typeof obj.preferences === "object")
        ? obj.preferences as Record<string, unknown>
        : {};

    const preferences: PlannerPreferences = {};

    if (typeof rawPrefs.budget === "number" && rawPrefs.budget > 0) {
        preferences.budget = rawPrefs.budget;
    }
    if (typeof rawPrefs.style === "string" && VALID_STYLES.has(rawPrefs.style)) {
        preferences.style = rawPrefs.style as PlannerPreferences["style"];
    }
    if (typeof rawPrefs.pace === "string" && VALID_PACES.has(rawPrefs.pace)) {
        preferences.pace = rawPrefs.pace as PlannerPreferences["pace"];
    }

    // days
    const rawDays = Array.isArray(obj.days) ? obj.days : [];
    const normalizedDays: TripContext["days"] = [];

    for (let i = 1; i <= durationDays; i++) {
        const found = rawDays.find(
            (d) => d && typeof d === "object" && (d as Record<string, unknown>).day === i
        ) as Record<string, unknown> | undefined;

        const theme =
            found && typeof found.theme === "string" && found.theme.trim()
                ? found.theme.trim()
                : genericTheme(i);

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
