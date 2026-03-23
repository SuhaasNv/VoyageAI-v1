/**
 * src/services/ai/autoHealing.service.ts
 *
 * AI Auto-Healing Engine for VoyageAI.
 *
 * Pipeline (runs on-demand or on a schedule via the admin API):
 *
 *   1. OBSERVE   — fetch last-1h and last-5m metrics from AiUsageLog + User
 *   2. DETECT    — rule-based anomaly detection (no LLM yet — fast and cheap)
 *   3. DECIDE    — if anomalies exist, call gpt-4.1-mini for a structured
 *                  action recommendation (LLM used only when needed)
 *   4. ACT       — apply remediations to the HealingStore singleton which is
 *                  consulted by modelRouter.selectModelConfig() on every call
 *   5. LOG       — write a structured audit entry to the DB for visibility
 *
 * INTEGRATION POINTS:
 *   - src/services/ai/healingStore.ts     — state store + modelRouter hook
 *   - src/lib/ai/modelRouter.ts            — calls applyHealingOverrides()
 *   - src/app/api/admin/auto-heal/route.ts — API surface (trigger + status)
 */

import { prisma }       from "@/lib/prisma";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";
import { logInfo, logError, logStructured } from "@/infrastructure/logger";
import { OpenAIClient } from "@/infrastructure/llm/openaiClient";
import { z }            from "zod";
import {
    setHealingOverrides,
    clearHealingOverrides,
    recordRunTimestamps,
    getHealingStatus,
    type HealingAction,
    type HealingAssessment,
} from "./healingStore";
import { logDecision, ASSESSMENT_CONFIDENCE } from "./explanation.service";

// ─── Configuration ────────────────────────────────────────────────────────────

export const AUTO_HEAL_INTERVAL_MINUTES = 10;

const THRESHOLDS = {
    /** Cost increase: 7d daily avg vs 30d daily avg. */
    costSurgePct:             30,   // %
    /** Latency: 1h avg must be at most this multiple of all-time avg. */
    latencySpikeMultiplier:   2.0,
    /** Absolute latency ceiling (ms) regardless of relative change. */
    latencyAbsoluteCeilingMs: 15_000,
    /** Error rate (0-token calls) in the last hour. */
    errorRatePct:             5,
    /** Min call volume before we flag error-rate anomalies (avoid noise). */
    minCallsForErrorFlag:     5,
    /** Latency spike over last 5 min vs 1 h. */
    latencySpike5mMultiplier: 2.5,
} as const;

// ─── Anomaly types ────────────────────────────────────────────────────────────

export interface Anomaly {
    id:        string;
    severity:  "low" | "medium" | "high" | "critical";
    category:  "cost" | "latency" | "error_rate" | "availability";
    label:     string;
    detail:    string;
    metric:    { observed: number; threshold: number; unit: string };
}

// ─── LLM decision schema ──────────────────────────────────────────────────────

const DecisionSchema = z.object({
    assessment:       z.enum(["OK", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    actions:          z.array(z.enum([
        "reduce_tokens_25pct",
        "reduce_tokens_50pct",
        "prefer_gemini",
        "enable_timeout_reduction",
        "clear_healing",
        "no_action",
    ])),
    reasoning:        z.string().min(10).max(400),
    duration_minutes: z.number().int().min(5).max(120),
});

type Decision = z.infer<typeof DecisionSchema>;

// ─── Result type returned to caller ──────────────────────────────────────────

export interface HealingResult {
    ranAt:           string;
    anomalies:       Anomaly[];
    decision:        Decision | null;
    actionsApplied:  HealingAction[];
    healingActive:   boolean;
    durationMs:      number;
}

// ─── Step 1: Observe ──────────────────────────────────────────────────────────

async function collectMetrics() {
    const now           = Date.now();
    const oneHourAgo    = new Date(now - 60 * 60 * 1000);
    const fiveMinAgo    = new Date(now - 5  * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
        allTime,
        h1, h1Errors, h1Count,
        m5, m5Errors, m5Count,
        d7Cost,
        d30Cost,
    ] = await Promise.all([
        prisma.aiUsageLog.aggregate({
            _avg: { latencyMs: true },
            _count: { id: true },
        }),
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: oneHourAgo } },
            _avg: { latencyMs: true },
            _count: { id: true },
            _sum:  { costEstimateUsd: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: fiveMinAgo } },
            _avg: { latencyMs: true },
            _count: { id: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(fiveMinAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo } } }),
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: sevenDaysAgo } },
            _sum: { costEstimateUsd: true },
        }),
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: thirtyDaysAgo } },
            _sum: { costEstimateUsd: true },
        }),
    ]);

    return {
        allTime:    { avgLatency: allTime._avg.latencyMs ?? 0, totalCalls: allTime._count.id },
        h1:         { avgLatency: h1._avg.latencyMs ?? 0, calls: h1._count.id, errors: h1Errors, total: h1Count, cost: h1._sum.costEstimateUsd ?? 0 },
        m5:         { avgLatency: m5._avg.latencyMs ?? 0, calls: m5._count.id, errors: m5Errors, total: m5Count },
        d7DailyAvg: (d7Cost._sum.costEstimateUsd  ?? 0) / 7,
        d30DailyAvg:(d30Cost._sum.costEstimateUsd ?? 0) / 30,
    };
}

