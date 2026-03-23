/**
 * src/services/ai/agentReplayLogger.ts
 *
 * Structured per-step logging for the agent orchestrator pipeline.
 *
 * Each call to logAgentStep() writes one row to AgentExecutionLog,
 * producing a full, ordered replay trace per requestId.
 *
 * SANITIZATION RULES (no sensitive data logged):
 *  - Keys matching REDACTED_KEYS are replaced with "[REDACTED]"
 *  - String fields longer than MAX_STRING_LEN are truncated
 *  - Objects deeper than MAX_DEPTH are collapsed to "[truncated]"
 *  - Arrays longer than MAX_ARRAY_LEN are sliced + a count note appended
 */

import { logError } from "@/infrastructure/logger";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";

type AgentExecDelegate = {
    create: (args: object) => Promise<unknown>;
    findMany: (args: object) => Promise<unknown[]>;
};

/** Stale Prisma singletons (dev/HMR) or clients from before `prisma generate` may omit this delegate. */
function getAgentExecutionLogDelegate(prisma: unknown): AgentExecDelegate | undefined {
    const d = (prisma as { agentExecutionLog?: unknown }).agentExecutionLog;
    if (!d || typeof (d as { create?: unknown }).create !== "function" || typeof (d as { findMany?: unknown }).findMany !== "function") {
        return undefined;
    }
    return d as AgentExecDelegate;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentStepLog {
    requestId:  string;
    agentName:  string;
    stepIndex:  number;
    input?:     unknown;
    output?:    unknown;
    latencyMs:  number;
    success:    boolean;
    errorMsg?:  string;
    metadata?:  Record<string, unknown>;
}

export interface ReplayStep {
    id:           string;
    requestId:    string;
    agentName:    string;
    stepIndex:    number;
    inputJson:    unknown | null;
    outputJson:   unknown | null;
    latencyMs:    number;
    success:      boolean;
    errorMsg:     string | null;
    metadata:     unknown | null;
    createdAt:    string;
}

export interface ReplayTrace {
    requestId:      string;
    steps:          ReplayStep[];
    llmCalls:       LLMCallSummary[];
    summary: {
        totalDurationMs:  number;
        totalTokens:      number;
        totalCostUsd:     number;
        agentCount:       number;
        success:          boolean;
        failedAgent:      string | null;
    };
}

export interface LLMCallSummary {
    id:              string;
    endpoint:        string | null;
    provider:        string;
    modelUsed:       string;
    promptTokens:    number;
    completionTokens:number;
    totalTokens:     number;
    latencyMs:       number;
    costEstimateUsd: number;
    success:         boolean;
    createdAt:       string;
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

const REDACTED_KEYS = new Set([
    "password", "passwordhash", "token", "secret", "apikey", "api_key",
    "authorization", "cookie", "accesstoken", "refreshtoken", "credential",
]);

const MAX_STRING_LEN = 500;
const MAX_ARRAY_LEN  = 10;
const MAX_DEPTH      = 4;

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return "[truncated]";
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
        return value.length > MAX_STRING_LEN
            ? value.slice(0, MAX_STRING_LEN) + `…[+${value.length - MAX_STRING_LEN} chars]`
            : value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        const sliced = value.slice(0, MAX_ARRAY_LEN).map((v) => sanitize(v, depth + 1));
        if (value.length > MAX_ARRAY_LEN) {
            sliced.push(`…[+${value.length - MAX_ARRAY_LEN} more]` as unknown);
        }
        return sliced;
    }
    if (typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (REDACTED_KEYS.has(k.toLowerCase())) {
                result[k] = "[REDACTED]";
            } else {
                result[k] = sanitize(v, depth + 1);
            }
        }
        return result;
    }
    return String(value);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

/**
 * Write one agent step to the AgentExecutionLog table.
 * Fire-and-forget — never throws; errors are logged to stderr only.
 */
export async function logAgentStep(step: AgentStepLog): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const agentTable = getAgentExecutionLogDelegate(prisma);
        if (!agentTable) return;

        await agentTable.create({
            data: {
                requestId: step.requestId,
                agentName: step.agentName,
                stepIndex: step.stepIndex,
                inputJson:  step.input  !== undefined ? sanitize(step.input)  as object : undefined,
                outputJson: step.output !== undefined ? sanitize(step.output) as object : undefined,
                latencyMs: step.latencyMs,
                success:   step.success,
                errorMsg:  step.errorMsg ?? null,
                metadata:  step.metadata ? sanitize(step.metadata) as object : undefined,
            },
        });
    } catch (err) {
        logError("[AgentReplayLogger] DB write failed", { agent: step.agentName, requestId: step.requestId, error: (err as Error).message });
    }
}

