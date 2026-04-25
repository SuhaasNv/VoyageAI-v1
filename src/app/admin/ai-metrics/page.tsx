/**
 * /admin/ai-metrics — AI Observability & Usage Analytics
 * Server component — force-dynamic, queries Prisma directly.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { whereAiCallFailed } from "@/lib/metrics/aiUsageLog";
import { CallsBarChart, CostLineChart, ProviderDonut, type DailyBucket } from "./_charts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderRow { provider: string; calls: number; tokens: number; avgLatencyMs: number; costUsd: number }
interface EndpointRow { endpoint: string; calls: number; tokens: number; avgLatencyMs: number; costUsd: number }
interface FailureRow  { id: string; endpoint: string | null; provider: string; modelUsed: string; latencyMs: number; createdAt: string }

interface MetricsData {
    totalCalls: number; totalTokens: number; avgLatencyMs: number;
    errorCount: number; successCount: number; errorRate: number; totalCostUsd: number;
    byEndpoint: EndpointRow[]; byProvider: ProviderRow[];
    dailyBuckets: DailyBucket[];
    recentFailures: FailureRow[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getMetrics(): Promise<MetricsData> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [totals, errorCount, byEndpointRaw, byProviderRaw, recentLogs, recentFailuresRaw] = await Promise.all([
        prisma.aiUsageLog.aggregate({
            _count: { id: true }, _sum: { totalTokens: true, costEstimateUsd: true }, _avg: { latencyMs: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailed }),
        prisma.aiUsageLog.groupBy({
            by: ["endpoint"], _count: { id: true },
            _sum: { totalTokens: true, costEstimateUsd: true }, _avg: { latencyMs: true },
            orderBy: { _count: { id: "desc" } },
        }),
        prisma.aiUsageLog.groupBy({
            by: ["provider"], _count: { id: true },
            _sum: { totalTokens: true, costEstimateUsd: true }, _avg: { latencyMs: true },
            orderBy: { _count: { id: "desc" } },
        }),
        // Last 14 days of logs for timeline
        prisma.aiUsageLog.findMany({
            where: { createdAt: { gte: fourteenDaysAgo } },
            select: { createdAt: true, totalTokens: true, costEstimateUsd: true },
            orderBy: { createdAt: "asc" },
        }),
        // Recent failures (0 tokens = error proxy)
        prisma.aiUsageLog.findMany({
            where: whereAiCallFailed,
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, endpoint: true, provider: true, modelUsed: true, latencyMs: true, createdAt: true },
        }),
    ]);

    // Build daily buckets
    const bucketMap: Map<string, { calls: number; tokens: number; costUsd: number }> = new Map();
    for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        bucketMap.set(key, { calls: 0, tokens: 0, costUsd: 0 });
    }
    for (const log of recentLogs) {
        const key = new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const b = bucketMap.get(key);
        if (b) { b.calls++; b.tokens += log.totalTokens; b.costUsd += log.costEstimateUsd; }
    }
    const dailyBuckets: DailyBucket[] = Array.from(bucketMap.entries()).map(([label, v]) => ({ label, ...v }));

    const totalCalls = totals._count.id;
    return {
        totalCalls, errorCount,
        successCount: totalCalls - errorCount,
        totalTokens:  totals._sum.totalTokens    ?? 0,
        avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
        errorRate:    totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
        totalCostUsd: totals._sum.costEstimateUsd ?? 0,
        byEndpoint: byEndpointRaw.map((r) => ({
            endpoint: r.endpoint ?? "(unknown)", calls: r._count.id,
            tokens: r._sum.totalTokens ?? 0, avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
            costUsd: r._sum.costEstimateUsd ?? 0,
        })),
        byProvider: byProviderRaw.map((r) => ({
            provider: r.provider, calls: r._count.id,
            tokens: r._sum.totalTokens ?? 0, avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
            costUsd: r._sum.costEstimateUsd ?? 0,
        })),
        dailyBuckets,
        recentFailures: recentFailuresRaw.map((r) => ({
            ...r, endpoint: r.endpoint, createdAt: r.createdAt.toISOString(),
        })),
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number)     { return n.toLocaleString("en-US"); }
function fmtCost(n: number) { return `$${n.toFixed(4)}`; }
function fmtPct(n: number)  { return `${n.toFixed(2)}%`; }
function relDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false, warn = false }: {
    label: string; value: string; sub?: string; accent?: boolean; warn?: boolean;
}) {
    return (
        <div className={`rounded-xl border p-5 backdrop-blur-xl hover:border-white/[0.14] transition-all duration-200 ${
            warn ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-white/[0.08] bg-white/[0.03]"
        }`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
            <p className={`text-3xl font-black tracking-tight ${warn ? "text-amber-400" : accent ? "text-[#10B981]" : "text-white"}`}>{value}</p>
            {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
        </div>
    );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                        {head.map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr><td colSpan={head.length} className="px-4 py-8 text-center text-xs text-slate-600">No data yet.</td></tr>
                    ) : rows.map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                            {row.map((cell, j) => (
                                <td key={j} className={`px-4 py-3 ${j === 0 ? "font-mono text-slate-200 text-xs" : "text-slate-400 text-right tabular-nums text-xs"}`}>{cell}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function MetricsContent() {
    await requireAdmin();
    const m = await getMetrics();

    const endpointRows = m.byEndpoint.map((r) => [r.endpoint, fmt(r.calls), fmt(r.tokens), `${r.avgLatencyMs} ms`, fmtCost(r.costUsd)]);
    const providerRows = m.byProvider.map((r) => [r.provider,  fmt(r.calls), fmt(r.tokens), `${r.avgLatencyMs} ms`, fmtCost(r.costUsd)]);
    const failureRows  = m.recentFailures.map((r) => [r.endpoint ?? "(unknown)", r.provider, r.modelUsed, `${r.latencyMs} ms`, relDate(r.createdAt)]);

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-8">
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">AI Metrics</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Aggregated from <code className="font-mono text-slate-400">ai_usage_logs</code> · {new Date().toUTCString()}
                </p>
            </div>

            {/* Stat grid */}
            <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Overview</p>
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Total AI Calls" value={fmt(m.totalCalls)}   sub={`${fmt(m.successCount)} succeeded`} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Total Tokens"   value={fmt(m.totalTokens)} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Avg Latency"    value={`${fmt(m.avgLatencyMs)} ms`} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Error Rate"     value={fmtPct(m.errorRate)} sub={`${fmt(m.errorCount)} failed calls`} warn={m.errorRate > 5} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Estimated Cost" value={fmtCost(m.totalCostUsd)} sub="token × rate · Estimated, not billed" accent /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Success Rate"   value={fmtPct(m.totalCalls > 0 ? (m.successCount / m.totalCalls) * 100 : 0)} sub={`${fmt(m.successCount)} / ${fmt(m.totalCalls)}`} /></div>
                </div>
            </section>

            {/* Charts — 2-col on lg+, all 4 in a row on 2xl */}
            <section className="grid grid-cols-12 gap-5">
                <div className="col-span-12 lg:col-span-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Daily Calls (14d)</p>
                    <CallsBarChart data={m.dailyBuckets} />
                </div>

                <div className="col-span-12 lg:col-span-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Provider Breakdown</p>
                    {m.byProvider.length === 0 ? (
                        <p className="text-xs text-slate-600 py-6 text-center">No data yet.</p>
                    ) : (
                        <ProviderDonut data={m.byProvider} />
                    )}
                </div>

                <div className="col-span-12 lg:col-span-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Cost Trend (14d)</p>
                    <CostLineChart data={m.dailyBuckets} />
                    <div className="flex justify-between mt-2">
                        <span className="text-[10px] text-slate-600">{m.dailyBuckets[0]?.label}</span>
                        <span className="text-[10px] text-slate-600">{m.dailyBuckets[m.dailyBuckets.length - 1]?.label}</span>
                    </div>
                </div>

            </section>

            {/* Tables — side by side on xl */}
            <section className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-6 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Calls by Endpoint</p>
                    <DataTable head={["Endpoint", "Calls", "Tokens", "Avg Latency", "Cost"]} rows={endpointRows} />
                </div>
                <div className="col-span-12 xl:col-span-6 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Calls by Provider</p>
                    <DataTable head={["Provider", "Calls", "Tokens", "Avg Latency", "Cost"]} rows={providerRows} />
                </div>
            </section>

            {/* Failure insights */}
            <section className="space-y-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Failure Insights</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Last 20 failed LLM calls (callSucceeded=false or legacy 0-token rows).</p>
                </div>
                {m.recentFailures.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center">
                        <p className="text-xs text-[#10B981]">No failures detected — all systems nominal.</p>
                    </div>
                ) : (
                    <DataTable head={["Endpoint", "Provider", "Model", "Latency", "When"]} rows={failureRows} />
                )}
            </section>

            <p className="text-[10px] text-slate-700 pb-4">
                Failed calls use explicit <code className="font-mono text-slate-500">callSucceeded</code> when present; legacy rows use 0 tokens only when the flag is unset.
            </p>
        </div>
    );
}

export default function AiMetricsPage() {
    return (
        <Suspense fallback={
            <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 animate-pulse space-y-8">
                <div className="h-7 w-48 rounded bg-white/[0.06]" />
                <div className="grid grid-cols-12 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="col-span-12 md:col-span-6 xl:col-span-4 h-28 rounded-xl bg-white/[0.03] border border-white/[0.06]" />)}
                </div>
            </div>
        }>
            <MetricsContent />
        </Suspense>
    );
}
