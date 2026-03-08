/**
 * /admin/ai-metrics
 *
 * AI usage metrics page — auth handled by parent admin layout.
 * Queries ai_usage_logs directly. Always server-rendered on demand.
 */

export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { AiMetrics } from "@/app/api/admin/ai-metrics/route";

// ─── Data layer ───────────────────────────────────────────────────────────────

async function getMetrics(): Promise<AiMetrics> {
    const [totals, errorCount, byEndpoint, byProvider] = await Promise.all([
        prisma.aiUsageLog.aggregate({
            _count: { id: true },
            _sum:   { totalTokens: true, costEstimateUsd: true },
            _avg:   { latencyMs: true },
        }),
        prisma.aiUsageLog.count({ where: { totalTokens: 0 } }),
        prisma.aiUsageLog.groupBy({
            by:      ["endpoint"],
            _count:  { id: true },
            _sum:    { totalTokens: true, costEstimateUsd: true },
            _avg:    { latencyMs: true },
            orderBy: { _count: { id: "desc" } },
        }),
        prisma.aiUsageLog.groupBy({
            by:      ["provider"],
            _count:  { id: true },
            _sum:    { totalTokens: true, costEstimateUsd: true },
            _avg:    { latencyMs: true },
            orderBy: { _count: { id: "desc" } },
        }),
    ]);

    const totalCalls   = totals._count.id;
    const successCount = totalCalls - errorCount;

    return {
        totalCalls,
        totalTokens:  totals._sum.totalTokens    ?? 0,
        avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
        errorCount,
        successCount,
        errorRate:    totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
        totalCostUsd: totals._sum.costEstimateUsd ?? 0,
        byEndpoint: byEndpoint.map((row: {
            endpoint: string | null;
            _count: { id: number };
            _sum: { totalTokens: number | null; costEstimateUsd: number | null };
            _avg: { latencyMs: number | null };
        }) => ({
            endpoint:     row.endpoint ?? "(unknown)",
            calls:        row._count.id,
            tokens:       row._sum.totalTokens    ?? 0,
            avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
            costUsd:      row._sum.costEstimateUsd ?? 0,
        })),
        byProvider: byProvider.map((row: {
            provider: string;
            _count: { id: number };
            _sum: { totalTokens: number | null; costEstimateUsd: number | null };
            _avg: { latencyMs: number | null };
        }) => ({
            provider:     row.provider,
            calls:        row._count.id,
            tokens:       row._sum.totalTokens    ?? 0,
            avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
            costUsd:      row._sum.costEstimateUsd ?? 0,
        })),
    };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number): string  { return n.toLocaleString("en-US"); }
function fmtCost(n: number): string { return `$${n.toFixed(4)}`; }
function fmtPct(n: number): string  { return `${n.toFixed(2)}%`; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false }: {
    label: string; value: string; sub?: string; accent?: boolean;
}) {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
            <p className={`text-3xl font-black tracking-tight ${accent ? "text-[#10B981]" : "text-white"}`}>
                {value}
            </p>
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
                            <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={head.length} className="px-4 py-8 text-center text-xs text-slate-600">
                                No data yet.
                            </td>
                        </tr>
                    ) : rows.map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                            {row.map((cell, j) => (
                                <td key={j} className={`px-4 py-3 ${j === 0 ? "font-mono text-slate-200 text-xs" : "text-slate-400 text-right tabular-nums"}`}>
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AiMetricsPage() {
    const m = await getMetrics();

    const endpointRows = m.byEndpoint.map((r) => [r.endpoint, fmt(r.calls), fmt(r.tokens), `${r.avgLatencyMs} ms`, fmtCost(r.costUsd)]);
    const providerRows = m.byProvider.map((r) => [r.provider,  fmt(r.calls), fmt(r.tokens), `${r.avgLatencyMs} ms`, fmtCost(r.costUsd)]);

    return (
        <div className="px-8 py-8 space-y-10 max-w-6xl">
            {/* Title */}
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">AI Metrics</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Aggregated from <code className="font-mono text-slate-400">ai_usage_logs</code> · {new Date().toUTCString()}
                </p>
            </div>

            {/* Stat grid */}
            <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Overview</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard label="Total AI Calls"  value={fmt(m.totalCalls)}   sub={`${fmt(m.successCount)} succeeded`} />
                    <StatCard label="Total Tokens"    value={fmt(m.totalTokens)}  />
                    <StatCard label="Avg Latency"     value={`${fmt(m.avgLatencyMs)} ms`} />
                    <StatCard label="Error Rate"      value={fmtPct(m.errorRate)} sub={`${fmt(m.errorCount)} failed calls`} accent={m.errorRate > 5} />
                    <StatCard label="Cost Estimate"   value={fmtCost(m.totalCostUsd)} sub="sum of costEstimateUsd" accent />
                    <StatCard label="Success Rate"    value={fmtPct(m.totalCalls > 0 ? (m.successCount / m.totalCalls) * 100 : 0)} sub={`${fmt(m.successCount)} / ${fmt(m.totalCalls)}`} />
                </div>
            </section>

            {/* By endpoint */}
            <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Calls by Endpoint</p>
                <DataTable head={["Endpoint", "Calls", "Tokens", "Avg Latency", "Cost"]} rows={endpointRows} />
            </section>

            {/* By provider */}
            <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Calls by Provider</p>
                <DataTable head={["Provider", "Calls", "Tokens", "Avg Latency", "Cost"]} rows={providerRows} />
            </section>

            <p className="text-[10px] text-slate-700 pb-4">
                Errors approximated as calls returning 0 tokens.
            </p>
        </div>
    );
}