/**
 * Fetch the full replay trace for a single requestId.
 * Merges AgentExecutionLog (structured) with AiUsageLog (LLM call details).
 */
export async function getReplayTrace(requestId: string): Promise<ReplayTrace | null> {
    const { prisma } = await import("@/lib/prisma");
    const agentTable = getAgentExecutionLogDelegate(prisma);

    const [steps, llmLogs] = await Promise.all([
        agentTable
            ? agentTable.findMany({
                  where:   { requestId },
                  orderBy: { stepIndex: "asc" },
              })
            : Promise.resolve([]),
        prisma.aiUsageLog.findMany({
            where:   { requestId },
            orderBy: { createdAt: "asc" },
            select: {
                id: true, endpoint: true, provider: true, modelUsed: true,
                promptTokens: true, completionTokens: true, totalTokens: true,
                callSucceeded: true,
                latencyMs: true, costEstimateUsd: true, createdAt: true,
            },
        }),
    ]);

    if (steps.length === 0 && llmLogs.length === 0) return null;

    type RawAgentRow = {
        id: string;
        requestId: string;
        agentName: string;
        stepIndex: number;
        inputJson: unknown;
        outputJson: unknown;
        latencyMs: number;
        success: boolean;
        errorMsg: string | null;
        metadata: unknown;
        createdAt: Date;
    };

    const replaySteps: ReplayStep[] = (steps as RawAgentRow[]).map((s) => ({
        id:         s.id,
        requestId:  s.requestId,
        agentName:  s.agentName,
        stepIndex:  s.stepIndex,
        inputJson:  s.inputJson,
        outputJson: s.outputJson,
        latencyMs:  s.latencyMs,
        success:    s.success,
        errorMsg:   s.errorMsg,
        metadata:   s.metadata,
        createdAt:  s.createdAt.toISOString(),
    }));

    const llmCallSummaries: LLMCallSummary[] = llmLogs.map((l) => ({
        id:               l.id,
        endpoint:         l.endpoint,
        provider:         l.provider,
        modelUsed:        l.modelUsed,
        promptTokens:     l.promptTokens,
        completionTokens: l.completionTokens,
        totalTokens:      l.totalTokens,
        latencyMs:        l.latencyMs,
        costEstimateUsd:  l.costEstimateUsd,
        success:          !isAiUsageLogFailure(l),
        createdAt:        l.createdAt.toISOString(),
    }));

    const failedStep = replaySteps.find((s) => !s.success);

    return {
        requestId,
        steps: replaySteps,
        llmCalls: llmCallSummaries,
        summary: {
            totalDurationMs: replaySteps.reduce((sum, s) => sum + s.latencyMs, 0),
            totalTokens:     llmLogs.reduce((sum, l) => sum + l.totalTokens, 0),
            totalCostUsd:    llmLogs.reduce((sum, l) => sum + l.costEstimateUsd, 0),
            agentCount:      replaySteps.length,
            success:         !failedStep,
            failedAgent:     failedStep?.agentName ?? null,
        },
    };
}

/**
 * Convenience wrapper used inside the orchestrator.
 * Measures execution time, calls the agent fn, logs result.
 *
 * Usage:
 *   const result = await runWithReplayLog({
 *     requestId, agentName: "planner", stepIndex: 0,
 *     input: rawText,
 *     run: () => this.planner.run(rawText, requestId),
 *   });
 */
export async function runWithReplayLog<T>({
    requestId,
    agentName,
    stepIndex,
    input,
    run,
    buildOutputSummary,
}: {
    requestId:          string;
    agentName:          string;
    stepIndex:          number;
    input:              unknown;
    run:                () => Promise<T>;
    /** Optional: derive a compact output summary instead of logging the full result. */
    buildOutputSummary?: (result: T) => unknown;
}): Promise<T> {
    const startMs = Date.now();
    try {
        const result = await run();
        const latencyMs = Date.now() - startMs;
        const output = buildOutputSummary ? buildOutputSummary(result) : result;
        // fire-and-forget
        logAgentStep({ requestId, agentName, stepIndex, input, output, latencyMs, success: true }).catch(() => {});
        return result;
    } catch (err) {
        const latencyMs = Date.now() - startMs;
        logAgentStep({
            requestId, agentName, stepIndex, input,
            latencyMs, success: false,
            errorMsg: (err as Error).message?.slice(0, 500),
        }).catch(() => {});
        throw err;
    }
}
