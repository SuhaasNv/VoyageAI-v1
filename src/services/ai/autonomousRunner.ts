/**
 * src/services/ai/autonomousRunner.ts
 *
 * Safe Autonomous Mode for VoyageAI Admin System.
 *
 * Pipeline per run:
 *  1. MODE CHECK   — abort immediately if AUTONOMY_MODE=OFF
 *  2. LOCK CHECK   — abort if another cycle is already running (no concurrent runs)
 *  3. DETECT       — analyzeSystem() → anomalies + live metrics
 *  4. DECIDE       — LLM proposes actions with confidence scores (rule-based fallback)
 *  5. GUARD        — validateAction() filters each proposal through allow-list + cooldown
 *  6. EXECUTE      — run ≤ MAX_ACTIONS_PER_RUN allowed actions via existing executors
 *  7. VERIFY       — snapshot post-action metrics; compare to pre-action state
 *  8. LOG          — write one AdminActionLog row summarizing the cycle
 *
 * Failsafes:
 *  - RUN_TIMEOUT_MS (60 s): entire cycle wrapped in Promise.race
 *  - MAX_ACTIONS_PER_RUN (3): hard cap on actions dispatched per cycle
 *  - Per-anomaly × per-action cooldown (30 min) managed by guard.ts
 *  - AUTONOMY_MODE defaults to "OFF" — must be explicitly enabled
 *
 * Integration:
 *  - executeAdminAction   from actionExecutor.ts (CLEAR_CACHE, CHECK_*)
 *  - setHealingOverrides  from healingStore.ts   (REDUCE_TOKENS, PREFER_GEMINI, …)
 *  - validateAction       from guard.ts
 *  - analyzeSystem        from anomalyDetector.ts
 */

import { logInfo, logError, logStructured } from "@/infrastructure/logger";
import { OpenAIClient }  from "@/infrastructure/llm/openaiClient";
import { z }             from "zod";
import { analyzeSystem } from "./anomalyDetector";
import type { Anomaly, SystemMetrics } from "./anomalyDetector";
import {
    getAutonomyMode,
    validateAction,
    markActed,
    activeCooldowns,
    type AutonomyMode,
    type AutonomousActionType,
    type ProposedAction,
    type GuardDecision,
} from "./guard";
import {
    setHealingOverrides,
    type HealingAction,
} from "./healingStore";
import { executeAdminAction } from "@/services/admin/actionExecutor";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";
import { logDecision, ASSESSMENT_CONFIDENCE } from "./explanation.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ACTIONS_PER_RUN = 3;
const RUN_TIMEOUT_MS      = 60_000;

// ─── LLM decision schema ──────────────────────────────────────────────────────

const ActionProposalSchema = z.object({
    type:       z.enum([
        "CLEAR_CACHE",
        "CHECK_SYSTEM",
        "CHECK_AI_PROVIDER",
        "REDUCE_TOKENS_25PCT",
        "REDUCE_TOKENS_50PCT",
        "PREFER_GEMINI",
        "ENABLE_TIMEOUT_REDUCTION",
    ] as const satisfies [string, ...string[]]),
    reason:     z.string().min(5).max(200),
    confidence: z.number().min(0).max(1),
});

