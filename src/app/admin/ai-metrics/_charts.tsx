"use client";

import React from "react";

// ─── Inline SVG helpers ───────────────────────────────────────────────────────

export interface DailyBucket {
    label: string;   // "Mar 20"
    calls: number;
    tokens: number;
    costUsd: number;
}

function normalize(values: number[]): number[] {
    const max = Math.max(...values, 1);
    return values.map((v) => v / max);
}

// Mini sparkline bar chart
export function CallsBarChart({ data }: { data: DailyBucket[] }) {
    const maxCalls = Math.max(...data.map((d) => d.calls), 1);
    return (
        <div className="flex items-end gap-1 h-24">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="relative w-full">
                        <div
                            className="w-full rounded-sm bg-[#10B981]/60 group-hover:bg-[#10B981] transition-colors"
                            style={{ height: `${Math.max(2, (d.calls / maxCalls) * 80)}px` }}
                        />
                        {/* tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-[#0F1722] border border-white/[0.1] text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            {d.label}: {d.calls} calls
                        </div>
                    </div>
                    <span className="text-[9px] text-slate-600 rotate-45 origin-left">{d.label.split(" ")[1]}</span>
                </div>
            ))}
        </div>
    );
}

// SVG line chart
export function CostLineChart({ data }: { data: DailyBucket[] }) {
    const W = 600; const H = 80; const PAD = 8;
    const costs = data.map((d) => d.costUsd);
    const norm = normalize(costs);
    const pts = norm.map((v, i) => {
        const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
        const y = PAD + (1 - v) * (H - PAD * 2);
        return `${x},${y}`;
    });
    const polyline = pts.join(" ");
    const area = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 overflow-visible">
            <defs>
                <linearGradient id="cost-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill="url(#cost-gradient)" />
            <polyline points={polyline} fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinejoin="round" />
            {data.map((d, i) => {
                const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
                const y = PAD + (1 - norm[i]) * (H - PAD * 2);
                return (
                    <g key={i} className="group">
                        <circle cx={x} cy={y} r="3" fill="#10B981" opacity="0.8" />
                        <title>{d.label}: ${d.costUsd.toFixed(4)}</title>
                    </g>
                );
            })}
        </svg>
    );
}

// Provider donut
export function ProviderDonut({ data }: { data: { provider: string; calls: number }[] }) {
    const total = data.reduce((s, d) => s + d.calls, 0) || 1;
    const COLORS = ["#10B981", "#6366F1", "#F59E0B", "#EF4444", "#06B6D4"];
    const R = 36; const CX = 50; const CY = 50; const strokeW = 14;
    const circumference = 2 * Math.PI * R;

    let offset = 0;
    const slices = data.map((d, i) => {
        const pct = d.calls / total;
        const dashLen = pct * circumference;
        const slice = { ...d, pct, dashLen, offset, color: COLORS[i % COLORS.length] };
        offset += dashLen;
        return slice;
    });

    return (
        <div className="flex items-center gap-6">
            <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0 -rotate-90">
                {slices.map((s, i) => (
                    <circle
                        key={i}
                        cx={CX} cy={CY} r={R}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={strokeW}
                        strokeDasharray={`${s.dashLen} ${circumference - s.dashLen}`}
                        strokeDashoffset={-s.offset}
                    />
                ))}
            </svg>
            <div className="space-y-2">
                {slices.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs text-slate-300">{s.provider}</span>
                        <span className="text-xs text-slate-500 tabular-nums ml-auto pl-4">
                            {(s.pct * 100).toFixed(1)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Tokens area chart
export function TokensAreaChart({ data }: { data: DailyBucket[] }) {
    const W = 600; const H = 80; const PAD = 8;
    const vals = data.map((d) => d.tokens);
    const norm = normalize(vals);
    const pts = norm.map((v, i) => {
        const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
        const y = PAD + (1 - v) * (H - PAD * 2);
        return `${x},${y}`;
    });
    const area = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 overflow-visible">
            <defs>
                <linearGradient id="token-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill="url(#token-gradient)" />
            <polyline points={pts.join(" ")} fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
}
