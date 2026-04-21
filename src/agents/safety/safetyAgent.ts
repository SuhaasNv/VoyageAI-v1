import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { logError, logStructured, trunc } from "@/infrastructure/logger";
import type { BudgetedTripContext } from "@/agents/budget/budgetAgent";

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface SafetyWarning {
    type: "fatigue" | "travel" | "schedule" | "meal";
    day: number;
    severity: "medium" | "high";
    message: string;
}

export type SafetyResult = {
    riskLevel: "low" | "medium" | "high";
    warnings: SafetyWarning[];
    tips: string[];
};

export type SafeTripContext = BudgetedTripContext & {
    safety: SafetyResult;
};

// ─── Rule Constants ───────────────────────────────────────────────────────────

/** Non-meal activities per day that triggers high/medium fatigue warnings. */
const FATIGUE_HIGH_THRESHOLD   = 5;
const FATIGUE_MEDIUM_THRESHOLD = 4;

/** Travel time thresholds in milliseconds. */
const TRAVEL_HIGH_MS   = 2 * 60 * 60 * 1000; // 2 hours
const TRAVEL_MEDIUM_MS = 90 * 60 * 1000;      // 90 minutes

/** Hour (24h) after which an activity ending is flagged as late-night. */
const LATE_NIGHT_HOUR = 22;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEndHour(time: string): number | null {
    const [h] = time.split(":");
    const hour = parseInt(h, 10);
    return isNaN(hour) ? null : hour;
}