const LLMDecisionSchema = z.object({
    assessment:       z.enum(["OK", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies [string, ...string[]]),
    reasoning:        z.string().min(10).max(400),
    actions:          z.array(ActionProposalSchema).max(5),
    duration_minutes: z.number().int().min(5).max(120),
});

type LLMDecision = z.infer<typeof LLMDecisionSchema>;

// ─── Public result types ──────────────────────────────────────────────────────

export interface ExecutedAction {
    type:     AutonomousActionType;
    reason:   string;
    success:  boolean;
    message:  string;
    anomalyId: string;
}

export interface VerificationResult {
    anomalyId: string;
    label:     string;
    resolvedImmediately: boolean;
    note:      string;
}

export interface AutonomousRunResult {
    ranAt:              string;
    mode:               AutonomyMode;
    durationMs:         number;
    skippedReason?:     string;
    anomaliesDetected:  Anomaly[];
    actionsProposed:    ProposedAction[];
    guardsApplied:      GuardDecision[];
    actionsExecuted:    ExecutedAction[];
    verification:       VerificationResult[];
    activeCooldowns:    number;
}

// ─── In-process state ─────────────────────────────────────────────────────────

let _isRunning = false;
let _lastRunAt: string | null = null;
let _lastResult: AutonomousRunResult | null = null;

export function getRunnerStatus() {
    return {
        isRunning:  _isRunning,
        lastRunAt:  _lastRunAt,
        lastResult: _lastResult,
        mode:       getAutonomyMode(),
        activeCooldowns: activeCooldowns(),
    };
}

// ─── LLM decision ─────────────────────────────────────────────────────────────

const DECISION_PROMPT = `You are an AI operations engineer responsible for a travel SaaS platform's reliability.
You will receive detected system anomalies and current metrics.
Your job is to suggest the minimum necessary SAFE actions to remediate the issues.

STRICT SAFETY RULES — you MUST follow these:
- NEVER suggest deleting user data, disabling accounts, or stopping services
- NEVER suggest actions that could cause data loss
- Only suggest config changes, optimizations, and health checks
- Be conservative — suggest the gentlest effective action
- Only include actions you are genuinely confident about (confidence ≥ 0.7)

Available actions (use ONLY these exact type strings):
  CLEAR_CACHE               → clears Redis image cache; safe at any time
  CHECK_SYSTEM              → read-only health snapshot; always safe
  CHECK_AI_PROVIDER         → ping AI providers; use when provider errors detected
  REDUCE_TOKENS_25PCT       → reduce LLM token budget 25%; use for mild cost/latency issues
  REDUCE_TOKENS_50PCT       → reduce LLM token budget 50%; use ONLY for severe cost issues
  PREFER_GEMINI             → route to Gemini instead of OpenAI; use when OpenAI errors detected
  ENABLE_TIMEOUT_REDUCTION  → reduce request timeouts 30%; use to fail fast under degraded conditions

Respond with valid JSON only — no markdown, no explanation outside JSON:
{
  "assessment": "OK|LOW|MEDIUM|HIGH|CRITICAL",
  "reasoning": "<1-3 sentences with actual metric values>",
  "actions": [
    { "type": "<exact type>", "reason": "<why this specific action>", "confidence": <0.0-1.0> }
  ],
  "duration_minutes": <5-120>
}

If no action is needed, return assessment "OK" with an empty actions array.`;

async function getLLMDecision(
    anomalies: Anomaly[],
    metrics:   SystemMetrics,
): Promise<LLMDecision | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const anomalySummary = anomalies
        .map((a) => `[${a.severity.toUpperCase()}] ${a.label}: ${a.detail}`)
        .join("\n");

    const metricSummary = [
        `1h: ${metrics.h1.calls} calls, ${Math.round(metrics.h1.avgLatencyMs)}ms avg latency, error rate ${metrics.h1.total > 0 ? ((metrics.h1.errors / metrics.h1.total) * 100).toFixed(1) : 0}%`,
        `7d daily cost avg: $${metrics.d7DailyAvgCost.toFixed(5)} | 30d daily avg: $${metrics.d30DailyAvgCost.toFixed(5)}`,
    ].join("\n");

    const userContent = `Anomalies:\n${anomalySummary}\n\nMetrics:\n${metricSummary}\n\nPropose the optimal interventions.`;

    try {
        const client = new OpenAIClient(apiKey, "gpt-4.1-mini");
        const result = await client.completeChat({
            messages: [
                { role: "system", content: DECISION_PROMPT },
                { role: "user",   content: userContent },
            ],
            model:       "gpt-4.1-mini",
            temperature: 0.1,
            maxTokens:   350,
            json:        true,
            timeoutMs:   15_000,
        });

        const parsed = LLMDecisionSchema.parse(JSON.parse(result.content));

        logStructured({
            layer: "llm",
            step:  "llm-response",
            agent: "autonomous-runner",
            data:  { assessment: parsed.assessment, actions: parsed.actions.map((a) => `${a.type}:${a.confidence.toFixed(2)}`) },
        });

        return parsed;
    } catch (err) {
        logError("[AutonomousRunner] LLM decision failed", { error: (err as Error).message });
        return null;
    }
}