// ─── Step 2: Detect ───────────────────────────────────────────────────────────

function detectAnomalies(m: Awaited<ReturnType<typeof collectMetrics>>): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // ── Cost surge ───────────────────────────────────────────────────────────
    if (m.d30DailyAvg > 0 && m.d7DailyAvg > 0) {
        const costChangePct = ((m.d7DailyAvg - m.d30DailyAvg) / m.d30DailyAvg) * 100;
        if (costChangePct > THRESHOLDS.costSurgePct) {
            anomalies.push({
                id:       "cost_surge",
                severity: costChangePct > 80 ? "critical" : costChangePct > 50 ? "high" : "medium",
                category: "cost",
                label:    "Cost surge",
                detail:   `7d daily avg ($${m.d7DailyAvg.toFixed(5)}) is ${costChangePct.toFixed(1)}% above 30d baseline ($${m.d30DailyAvg.toFixed(5)}).`,
                metric:   { observed: costChangePct, threshold: THRESHOLDS.costSurgePct, unit: "%" },
            });
        }
    }

    // ── Latency spike (1h vs all-time) ───────────────────────────────────────
    const baseline = m.allTime.avgLatency;
    const h1Lat    = m.h1.avgLatency;
    if (baseline > 0 && h1Lat > 0) {
        const ratio = h1Lat / baseline;
        if (ratio > THRESHOLDS.latencySpikeMultiplier || h1Lat > THRESHOLDS.latencyAbsoluteCeilingMs) {
            anomalies.push({
                id:       "latency_spike_1h",
                severity: ratio > 4 || h1Lat > 20_000 ? "critical" : ratio > 3 ? "high" : "medium",
                category: "latency",
                label:    "Latency spike (1h)",
                detail:   `Avg latency last hour: ${Math.round(h1Lat)}ms (${ratio.toFixed(1)}× all-time avg of ${Math.round(baseline)}ms).`,
                metric:   { observed: h1Lat, threshold: baseline * THRESHOLDS.latencySpikeMultiplier, unit: "ms" },
            });
        }
    }

    // ── Latency spike (5m vs 1h) — fast-moving spike ─────────────────────────
    if (m.h1.avgLatency > 0 && m.m5.avgLatency > 0 && m.m5.calls >= 3) {
        const ratio5m = m.m5.avgLatency / m.h1.avgLatency;
        if (ratio5m > THRESHOLDS.latencySpike5mMultiplier) {
            anomalies.push({
                id:       "latency_spike_5m",
                severity: ratio5m > 5 ? "critical" : "high",
                category: "latency",
                label:    "Latency spike (5m)",
                detail:   `5m avg latency (${Math.round(m.m5.avgLatency)}ms) is ${ratio5m.toFixed(1)}× the 1h avg (${Math.round(m.h1.avgLatency)}ms).`,
                metric:   { observed: m.m5.avgLatency, threshold: m.h1.avgLatency * THRESHOLDS.latencySpike5mMultiplier, unit: "ms" },
            });
        }
    }

    // ── Error rate (1h) ───────────────────────────────────────────────────────
    if (m.h1.total >= THRESHOLDS.minCallsForErrorFlag) {
        const errorRatePct = (m.h1.errors / m.h1.total) * 100;
        if (errorRatePct > THRESHOLDS.errorRatePct) {
            anomalies.push({
                id:       "error_rate_1h",
                severity: errorRatePct > 40 ? "critical" : errorRatePct > 20 ? "high" : "medium",
                category: "error_rate",
                label:    "Elevated error rate (1h)",
                detail:   `${errorRatePct.toFixed(1)}% of AI calls (${m.h1.errors}/${m.h1.total}) returned 0 tokens in the last hour.`,
                metric:   { observed: errorRatePct, threshold: THRESHOLDS.errorRatePct, unit: "%" },
            });
        }
    }

    // ── Availability: zero calls in 1h when we have historical volume ─────────
    if (m.allTime.totalCalls > 50 && m.h1.calls === 0) {
        anomalies.push({
            id:       "no_activity_1h",
            severity: "high",
            category: "availability",
            label:    "Zero AI activity (1h)",
            detail:   "No AI calls recorded in the last hour despite sustained historical usage. Possible silent provider failure.",
            metric:   { observed: 0, threshold: 1, unit: "calls/h" },
        });
    }

    return anomalies;
}

