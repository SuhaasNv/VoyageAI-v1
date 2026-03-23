/**
 * /admin/logs — Audit Log Viewer
 *
 * Reads from AuditLog (auth events) and AiUsageLog (AI pipeline events).
 * Server renders the initial view with filter state passed as searchParams.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";
import LogsClient from "./_client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
    id: string;
    ts: string;          // ISO
    layer: "auth" | "ai" | "system";
    action: string;      // e.g. "LOGIN", "REGISTER", "AI_CALL"
    email: string | null;
    requestId: string | null;
    meta: string;        // JSON snippet
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getLogs(layer: string): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];

    if (layer === "all" || layer === "auth") {
        const auditLogs = await prisma.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { user: { select: { email: true } } },
        });
        for (const l of auditLogs) {
            entries.push({
                id:        l.id,
                ts:        l.createdAt.toISOString(),
                layer:     "auth",
                action:    l.action,
                email:     l.user?.email ?? null,
                requestId: null,
                meta:      JSON.stringify({ ip: l.ipAddress, ua: l.userAgent?.slice(0, 40) }),
            });
        }
    }

    if (layer === "all" || layer === "ai") {
        const aiLogs = await prisma.aiUsageLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true, createdAt: true, provider: true, modelUsed: true,
                totalTokens: true, callSucceeded: true, latencyMs: true, endpoint: true,
                requestId: true, costEstimateUsd: true,
            },
        });
        for (const l of aiLogs) {
            entries.push({
                id:        l.id,
                ts:        l.createdAt.toISOString(),
                layer:     "ai",
                action:    isAiUsageLogFailure(l) ? "AI_ERROR" : "AI_CALL",
                email:     null,
                requestId: l.requestId,
                meta:      JSON.stringify({
                    endpoint: l.endpoint,
                    provider: l.provider,
                    model:    l.modelUsed,
                    tokens:   l.totalTokens,
                    ms:       l.latencyMs,
                    cost:     `$${l.costEstimateUsd.toFixed(4)}`,
                }),
            });
        }
    }

    // Sort all merged entries by timestamp desc
    entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return entries.slice(0, 200);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function LogsContent({ layer }: { layer: string }) {
    await requireAdmin();
    const logs = await getLogs(layer);
    return <LogsClient logs={logs} initialLayer={layer} />;
}

interface LogsPageProps {
    searchParams?: Promise<{ layer?: string }>;
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
    const params = await searchParams;
    const layer = params?.layer ?? "all";

    return (
        <Suspense fallback={
            <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-5 animate-pulse">
                <div className="h-7 w-36 rounded bg-white/[0.06]" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-white/[0.03] border border-white/[0.06]" />
                ))}
            </div>
        }>
            <LogsContent layer={layer} />
        </Suspense>
    );
}