function formatMs(ms: number): string {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

// ─── Deterministic Rule Engine ────────────────────────────────────────────────

/**
 * Runs all safety rules against the finalized itinerary.
 * No LLM. No heuristics. Only real signals from the Logistics output.
 */
function runDeterministicRules(context: BudgetedTripContext): SafetyWarning[] {
    const warnings: SafetyWarning[] = [];

    for (const day of context.days) {
        const dayNum = day.day;
        const nonMeal = day.activities.filter((a) => !a.isMeal);

        // ── Rule 1: Activity fatigue ──────────────────────────────────────────
        if (nonMeal.length > FATIGUE_HIGH_THRESHOLD) {
            warnings.push({
                type: "fatigue",
                day: dayNum,
                severity: "high",
                message: `Day ${dayNum} has ${nonMeal.length} activities — this is a very heavy day and may cause exhaustion.`,
            });
        } else if (nonMeal.length > FATIGUE_MEDIUM_THRESHOLD) {
            warnings.push({
                type: "fatigue",
                day: dayNum,
                severity: "medium",
                message: `Day ${dayNum} has ${nonMeal.length} activities — consider removing one for a more comfortable pace.`,
            });
        }

        // ── Rule 2: Long travel gaps ──────────────────────────────────────────
        for (const act of day.activities) {
            const travel = act.travelTimeFromPrevMs;
            if (travel == null) continue;

            if (travel >= TRAVEL_HIGH_MS) {
                warnings.push({
                    type: "travel",
                    day: dayNum,
                    severity: "high",
                    message: `Getting to ${act.name} on Day ${dayNum} takes ~${formatMs(travel)} — a significant transit leg that will consume most of a time slot.`,
                });
            } else if (travel >= TRAVEL_MEDIUM_MS) {
                warnings.push({
                    type: "travel",
                    day: dayNum,
                    severity: "medium",
                    message: `Travel to ${act.name} on Day ${dayNum} is ~${formatMs(travel)} — factor this into your schedule.`,
                });
            }
        }

        // ── Rule 3: Late-night overflow ───────────────────────────────────────
        // Flag only the latest-ending activity per day to avoid duplicate warnings.
        let latestHour = -1;
        let latestName = "";
        let latestTime = "";
        for (const act of day.activities) {
            if (!act.endTime) continue;
            const hour = parseEndHour(act.endTime);
            if (hour !== null && hour >= LATE_NIGHT_HOUR && hour > latestHour) {
                latestHour = hour;
                latestName = act.name;
                latestTime = act.endTime;
            }
        }
        if (latestHour >= LATE_NIGHT_HOUR) {
            warnings.push({
                type: "schedule",
                day: dayNum,
                severity: "medium",
                message: `${latestName} on Day ${dayNum} ends at ${latestTime} — an early start the next day will feel rushed.`,
            });
        }

        // ── Rule 4: No meals ──────────────────────────────────────────────────
        const hasMeal = day.activities.some((a) => a.isMeal === true);
        if (!hasMeal) {
            warnings.push({
                type: "meal",
                day: dayNum,
                severity: "medium",
                message: `No meal stop is scheduled on Day ${dayNum}.`,
            });
        }
    }

    return warnings;
}

function deriveRiskLevel(warnings: SafetyWarning[]): SafetyResult["riskLevel"] {
    if (warnings.some((w) => w.severity === "high")) return "high";
    if (warnings.length > 0) return "medium";
    return "low";
}

// ─── LLM Tips (optional, gracefully degraded) ────────────────────────────────

const TIPS_SYSTEM_PROMPT = `You are a travel advisor.
Given a trip's destination, duration, and a list of specific safety warnings, return 2–4 short actionable tips that directly address those warnings.

Rules:
- Each tip must address at least one specific warning from the list
- Be practical and specific to the destination
- One sentence each, no markdown, no numbering, no bullet points
- Return ONLY valid JSON in this exact shape: {"tips":["...","..."]}`;

async function fetchLLMTips(
    context: BudgetedTripContext,
    warnings: SafetyWarning[],
    requestId?: string,
): Promise<string[]> {
    const warningText = warnings
        .map((w) => `Day ${w.day} (${w.type}): ${w.message}`)
        .join("\n");

    const userMsg = `Trip: ${context.destination} | ${context.durationDays} days | Pace: ${context.preferences?.pace ?? "moderate"}

Warnings to address:
${warningText}

Return tips JSON.`;

    const llmClient = LLMClientFactory.create({ agent: "safety" });
    logStructured({
        layer: "agent", agent: "safety", step: "llm-call", requestId,
        data: { temperature: 0.2, purpose: "tips-only" },
    });

    const response = await executeWithRetry(
        llmClient,
        [
            { role: "system", content: TIPS_SYSTEM_PROMPT },
            { role: "user", content: userMsg },
        ],
        { temperature: 0.2, responseFormat: "json", timeoutMs: 20_000 },
    );

    logStructured({
        layer: "agent", agent: "safety", step: "llm-response", requestId,
        data: { contentLength: response.content.length, latencyMs: response.latencyMs },
    });

    const parsed = parseJSONResponse<{ tips?: unknown }>(response.content);
    if (!parsed || !Array.isArray(parsed.tips)) return [];

    return (parsed.tips as unknown[])
        .filter((t): t is string => typeof t === "string")
        .slice(0, 4);
}

// ─── SafetyAgent ──────────────────────────────────────────────────────────────

export class SafetyAgent {
    async run(context: BudgetedTripContext, requestId?: string): Promise<SafeTripContext> {
        logStructured({ layer: "agent", agent: "safety", step: "start", requestId });
        logStructured({
            layer: "agent", agent: "safety", step: "input", requestId,
            data: { destination: context.destination, days: context.days.length },
        });

        // Deterministic rules always run — no short-circuit bypass.
        const warnings = runDeterministicRules(context);
        const riskLevel = deriveRiskLevel(warnings);

        logStructured({
            layer: "agent", agent: "safety", step: "rules_applied", requestId,
            data: { warnings: warnings.length, riskLevel },
        });

        // LLM for tips only — skipped when no warnings, degraded gracefully on failure.
        let tips: string[] = [];
        if (warnings.length > 0) {
            try {
                tips = await fetchLLMTips(context, warnings, requestId);
            } catch (err) {
                // Non-fatal: warnings are deterministic and correct regardless.
                logError("[SafetyAgent] LLM tips call failed — proceeding without tips", err);
                logStructured({
                    layer: "agent", agent: "safety", step: "error", requestId,
                    data: { error: trunc((err as Error).message), phase: "tips" },
                });
            }
        }

        const safety: SafetyResult = { riskLevel, warnings, tips };
        const result: SafeTripContext = { ...context, safety };

        logStructured({
            layer: "agent", agent: "safety", step: "output", requestId,
            data: { riskLevel, warnings: warnings.length, tips: tips.length },
        });
        logStructured({ layer: "agent", agent: "safety", step: "end", requestId });

        return result;
    }
}
