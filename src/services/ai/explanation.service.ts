/**
 * src/services/ai/explanation.service.ts
 *
 * Explainability layer for every AI decision in VoyageAI.
 *
 * Every time the system makes an autonomous AI decision — whether it's the
 * admin assistant answering a query, the auto-healer applying remediations,
 * or the autonomous runner executing actions — a structured log entry is
 * written here so the system is fully transparent and auditable.
 *
 * FIELDS LOGGED
 * ─────────────────────────────────────────────────────────────────────────────
 *   reasoning    — why the AI made this specific decision
 *   inputSummary — what data was used (sanitized; NO PII, emails, or tokens)
 *   confidence   — 0–1 score (R² for predictions, severity level for anomalies,
 *                  or LLM assessment enum for healing/runner decisions)
 *   outcome      — what was recommended or what action was taken
 *
 * INTEGRATION POINTS
 * ─────────────────────────────────────────────────────────────────────────────
 *   logDecision()          → fire-and-forget from assistant route, autoHealing,
 *                            and autonomousRunner (never blocks request path)
 *   getRecentDecisions()   → admin explanations list page
 *   getDecisionById()      → admin "View Explanation" detail drawer
 */

import { logError } from "@/infrastructure/logger";

type AiDecisionDelegate = {
    create: (args: object) => Promise<unknown>;
    findMany: (args: object) => Promise<unknown[]>;
    findUnique: (args: object) => Promise<unknown | null>;
};

/** Stale Prisma singletons (dev/HMR) may omit this delegate after `prisma generate`. */
function getAiDecisionLogDelegate(prisma: unknown): AiDecisionDelegate | undefined {
    const d = (prisma as { aiDecisionLog?: unknown }).aiDecisionLog;
    if (
        !d
        || typeof (d as { create?: unknown }).create !== "function"
        || typeof (d as { findMany?: unknown }).findMany !== "function"
        || typeof (d as { findUnique?: unknown }).findUnique !== "function"
    ) {
        return undefined;
    }
    return d as AiDecisionDelegate;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionType =
    | "ASSISTANT_RESPONSE"
    | "AUTO_HEAL"
    | "AUTONOMOUS_ACTION"
    | "OPTIMIZATION";

/** Maps LLM / severity assessment levels to a 0–1 confidence score. */
export const ASSESSMENT_CONFIDENCE: Record<string, number> = {
    CRITICAL: 0.92,
    HIGH:     0.82,
    MEDIUM:   0.68,
    LOW:      0.52,
    OK:       0.30,
};

export interface LogDecisionParams {
    decisionType: DecisionType;
    source:       string;
    reasoning:    string;
    inputSummary: string;
    confidence?:  number;
    outcome:      string;
    requestId?:   string;
    triggeredBy?: string;
}

/** Shape returned to the admin panel — mirrors the Prisma model. */
export interface DecisionEntry {
    id:           string;
    decisionType: string;
    source:       string;
    reasoning:    string;
    inputSummary: string;
    confidence:   number | null;
    outcome:      string;
    requestId:    string | null;
    triggeredBy:  string | null;
    createdAt:    string;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist one AI decision explanation to `ai_decision_logs`.
 *
 * Designed for fire-and-forget — always call with `.catch(() => {})`.
 * Failures are logged but never propagate to the calling request.
 */
export async function logDecision(params: LogDecisionParams): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const delegate = getAiDecisionLogDelegate(prisma);
        if (!delegate) {
            logError("[ExplanationService] aiDecisionLog delegate missing — run `npx prisma generate` and restart the dev server");
            return;
        }

        await delegate.create({
            data: {
                decisionType: params.decisionType,
                source:       params.source,
                reasoning:    params.reasoning.slice(0, 2000),   // safe truncation
                inputSummary: params.inputSummary.slice(0, 1000),
                confidence:   params.confidence ?? null,
                outcome:      params.outcome.slice(0, 1000),
                requestId:    params.requestId ?? null,
                triggeredBy:  params.triggeredBy ?? null,
            },
        });
    } catch (err) {
        logError("[ExplanationService] logDecision failed", { error: (err as Error).message });
    }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent AI decisions for the admin explainability panel.
 *
 * @param limit       Max rows to return (default 100)
 * @param type        Optional filter by decision type
 */
export async function getRecentDecisions(
    limit = 100,
    type?: DecisionType,
): Promise<DecisionEntry[]> {
    const { prisma } = await import("@/lib/prisma");
    const delegate = getAiDecisionLogDelegate(prisma);
    if (!delegate) return [];

    const rows = (await delegate.findMany({
        where:   type ? { decisionType: type } : undefined,
        orderBy: { createdAt: "desc" },
        take:    limit,
        select: {
            id:           true,
            decisionType: true,
            source:       true,
            reasoning:    true,
            inputSummary: true,
            confidence:   true,
            outcome:      true,
            requestId:    true,
            triggeredBy:  true,
            createdAt:    true,
        },
    })) as Array<{
        id: string;
        decisionType: string;
        source: string;
        reasoning: string;
        inputSummary: string;
        confidence: number | null;
        outcome: string;
        requestId: string | null;
        triggeredBy: string | null;
        createdAt: Date;
    }>;

    return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
    }));
}

/**
 * Fetch a single decision by ID for the full explanation detail view.
 */
export async function getDecisionById(id: string): Promise<DecisionEntry | null> {
    const { prisma } = await import("@/lib/prisma");
    const delegate = getAiDecisionLogDelegate(prisma);
    if (!delegate) return null;

    const row = (await delegate.findUnique({
        where: { id },
        select: {
            id:           true,
            decisionType: true,
            source:       true,
            reasoning:    true,
            inputSummary: true,
            confidence:   true,
            outcome:      true,
            requestId:    true,
            triggeredBy:  true,
            createdAt:    true,
        },
    })) as {
        id: string;
        decisionType: string;
        source: string;
        reasoning: string;
        inputSummary: string;
        confidence: number | null;
        outcome: string;
        requestId: string | null;
        triggeredBy: string | null;
        createdAt: Date;
    } | null;

    if (!row) return null;
    return { ...row, createdAt: row.createdAt.toISOString() };
}

// ─── Helpers (used by callers when building their log params) ─────────────────

/**
 * Derive an assistant confidence score from anomaly + prediction context.
 * Critical anomalies → high confidence that the AI's analysis is relevant.
 */
export function deriveAssistantConfidence(
    anomalySeverities: string[],
    predictionCount:   number,
): number {
    if (anomalySeverities.includes("critical")) return 0.90;
    if (anomalySeverities.includes("warning"))  return 0.75;
    if (predictionCount > 0)                     return 0.62;
    return 0.45;
}
