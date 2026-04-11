"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, RefreshCw } from "lucide-react";
import type { LogEntry } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function absDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

// ─── Layer tag ────────────────────────────────────────────────────────────────

const LAYER_CFG: Record<LogEntry["layer"], { label: string; style: string; dot: string }> = {
    auth:   { label: "auth",   style: "border-[#6366F1]/25 bg-[#6366F1]/10 text-[#818CF8]",  dot: "bg-[#818CF8]" },
    ai:     { label: "ai",     style: "border-[#10B981]/25 bg-[#10B981]/10 text-[#10B981]",  dot: "bg-[#10B981]" },
    system: { label: "system", style: "border-amber-500/25 bg-amber-500/10 text-amber-400",  dot: "bg-amber-400" },
};

function LayerTag({ layer }: { layer: LogEntry["layer"] }) {
    const cfg = LAYER_CFG[layer] ?? LAYER_CFG.system;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${cfg.style}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function ActionBadge({ action }: { action: string }) {
    const isError  = action.includes("ERROR") || action.includes("FAIL");
    const isSignin = action === "LOGIN" || action === "REGISTER";
    const cls = isError
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : isSignin
            ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20"
            : "text-slate-400 bg-white/[0.04] border-white/[0.08]";
    return (
        <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${cls}`}>{action}</span>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: LogEntry }) {
    const [expanded, setExpanded] = useState(false);
    let parsedMeta: Record<string, unknown> = {};
    try { parsedMeta = JSON.parse(log.meta); } catch { /* ok */ }

    return (
        <>
            <tr
                onClick={() => setExpanded((e) => !e)}
                className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
            >
                <td className="px-4 py-2.5 text-[11px] text-slate-500 tabular-nums whitespace-nowrap" title={absDate(log.ts)}>
                    {relDate(log.ts)}
                </td>
                <td className="px-4 py-2.5">
                    <LayerTag layer={log.layer} />
                </td>
                <td className="px-4 py-2.5">
                    <ActionBadge action={log.action} />
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[180px]">
                    {log.email ?? log.requestId?.slice(-8) ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-slate-600 truncate max-w-[260px] hidden md:table-cell font-mono">
                    {Object.entries(parsedMeta).map(([k, v]) => `${k}=${v}`).join(" · ")}
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-white/[0.04]">
                    <td colSpan={5} className="px-4 pb-3">
                        <pre className="text-[11px] text-slate-400 bg-black/20 rounded-lg p-3 font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify({ id: log.id, ts: log.ts, layer: log.layer, action: log.action, email: log.email, requestId: log.requestId, ...parsedMeta }, null, 2)}
                        </pre>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Main client ──────────────────────────────────────────────────────────────

const LAYERS = [
    { value: "all",  label: "All"  },
    { value: "auth", label: "Auth" },
    { value: "ai",   label: "AI"   },
] as const;

export default function LogsClient({ logs, initialLayer }: { logs: LogEntry[]; initialLayer: string }) {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch]   = useState("");
    const [layer, setLayer]     = useState(initialLayer);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return logs.filter((l) => {
            const matchLayer  = layer === "all" || l.layer === layer;
            const matchSearch = !q || l.action.toLowerCase().includes(q) || (l.email?.toLowerCase().includes(q) ?? false) || (l.requestId?.includes(q) ?? false) || l.meta.includes(q);
            return matchLayer && matchSearch;
        });
    }, [logs, layer, search]);

    const handleLayerChange = (v: string) => {
        setLayer(v);
        const p = new URLSearchParams(searchParams.toString());
        p.set("layer", v);
        router.push(`?${p.toString()}`);
    };

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Logs</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Recent auth and AI activity · up to 200 entries</p>
                </div>
                <button
                    onClick={() => router.refresh()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-white/[0.08] hover:border-white/[0.14] hover:text-slate-200 transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                </button>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Layer tabs */}
                <div className="flex items-center bg-white/[0.03] border border-white/[0.08] rounded-lg p-0.5">
                    {LAYERS.map((l) => (
                        <button
                            key={l.value}
                            onClick={() => handleLayerChange(l.value)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                                layer === l.value
                                    ? "bg-[#10B981]/15 text-[#10B981]"
                                    : "text-slate-500 hover:text-slate-300"
                            }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter by action, email, requestId…"
                        className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#10B981]/40 transition-colors"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <span className="text-xs text-slate-600 ml-auto">{filtered.length} entries</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/[0.08] pb-8">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 w-24">When</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 w-20">Layer</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 w-32">Action</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">Identity</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 hidden md:table-cell">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-slate-600">No log entries match your filters.</td></tr>
                        ) : (
                            filtered.map((l) => <LogRow key={l.id} log={l} />)
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