// ─── Step 3: Decide (LLM) ────────────────────────────────────────────────────

const DECISION_SYSTEM_PROMPT = `You are an AI ops engineer for a travel SaaS platform.
You are given a list of detected system anomalies and must prescribe the minimum necessary interventions.

Available actions:
- reduce_tokens_25pct  : reduce all LLM maxTokens by 25% to cut cost and latency
- reduce_tokens_50pct  : reduce all LLM maxTokens by 50% — use only for severe cost/latency
- prefer_gemini        : route AI calls to Gemini instead of OpenAI (if Gemini is available)
- enable_timeout_reduction : reduce all request timeouts by 30% to fail fast under degraded conditions
- clear_healing        : remove any previously applied overrides (use when system recovers)
- no_action            : system is within acceptable bounds; no changes needed

Rules:
- Apply the MINIMUM set of actions that address the anomalies
- Prefer cost-reduction actions for cost anomalies, timeout reduction for latency, prefer_gemini for provider errors
- Duration should be proportional to severity: LOW=15, MEDIUM=30, HIGH=60, CRITICAL=90 minutes
- If no anomalies are present, return assessment "OK" with action ["no_action"]
- reasoning must be 1-3 sentences, factual, referencing the anomaly data

Respond with valid JSON only. No markdown, no explanation.`;

async function getLLMDecision(anomalies: Anomaly[], metrics: Awaited<ReturnType<typeof collectMetrics>>): Promise<Decision | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        logError("[AutoHeal] OPENAI_API_KEY not set — skipping LLM decision, applying rule-based fallback");
        return null;
    }

    const anomalySummary = anomalies.map((a) =>
        `[${a.severity.toUpperCase()}] ${a.label}: ${a.detail}`
    ).join("\n");

    const prompt = `Detected anomalies:\n${anomalySummary}\n\nMetrics snapshot:\n- 1h calls: ${metrics.h1.calls}, avg latency: ${Math.round(metrics.h1.avgLatency)}ms, error rate: ${metrics.h1.total > 0 ? ((metrics.h1.errors / metrics.h1.total) * 100).toFixed(1) : 0}%\n- 7d daily cost avg: $${metrics.d7DailyAvg.toFixed(5)}, 30d daily avg: $${metrics.d30DailyAvg.toFixed(5)}\n\nRespond with the optimal intervention as a JSON object.`;

    try {
        const client = new OpenAIClient(apiKey, "gpt-4.1-mini");
        const result = await client.completeChat({
            messages: [
                { role: "system", content: DECISION_SYSTEM_PROMPT },
                { role: "user",   content: prompt },
            ],
            model:       "gpt-4.1-mini",
            temperature: 0.1,
            maxTokens:   300,
            json:        true,
            timeoutMs:   15_000,
        });

        const raw      = JSON.parse(result.content);
        const decision = DecisionSchema.parse(raw);

        logStructured({
            layer: "llm",
            step:  "llm-response",
            agent: "auto-healer",
            data:  { assessment: decision.assessment, actions: decision.actions, latencyMs: result.latencyMs },
        });

        return decision;
    } catch (err) {
        logError("[AutoHeal] LLM decision failed — applying rule-based fallback", { error: (err as Error).message });
        return null;
    }
}

// ─── Rule-based fallback (no API key / LLM failure) ───────────────────────────

function ruleBasedDecision(anomalies: Anomaly[]): Decision {
    if (anomalies.length === 0) {
        return { assessment: "OK", actions: ["no_action"], reasoning: "No anomalies detected.", duration_minutes: 0 };
    }

    const hasCritical = anomalies.some((a) => a.severity === "critical");
    const hasHigh     = anomalies.some((a) => a.severity === "high");
    const hasCost     = anomalies.some((a) => a.category === "cost");
    const hasLatency  = anomalies.some((a) => a.category === "latency");
    const hasErrors   = anomalies.some((a) => a.category === "error_rate");

    const actions: HealingAction[] = [];
    if (hasCost || hasCritical) actions.push("reduce_tokens_50pct");
    else if (hasLatency)         actions.push("reduce_tokens_25pct");
    if (hasLatency || hasCritical) actions.push("enable_timeout_reduction");
    if (hasErrors || hasCritical)  actions.push("prefer_gemini");

    const assessment: HealingAssessment = hasCritical ? "CRITICAL" : hasHigh ? "HIGH" : "MEDIUM";
    const duration = hasCritical ? 90 : hasHigh ? 60 : 30;

    return {
        assessment,
        actions: actions.length > 0 ? actions : ["no_action"],
        reasoning: `Rule-based fallback: ${anomalies.map((a) => a.label).join(", ")}.`,
        duration_minutes: duration,
    };
}