// ─── Rule-based fallback decision ─────────────────────────────────────────────

function ruleFallbackDecision(anomalies: Anomaly[]): LLMDecision {
    if (anomalies.length === 0) {
        return { assessment: "OK", reasoning: "No anomalies detected.", actions: [], duration_minutes: 0 };
    }

    const proposals: z.infer<typeof ActionProposalSchema>[] = [];
    const hasCost    = anomalies.some((a) => a.category === "cost");
    const hasLatency = anomalies.some((a) => a.category === "latency");
    const hasErrors  = anomalies.some((a) => a.category === "error_rate");
    const hasCrit    = anomalies.some((a) => a.severity === "critical");

    if (hasCost && hasCrit) {
        proposals.push({ type: "REDUCE_TOKENS_50PCT", reason: "Critical cost surge — aggressive token reduction", confidence: 0.80 });
    } else if (hasCost || hasLatency) {
        proposals.push({ type: "REDUCE_TOKENS_25PCT", reason: "Cost/latency issue — mild token reduction", confidence: 0.75 });
    }
    if (hasErrors) {
        proposals.push({ type: "PREFER_GEMINI",    reason: "Error rate elevated — switch to Gemini fallback", confidence: 0.75 });
        proposals.push({ type: "CHECK_AI_PROVIDER", reason: "Check provider status when errors detected",       confidence: 0.90 });
    }
    if (hasLatency) {
        proposals.push({ type: "ENABLE_TIMEOUT_REDUCTION", reason: "Latency spike — fail fast with tighter timeouts", confidence: 0.75 });
    }

    const assessment = hasCrit ? "CRITICAL" as const
        : anomalies.some((a) => a.severity === "high") ? "HIGH" as const
        : "MEDIUM" as const;

    return {
        assessment,
        reasoning:        `Rule-based fallback: ${anomalies.map((a) => a.label).join(", ")}.`,
        actions:          proposals,
        duration_minutes: hasCrit ? 90 : 30,
    };
}

// ─── Action dispatch ──────────────────────────────────────────────────────────

/**
 * Maps AutonomousActionType → concrete executor call.
 * Returns { success, message } — never throws.
 */
