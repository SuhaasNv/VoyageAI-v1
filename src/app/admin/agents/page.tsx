/**
 * /admin/agents — Agent Debug Panel
 *
 * Groups ai_usage_logs by requestId to surface per-request pipeline traces.
 * Shows the last 20 distinct requestIds with each LLM call as a "step".
 * No schema changes needed — works entirely from existing AiUsageLog data.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import AgentTraceList from "./_trace";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentStep {
    id: string;
    endpoint: string | null;
    provider: string;
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    costEstimateUsd: number;
    createdAt: string;
}

export interface AgentExecution {
    requestId: string;
    startedAt: string;
    totalDurationMs: number;
    totalTokens: number;
    totalCostUsd: number;
    stepCount: number;
    hasError: boolean;
    steps: AgentStep[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getExecutions(): Promise<AgentExecution[]> {
    // Fetch logs that have a requestId (agent pipeline calls)
    const logs = await prisma.aiUsageLog.findMany({
        where:   { requestId: { not: null } },
        orderBy: { createdAt: "desc" },
        take:    400,
        select: {
            id: true, requestId: true, endpoint: true,
            provider: true, modelUsed: true,
            promptTokens: true, completionTokens: true, totalTokens: true,
            latencyMs: true, costEstimateUsd: true, createdAt: true,
        },
    });

    // Group by requestId; preserve ordering within group (already desc, will reverse per group)
    const grouped = new Map<string, typeof logs>();
    for (const log of logs) {
        const key = log.requestId!;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(log);
    }

    const executions: AgentExecution[] = [];
    for (const [requestId, steps] of grouped) {
        const sorted = [...steps].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const first = sorted[0];
        const last  = sorted[sorted.length - 1];
        const totalDurationMs = last.createdAt.getTime() - first.createdAt.getTime() + last.latencyMs;

        executions.push({
            requestId,
            startedAt:       first.createdAt.toISOString(),
            totalDurationMs,
            totalTokens:     steps.reduce((s, l) => s + l.totalTokens, 0),
            totalCostUsd:    steps.reduce((s, l) => s + l.costEstimateUsd, 0),
            stepCount:       steps.length,
            hasError:        steps.some((l) => l.totalTokens === 0),
            steps: sorted.map((l) => ({ ...l, requestId: undefined, createdAt: l.createdAt.toISOString() })) as AgentStep[],
        });

        if (executions.length >= 20) break;
    }

    return executions;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function AgentsContent() {
    await requireAdmin();
    const executions = await getExecutions();

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-7">
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Agent Debug Panel</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Last 20 agent pipeline executions, grouped by <code className="font-mono">requestId</code>
                </p>
            </div>

            {executions.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
                    <p className="text-sm text-slate-500">No agent executions recorded yet.</p>
                    <p className="text-xs text-slate-700 mt-1">Logs appear after trips are created via the orchestrator.</p>
                </div>
            ) : (
                <AgentTraceList executions={executions} />
            )}
        </div>
    );
}

export default function AgentsPage() {
    return (
        <Suspense fallback={
            <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-4 animate-pulse">
                <div className="h-7 w-56 rounded bg-white/[0.06]" />
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.06]" />
                ))}
            </div>
        }>
            <AgentsContent />
        </Suspense>
    );
}