// ─── Step 4 + 5: Act + Log ────────────────────────────────────────────────────

async function persistAuditLog(
    anomalies: Anomaly[],
    decision:  Decision,
    applied:   HealingAction[],
): Promise<void> {
    try {
        const message = [
            `AutoHeal: ${decision.assessment}`,
            anomalies.length > 0 ? `Anomalies: ${anomalies.map((a) => a.label).join(", ")}` : "No anomalies",
            `Actions: ${applied.length > 0 ? applied.join(", ") : "none"}`,
            `Reasoning: ${decision.reasoning}`,
        ].join(" | ");

        await prisma.auditLog.create({
            data: {
                action:   "AUTO_HEAL_RUN",
                metadata: {
                    assessment:   decision.assessment,
                    anomalies:    anomalies.map((a) => ({ id: a.id, severity: a.severity, label: a.label })),
                    actions:      applied,
                    reasoning:    decision.reasoning,
                    duration_min: decision.duration_minutes,
                },
            },
        });

        logStructured({
            layer: "orchestrator",
            agent: "auto-healer",
            step:  applied.length > 0 ? "output" : "end",
            data:  { assessment: decision.assessment, applied, anomalyCount: anomalies.length, message },
        });

        // Explainability log (fire-and-forget)
        logDecision({
            decisionType: "AUTO_HEAL",
            source:       "auto_healer",
            reasoning:    decision.reasoning,
            inputSummary: `Anomalies detected: ${anomalies.length > 0 ? anomalies.map((a) => a.label).join(", ") : "none"}. Assessment: ${decision.assessment}.`,
            confidence:   ASSESSMENT_CONFIDENCE[decision.assessment] ?? 0.5,
            outcome:      applied.length > 0 ? `Applied: ${applied.join(", ")} for ${decision.duration_minutes} min` : "No actions applied",
            triggeredBy:  "scheduled",
        }).catch(() => {});
    } catch (err) {
        // Audit persistence failure must never crash the healing engine
        logError("[AutoHeal] Audit log write failed", { error: (err as Error).message });
    }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run one full auto-healing cycle.
 *
 * Safe to call concurrently — if a cycle is already in-flight the result is
 * idempotent (the store will just be written with fresh data).
 *
 * @returns Full HealingResult for the API response or internal inspection.
 */
export async function runAutoHealCycle(): Promise<HealingResult> {
    const startMs = Date.now();
    const ranAt   = new Date().toISOString();

    logStructured({ layer: "orchestrator", agent: "auto-healer", step: "start", data: { ranAt } });

    // ── 1. Observe ──────────────────────────────────────────────────────────
    const metrics = await collectMetrics();

    // ── 2. Detect ───────────────────────────────────────────────────────────
    const anomalies = detectAnomalies(metrics);

    logInfo("[AutoHeal] detection complete", {
        anomalyCount: anomalies.length,
        severities:   anomalies.map((a) => `${a.id}:${a.severity}`),
    });

    // ── 3. Decide ───────────────────────────────────────────────────────────
    let decision: Decision;
    if (anomalies.length === 0) {
        decision = { assessment: "OK", actions: ["no_action"], reasoning: "All metrics within normal bounds.", duration_minutes: 0 };
    } else {
        const llmDecision = await getLLMDecision(anomalies, metrics);
        decision = llmDecision ?? ruleBasedDecision(anomalies);
    }

    // ── 4. Act ──────────────────────────────────────────────────────────────
    const actionsApplied: HealingAction[] = decision.actions.filter(
        (a): a is HealingAction => a !== "no_action"
    );

    if (decision.assessment === "OK" || actionsApplied.includes("clear_healing")) {
        clearHealingOverrides("auto-heal-ok");
    } else if (actionsApplied.length > 0) {
        setHealingOverrides(
            actionsApplied,
            decision.assessment as HealingAssessment,
            anomalies.map((a) => a.label),
            decision.reasoning,
            decision.duration_minutes,
        );
    }

    recordRunTimestamps(new Date(), AUTO_HEAL_INTERVAL_MINUTES);

    // ── 5. Log ──────────────────────────────────────────────────────────────
    await persistAuditLog(anomalies, decision, actionsApplied);

    const result: HealingResult = {
        ranAt,
        anomalies,
        decision,
        actionsApplied,
        healingActive: getHealingStatus().active,
        durationMs:    Date.now() - startMs,
    };

    logStructured({
        layer: "orchestrator",
        agent: "auto-healer",
        step:  "end",
        data:  { durationMs: result.durationMs, healingActive: result.healingActive },
    });

    return result;
}