async function dispatchAction(
    type:     AutonomousActionType,
    duration: number,
): Promise<{ success: boolean; message: string }> {
    try {
        switch (type) {
            case "CLEAR_CACHE": {
                const r = await executeAdminAction({ type: "CLEAR_CACHE" }, "autonomous-runner");
                return { success: r.success, message: r.message ?? (r.success ? "Done" : "Failed") };
            }
            case "CHECK_SYSTEM": {
                const r = await executeAdminAction({ type: "VERIFY_MONITORING" }, "autonomous-runner");
                return { success: r.success, message: r.message ?? (r.success ? "Done" : "Failed") };
            }
            case "CHECK_AI_PROVIDER": {
                const r = await executeAdminAction({ type: "CHECK_AI_PROVIDER" }, "autonomous-runner");
                return { success: r.success, message: r.message ?? (r.success ? "Done" : "Failed") };
            }

            case "REDUCE_TOKENS_25PCT":
                setHealingOverrides(
                    ["reduce_tokens_25pct"],
                    "MEDIUM",
                    ["autonomous-runner"],
                    "Autonomous mode: 25% token reduction applied.",
                    duration,
                );
                return { success: true, message: "Token budget reduced 25% for " + duration + " min" };

            case "REDUCE_TOKENS_50PCT":
                setHealingOverrides(
                    ["reduce_tokens_50pct"],
                    "HIGH",
                    ["autonomous-runner"],
                    "Autonomous mode: 50% token reduction applied.",
                    duration,
                );
                return { success: true, message: "Token budget reduced 50% for " + duration + " min" };

            case "PREFER_GEMINI":
                setHealingOverrides(
                    ["prefer_gemini"],
                    "HIGH",
                    ["autonomous-runner"],
                    "Autonomous mode: routing to Gemini.",
                    duration,
                );
                return { success: true, message: "Provider switched to Gemini for " + duration + " min" };

            case "ENABLE_TIMEOUT_REDUCTION":
                setHealingOverrides(
                    ["enable_timeout_reduction"],
                    "MEDIUM",
                    ["autonomous-runner"],
                    "Autonomous mode: timeout reduction applied.",
                    duration,
                );
                return { success: true, message: "Request timeouts reduced 30% for " + duration + " min" };

            default:
                return { success: false, message: `Unknown action type: ${type as string}` };
        }
    } catch (err) {
        return { success: false, message: (err as Error).message ?? "Dispatch error" };
    }
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * After executing actions, snapshot current metrics and check if the anomaly
 * metric has improved. No corrective action taken here — purely observational.
 */
async function verifyResolution(
    anomaly:       Anomaly,
    beforeMetrics: SystemMetrics,
): Promise<VerificationResult> {
    // Re-fetch current 1-hour metrics for a quick sanity check.
    // We don't call analyzeSystem() fully (expensive) — just check the specific metric.
    const { prisma } = await import("@/lib/prisma");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
        if (anomaly.category === "cost") {
            // Cost changes are only visible over days; acknowledge overlay applied.
            return {
                anomalyId: anomaly.id,
                label:     anomaly.label,
                resolvedImmediately: false,
                note: "Cost remediations (token reduction) take effect on future calls. Monitor over next 24h.",
            };
        }

        if (anomaly.category === "latency") {
            const h1 = await prisma.aiUsageLog.aggregate({
                where: { createdAt: { gte: oneHourAgo } }, _avg: { latencyMs: true },
            });
            const currentAvg = h1._avg.latencyMs ?? 0;
            const improved   = currentAvg > 0 && currentAvg < anomaly.metric.observed;
            return {
                anomalyId: anomaly.id,
                label:     anomaly.label,
                resolvedImmediately: improved,
                note: improved
                    ? `Latency improved: now ${Math.round(currentAvg)}ms (was ${Math.round(anomaly.metric.observed)}ms)`
                    : `Latency still elevated at ${Math.round(currentAvg)}ms. Timeout reduction applied — monitor next cycle.`,
            };
        }

        if (anomaly.category === "error_rate") {
            const [errors, total] = await Promise.all([
                prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
                prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
            ]);
            const currentRate = total > 0 ? (errors / total) * 100 : 0;
            const improved    = currentRate < anomaly.metric.observed;
            return {
                anomalyId: anomaly.id,
                label:     anomaly.label,
                resolvedImmediately: improved,
                note: improved
                    ? `Error rate dropped: ${currentRate.toFixed(1)}% (was ${anomaly.metric.observed.toFixed(1)}%)`
                    : `Error rate unchanged at ${currentRate.toFixed(1)}%. Provider switch applied — routing to Gemini.`,
            };
        }

        if (anomaly.category === "availability") {
            const recent = await prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } });
            return {
                anomalyId: anomaly.id,
                label:     anomaly.label,
                resolvedImmediately: recent > 0,
                note: recent > 0
                    ? `Activity restored: ${recent} calls observed since check.`
                    : "Still no activity. Provider check dispatched — review results in admin panel.",
            };
        }

        return {
            anomalyId: anomaly.id,
            label:     anomaly.label,
            resolvedImmediately: false,
            note:      "Verification deferred — no direct metric for this anomaly category.",
        };
    } catch (err) {
        return {
            anomalyId: anomaly.id,
            label:     anomaly.label,
            resolvedImmediately: false,
            note:      `Verification query failed: ${(err as Error).message}`,
        };
    }

    // Suppress unused variable warning for beforeMetrics (used in callers for logging)
    void beforeMetrics;
}

