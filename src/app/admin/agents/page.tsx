/**
 * /admin/agents — Agent Replay System
 *
 * Primary source: AgentExecutionLog (structured per-agent input/output/latency)
 * Fallback:       AiUsageLog grouped by requestId (token-only data, legacy)
 *
 * The page lists recent pipeline runs. Clicking one requests the full
 * replay trace from GET /api/admin/agent-replay?requestId= and renders
 * a step-by-step timeline with expandable input/output panels.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma }   from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";
import AgentReplayView  from "./_trace";
import type { PipelineRun } from "./types";
export type { PipelineRun } from "./types";

// ─── Data ─────────────────────────────────────────────────────────────────────

/** Prisma delegate exists after `prisma generate`; may be missing on stale dev singletons or old clients. */
type StructuredStepRow = {
    requestId: string;
    agentName: string;
    latencyMs: number;
    success: boolean;
    createdAt: Date;
    stepIndex: number;
};

async function fetchStructuredAgentSteps(): Promise<StructuredStepRow[]> {
    const delegate = (prisma as unknown as { agentExecutionLog?: { findMany: (args: object) => Promise<StructuredStepRow[]> } })
        .agentExecutionLog;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
        where:   {},
        orderBy: { createdAt: "desc" },
        take:    500,
        select:  { requestId: true, agentName: true, latencyMs: true, success: true, createdAt: true, stepIndex: true },
    });
}

async function getRecentRuns(): Promise<PipelineRun[]> {
    // Fetch latest rows from AgentExecutionLog (structured); empty if delegate unavailable
    const structuredRaw = await fetchStructuredAgentSteps();

    // Also fetch recent AiUsageLogs with requestId for fallback coverage
    const usageRaw = await prisma.aiUsageLog.findMany({
        where:   { requestId: { not: null } },
        orderBy: { createdAt: "desc" },
        take:    400,
        select:  { requestId: true, latencyMs: true, totalTokens: true, callSucceeded: true, costEstimateUsd: true, createdAt: true },
    });

    // Build a map of requestId → usage totals
    const usageByReq = new Map<string, { tokens: number; cost: number }>();
    for (const l of usageRaw) {
        const key = l.requestId!;
        const prev = usageByReq.get(key) ?? { tokens: 0, cost: 0 };
        usageByReq.set(key, { tokens: prev.tokens + l.totalTokens, cost: prev.cost + l.costEstimateUsd });
    }

    // Group structured logs by requestId
    const structuredByReq = new Map<string, typeof structuredRaw>();
    for (const row of structuredRaw) {
        if (!structuredByReq.has(row.requestId)) structuredByReq.set(row.requestId, []);
        structuredByReq.get(row.requestId)!.push(row);
    }

    // Collect all unique requestIds (structured first, then legacy-only)
    const allReqIds = new Set<string>([
        ...structuredByReq.keys(),
        ...usageByReq.keys(),
    ]);

    const runs: PipelineRun[] = [];

    for (const requestId of allReqIds) {
        if (runs.length >= 25) break;

        const structuredSteps = structuredByReq.get(requestId) ?? [];
        const usageTotals     = usageByReq.get(requestId) ?? { tokens: 0, cost: 0 };

        if (structuredSteps.length > 0) {
            const sorted = [...structuredSteps].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const first  = sorted[0];
            const last   = sorted[sorted.length - 1];
            const totalDurationMs = last.createdAt.getTime() - first.createdAt.getTime() + last.latencyMs;
            const failedStep = sorted.find((s) => !s.success);

            runs.push({
                requestId,
                startedAt:         first.createdAt.toISOString(),
                totalDurationMs,
                totalTokens:       usageTotals.tokens,
                totalCostUsd:      usageTotals.cost,
                stepCount:         structuredSteps.length,
                hasError:          !!failedStep,
                failedAgent:       failedStep?.agentName ?? null,
                hasStructuredLogs: true,
            });
        } else {
            // Legacy: only AiUsageLog data available
            const usageLogs = usageRaw.filter((l) => l.requestId === requestId);
            const sorted    = [...usageLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            const first     = sorted[0];
            const last      = sorted[sorted.length - 1];
            if (!first) continue;

            runs.push({
                requestId,
                startedAt:         first.createdAt.toISOString(),
                totalDurationMs:   last.createdAt.getTime() - first.createdAt.getTime() + last.latencyMs,
                totalTokens:       usageTotals.tokens,
                totalCostUsd:      usageTotals.cost,
                stepCount:         usageLogs.length,
                hasError:          usageLogs.some((l) => isAiUsageLogFailure(l)),
                failedAgent:       null,
                hasStructuredLogs: false,
            });
        }
    }

    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function AgentsContent() {
    await requireAdmin();
    const runs = await getRecentRuns();

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-7">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Agent Replay</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Step-by-step pipeline traces · last {runs.length} runs
                    </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 shrink-0 pt-1">
                    <span className="w-2 h-2 rounded-full bg-[#10B981]" />structured
                    <span className="w-2 h-2 rounded-full bg-slate-600 ml-2" />legacy
                </div>
            </div>

            {runs.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
                    <p className="text-sm text-slate-500">No agent executions recorded yet.</p>
                    <p className="text-xs text-slate-700 mt-1">Logs appear after trips are created via the orchestrator.</p>
                </div>
            ) : (
                <AgentReplayView runs={runs} />
            )}
        </div>
    );
}

export default function AgentsPage() {
    return (
        <Suspense fallback={
            <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-4 animate-pulse">
                <div className="h-7 w-56 rounded bg-white/[0.06]" />
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.06]" />
                ))}
            </div>
        }>
            <AgentsContent />
        </Suspense>
    );
}