// ─── Audit logging ────────────────────────────────────────────────────────────

async function persistCycleLog(result: AutonomousRunResult): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.adminActionLog.create({
            data: {
                actionType: "AUTONOMOUS_CYCLE",
                payload: JSON.parse(JSON.stringify({
                    mode:              result.mode,
                    anomalyCount:      result.anomaliesDetected.length,
                    actionsProposed:   result.actionsProposed.length,
                    actionsExecuted:   result.actionsExecuted.length,
                    anomalyIds:        result.anomaliesDetected.map((a) => a.id),
                    skippedReason:     result.skippedReason,
                })) as object,
                result: JSON.parse(JSON.stringify({
                    actionsExecuted:   result.actionsExecuted,
                    verification:      result.verification,
                    durationMs:        result.durationMs,
                })) as object,
                success: result.actionsExecuted.every((a) => a.success),
                userId:  "autonomous-runner",
            },
        });
    } catch (err) {
        logError("[AutonomousRunner] Cycle log write failed", { error: (err as Error).message });
    }
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runCycle(): Promise<AutonomousRunResult> {
    const ranAt   = new Date().toISOString();
    const startMs = Date.now();

    const mode = getAutonomyMode();

    const skip = (reason: string): AutonomousRunResult => ({
        ranAt, mode, durationMs: Date.now() - startMs,
        skippedReason:     reason,
        anomaliesDetected: [],
        actionsProposed:   [],
        guardsApplied:     [],
        actionsExecuted:   [],
        verification:      [],
        activeCooldowns:   activeCooldowns(),
    });

    // ── 1. Mode gate ────────────────────────────────────────────────────────
    if (mode === "OFF") {
        return skip("Autonomous mode is OFF. Set AUTONOMY_MODE=SAFE or FULL to enable.");
    }

    // ── 2. Lock (no concurrent runs) ────────────────────────────────────────
    if (_isRunning) {
        return skip("Another autonomous cycle is already in progress.");
    }

    _isRunning = true;

    try {
        logStructured({ layer: "orchestrator", agent: "autonomous-runner", step: "start", data: { mode, ranAt } });

        // ── 3. Detect anomalies ──────────────────────────────────────────────
        const { anomalies, metrics } = await analyzeSystem();

        logInfo("[AutonomousRunner] detection complete", {
            anomalyCount: anomalies.length,
            ids: anomalies.map((a) => a.id),
        });

        if (anomalies.length === 0) {
            logInfo("[AutonomousRunner] no anomalies — cycle complete");
            const res = skip("No anomalies detected — system is within normal bounds.");
            res.skippedReason = res.skippedReason;
            res.anomaliesDetected = [];
            persistCycleLog(res).catch(() => {});
            return res;
        }

        // ── 4. Decide — LLM with rule-based fallback ────────────────────────
        const llmDecision = await getLLMDecision(anomalies, metrics);
        const decision    = llmDecision ?? ruleFallbackDecision(anomalies);

        // Convert LLM proposals to ProposedAction format (tag with primary anomaly)
        const actionsProposed: ProposedAction[] = decision.actions.map((a) => ({
            type:       a.type,
            reason:     a.reason,
            confidence: a.confidence,
            // Associate each action with the highest-severity anomaly it addresses
            anomalyId:  anomalies.find((an) =>
                (a.type.includes("TOKENS") && an.category === "cost") ||
                (a.type === "PREFER_GEMINI" && an.category === "error_rate") ||
                (a.type === "ENABLE_TIMEOUT_REDUCTION" && an.category === "latency") ||
                (a.type === "CHECK_AI_PROVIDER" && an.category === "error_rate") ||
                (a.type === "CLEAR_CACHE")
            )?.id ?? anomalies[0].id,
        }));

        // ── 5. Guard — validate each proposal ──────────────────────────────
        const guardsApplied: GuardDecision[] = actionsProposed.map((p) =>
            validateAction(p, mode)
        );

        const allowedActions = guardsApplied
            .filter((g) => g.allowed)
            .slice(0, MAX_ACTIONS_PER_RUN);

        logInfo("[AutonomousRunner] guard results", {
            proposed: actionsProposed.length,
            allowed:  allowedActions.length,
            rejected: guardsApplied.filter((g) => !g.allowed).map((g) => g.reason),
        });

        // ── 6. Execute ──────────────────────────────────────────────────────
        const actionsExecuted: ExecutedAction[] = [];

        for (const guard of allowedActions) {
            const dispatchResult = await dispatchAction(guard.action.type, decision.duration_minutes);

            actionsExecuted.push({
                type:      guard.action.type,
                reason:    guard.action.reason,
                success:   dispatchResult.success,
                message:   dispatchResult.message ?? "",
                anomalyId: guard.action.anomalyId,
            });

            if (dispatchResult.success) {
                markActed(guard.action.anomalyId, guard.action.type);
            }
        }

        logInfo("[AutonomousRunner] execution complete", {
            executed:  actionsExecuted.length,
            successes: actionsExecuted.filter((a) => a.success).length,
        });

        // ── 7. Verify ───────────────────────────────────────────────────────
        const verification: VerificationResult[] = await Promise.all(
            anomalies.map((anomaly) => verifyResolution(anomaly, metrics))
        );

        // ── 8. Compose result + log ─────────────────────────────────────────
        const result: AutonomousRunResult = {
            ranAt,
            mode,
            durationMs:        Date.now() - startMs,
            anomaliesDetected: anomalies,
            actionsProposed,
            guardsApplied,
            actionsExecuted,
            verification,
            activeCooldowns:   activeCooldowns(),
        };

        logStructured({
            layer: "orchestrator",
            agent: "autonomous-runner",
            step:  "end",
            data:  {
                durationMs:     result.durationMs,
                anomalies:      anomalies.length,
                executed:       actionsExecuted.length,
                mode,
            },
        });

        // Explainability log (fire-and-forget)
        logDecision({
            decisionType: "AUTONOMOUS_ACTION",
            source:       "autonomous_runner",
            reasoning:    decision.reasoning,
            inputSummary: `Mode: ${mode}. Anomalies: ${anomalies.map((a) => `${a.id}(${a.severity})`).join(", ") || "none"}. Actions proposed: ${actionsProposed.length}, allowed by guard: ${allowedActions.length}.`,
            confidence:   ASSESSMENT_CONFIDENCE[decision.assessment] ?? 0.5,
            outcome:      actionsExecuted.length > 0
                ? `Executed: ${actionsExecuted.map((a) => a.type).join(", ")}`
                : "No actions executed",
            triggeredBy: "autonomous",
        }).catch(() => {});

        persistCycleLog(result).catch(() => {});
        return result;

    } finally {
        _isRunning = false;
        _lastRunAt = new Date().toISOString();
    }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Run one full autonomous cycle.
 *
 * Wrapped in a 60-second hard timeout so a hung DB query or LLM call
 * cannot block the server indefinitely.
 */
export async function runAutonomousCycle(): Promise<AutonomousRunResult> {
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Autonomous cycle timed out after 60s")), RUN_TIMEOUT_MS)
    );

    try {
        return await Promise.race([runCycle(), timeout]);
    } catch (err) {
        _isRunning = false; // Ensure lock is always released
        const reason = (err as Error).message ?? "Unknown error";
        logError("[AutonomousRunner] Cycle error", { error: reason });

        return {
            ranAt:             new Date().toISOString(),
            mode:              getAutonomyMode(),
            durationMs:        RUN_TIMEOUT_MS,
            skippedReason:     `Cycle failed: ${reason}`,
            anomaliesDetected: [],
            actionsProposed:   [],
            guardsApplied:     [],
            actionsExecuted:   [],
            verification:      [],
            activeCooldowns:   activeCooldowns(),
        };
    } finally {
        _lastRunAt = new Date().toISOString();
    }
}
