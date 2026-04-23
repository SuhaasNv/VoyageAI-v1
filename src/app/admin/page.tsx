/**
 * /admin — Intelligence Dashboard Overview
 * Server component — queries DB directly. force-dynamic for live data.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";
import Link from "next/link";
import {
    Users, Activity, UserPlus, MapPin, Zap, DollarSign,
    MessageSquare, Layers, Cpu, Clock, AlertTriangle, TrendingUp,
} from "lucide-react";
import { SkeletonCard, SkeletonRow } from "./_skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type TopDestination = { destination: string; count: number };
type RecentUser = {
    id: string; email: string; name: string | null;
    role: string; createdAt: string;
};
type Overview = {
    totalUsers: number; activeUsers7d: number; newUsers7d: number;
    roleCounts: Record<string, number>; totalTrips: number;
    topDestinations: TopDestination[]; recentUsers: RecentUser[];
    totalAiCalls: number; aiLast7d: number;
    totalTokens: number; totalCostUsd: number;
    totalChats: number; totalItineraries: number;
};
type HealthData = {
    avgLatencyMs5m: number; avgLatencyMs1h: number;
    errorRate5m: number; errorRate1h: number;
    requestsPerMin: number; activeUsers24h: number;
    status: "healthy" | "degraded" | "down";
};

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getOverview(): Promise<Overview> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
        totalUsers, activeUsers7d, newUsers7d, usersByRole, totalTrips,
        topDestinationsRaw, recentUsersRaw, aiAggregate, aiLast7d,
        totalChats, totalItineraries,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
        prisma.trip.count(),
        prisma.trip.groupBy({ by: ["destination"], _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 7, select: { id: true, email: true, name: true, role: true, createdAt: true } }),
        prisma.aiUsageLog.aggregate({ _count: { id: true }, _sum: { costEstimateUsd: true, totalTokens: true } }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.chatMessage.count(),
        prisma.itinerary.count(),
    ]);

    const roleCounts: Record<string, number> = {};
    for (const r of usersByRole) roleCounts[r.role] = r._count.id;

    return {
        totalUsers, activeUsers7d, newUsers7d, roleCounts, totalTrips,
        topDestinations: topDestinationsRaw.map((r) => ({ destination: r.destination, count: r._count.id })),
        recentUsers: recentUsersRaw.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
        totalAiCalls: aiAggregate._count.id,
        aiLast7d,
        totalTokens: aiAggregate._sum.totalTokens ?? 0,
        totalCostUsd: aiAggregate._sum.costEstimateUsd ?? 0,
        totalChats, totalItineraries,
    };
}

async function getHealth(): Promise<HealthData> {
    const now = Date.now();
    const fiveMinAgo  = new Date(now - 5 * 60 * 1000);
    const oneHourAgo  = new Date(now - 60 * 60 * 1000);
    const twentyFourH = new Date(now - 24 * 60 * 60 * 1000);

    const [stats5m, stats1h, errors5m, errors1h, count5m, count1h, activeUsers] = await Promise.all([
        prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: fiveMinAgo } }, _avg: { latencyMs: true } }),
        prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: oneHourAgo } }, _avg: { latencyMs: true } }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(fiveMinAgo) }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo } } }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: twentyFourH } } }),
    ]);

    const errorRate5m = count5m > 0 ? (errors5m / count5m) * 100 : 0;
    const errorRate1h = count1h > 0 ? (errors1h / count1h) * 100 : 0;
    const avgLatency5m = Math.round(stats5m._avg.latencyMs ?? 0);
    const avgLatency1h = Math.round(stats1h._avg.latencyMs ?? 0);

    let status: HealthData["status"] = "healthy";
    if (errorRate5m > 20 || avgLatency5m > 30_000) status = "down";
    else if (errorRate5m > 5 || avgLatency5m > 10_000) status = "degraded";

    return {
        avgLatencyMs5m: avgLatency5m, avgLatencyMs1h: avgLatency1h,
        errorRate5m: Math.round(errorRate5m * 10) / 10,
        errorRate1h: Math.round(errorRate1h * 10) / 10,
        requestsPerMin: Math.round((count5m / 5) * 10) / 10,
        activeUsers24h: activeUsers, status,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("en-US"); }
function fmtCost(n: number) { return `$${n.toFixed(4)}`; }
function fmtMs(ms: number) {
    if (ms === 0) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
function relativeDate(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent = false }: {
    label: string; value: string; sub?: string;
    icon: React.ComponentType<{ className?: string }>; accent?: boolean;
}) {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-5 hover:border-white/[0.14] hover:bg-white/[0.05] transition-all duration-200">
            <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent ? "bg-[#10B981]/15" : "bg-white/[0.05]"}`}>
                    <Icon className={`w-3.5 h-3.5 ${accent ? "text-[#10B981]" : "text-slate-400"}`} />
                </div>
            </div>
            <p className={`text-3xl font-black tracking-tight ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</p>
            {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
        </div>
    );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
    return (
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
            {href && (
                <Link href={href} className="text-[11px] text-[#10B981] hover:text-[#10B981]/80 transition-colors">
                    {linkLabel ?? "View all →"}
                </Link>
            )}
        </div>
    );
}

const ROLE_STYLES: Record<string, string> = {
    ADMIN:     "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25",
    MODERATOR: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    USER:      "bg-white/[0.05] text-slate-400 border border-white/[0.08]",
};

function RoleBadge({ role }: { role: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${ROLE_STYLES[role] ?? ROLE_STYLES.USER}`}>
            {role === "MODERATOR" ? "Mod" : role.charAt(0) + role.slice(1).toLowerCase()}
        </span>
    );
}

function HealthBadge({ status }: { status: HealthData["status"] }) {
    const cfg = {
        healthy:  { dot: "bg-[#10B981]", text: "text-[#10B981]", label: "Healthy", pulse: "animate-pulse" },
        degraded: { dot: "bg-amber-400", text: "text-amber-400", label: "Degraded", pulse: "animate-pulse" },
        down:     { dot: "bg-red-400",   text: "text-red-400",   label: "Down",     pulse: "" },
    }[status];
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse}`} />
            {cfg.label}
        </span>
    );
}

function HealthCard({ label, value, sub, warn = false }: {
    label: string; value: string; sub?: string; warn?: boolean;
}) {
    return (
        <div className={`rounded-xl border p-4 backdrop-blur-xl transition-all duration-200 hover:border-white/[0.14] ${
            warn ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-white/[0.08] bg-white/[0.03]"
        }`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-black tracking-tight ${warn ? "text-amber-400" : "text-white"}`}>{value}</p>
            {sub && <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function OverviewContent() {
    await requireAdmin();
    const [d, h] = await Promise.all([getOverview(), getHealth()]);

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-8">
            {/* Title */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Admin Overview</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Live snapshot · {new Date().toUTCString()}
                    </p>
                    <p className="text-xs text-slate-500">
                        All metrics are derived from live system data. No simulated values.
                    </p>
                </div>
                <HealthBadge status={h.status} />
            </div>

            {/* ── System Health ── */}
            <section>
                <SectionHeader title="System Health" href="/admin/ai-metrics" linkLabel="AI metrics →" />
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Avg Latency (5m)" value={fmtMs(h.avgLatencyMs5m)} sub="last 5 min" warn={h.avgLatencyMs5m > 10_000} /></div>
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Avg Latency (1h)" value={fmtMs(h.avgLatencyMs1h)} sub="last hour" /></div>
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Error Rate (5m)"  value={`${h.errorRate5m}%`}      sub="failed calls" warn={h.errorRate5m > 5} /></div>
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Error Rate (1h)"  value={`${h.errorRate1h}%`}      sub="last hour" warn={h.errorRate1h > 5} /></div>
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Req / min"        value={String(h.requestsPerMin)} sub="AI requests" /></div>
                    <div className="col-span-6 md:col-span-4 xl:col-span-2"><HealthCard label="Active (24h)"     value={fmt(h.activeUsers24h)}    sub="users logged in" /></div>
                </div>
            </section>

            {/* ── Key Metrics ── */}
            <section>
                <SectionHeader title="Key Metrics" />
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Total Users"  value={fmt(d.totalUsers)}      sub={`${fmt(d.newUsers7d)} new this week`}    icon={Users} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Active (7d)"  value={fmt(d.activeUsers7d)}   sub="users who logged in"                    icon={Activity} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="New (7d)"     value={fmt(d.newUsers7d)}      sub="registered this week"                   icon={UserPlus} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="Total Trips"  value={fmt(d.totalTrips)}      sub={`avg ${d.totalUsers ? (d.totalTrips / d.totalUsers).toFixed(1) : "0"} per user`} icon={MapPin} /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="AI Calls"     value={fmt(d.totalAiCalls)}    sub={`${fmt(d.aiLast7d)} this week`}         icon={Zap}        accent /></div>
                    <div className="col-span-12 md:col-span-6 xl:col-span-4"><StatCard label="AI Cost (Estimated)" value={fmtCost(d.totalCostUsd)} sub={`${fmt(d.totalTokens)} tokens · token×rate · Estimated`}  icon={DollarSign} accent /></div>
                </div>
            </section>

            {/* ── Recent Signups + Top Destinations ── */}
            <section className="grid grid-cols-12 gap-6">
                <div className="col-span-12 xl:col-span-6">
                    <SectionHeader title="Recent Signups" href="/admin/users" linkLabel="Manage users →" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {d.recentUsers.map((u, i) => (
                            <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors ${i < d.recentUsers.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
                                <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">
                                    {(u.name ?? u.email)[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-medium truncate leading-tight">{u.name ?? u.email.split("@")[0]}</p>
                                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <RoleBadge role={u.role} />
                                    <span className="text-[10px] text-slate-600 w-14 text-right">{relativeDate(u.createdAt)}</span>
                                </div>
                            </div>
                        ))}
                        {d.recentUsers.length === 0 && <p className="px-4 py-6 text-xs text-slate-600 text-center">No users yet.</p>}
                    </div>
                </div>

                <div className="col-span-12 xl:col-span-6">
                    <SectionHeader title="Top Destinations" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {d.topDestinations.map((dest, i) => (
                            <div key={dest.destination} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors ${i < d.topDestinations.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
                                <span className="text-[11px] font-bold text-slate-600 w-5 text-right shrink-0">#{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{dest.destination}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="h-1.5 rounded-full bg-[#10B981]/60" style={{ width: `${Math.max(24, (dest.count / (d.topDestinations[0]?.count ?? 1)) * 80)}px` }} />
                                    <span className="text-xs text-slate-400 tabular-nums w-6 text-right">{dest.count}</span>
                                </div>
                            </div>
                        ))}
                        {d.topDestinations.length === 0 && <p className="px-4 py-6 text-xs text-slate-600 text-center">No trips yet.</p>}
                    </div>
                </div>
            </section>

            {/* ── Role breakdown + System stats ── */}
            <section className="grid grid-cols-12 gap-6 pb-8">
                <div className="col-span-12 xl:col-span-6">
                    <SectionHeader title="Users by Role" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {(["USER", "MODERATOR", "ADMIN"] as const).map((role, i, arr) => (
                            <div key={role} className={`flex items-center gap-3 px-4 py-3 ${i < arr.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
                                <RoleBadge role={role} />
                                <div className="flex-1">
                                    <div className="h-1 rounded-full bg-white/[0.06]">
                                        <div className="h-1 rounded-full bg-[#10B981]/50 transition-all" style={{ width: `${d.totalUsers > 0 ? ((d.roleCounts[role] ?? 0) / d.totalUsers) * 100 : 0}%` }} />
                                    </div>
                                </div>
                                <span className="text-sm tabular-nums text-white font-medium w-8 text-right">{fmt(d.roleCounts[role] ?? 0)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="col-span-12 xl:col-span-6">
                    <SectionHeader title="System at a Glance" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {[
                            { icon: MessageSquare, label: "Chat messages",         value: fmt(d.totalChats) },
                            { icon: Layers,        label: "Itineraries generated", value: fmt(d.totalItineraries) },
                            { icon: Zap,           label: "AI calls (all-time)",   value: fmt(d.totalAiCalls) },
                            { icon: MapPin,        label: "Trips created",         value: fmt(d.totalTrips) },
                            { icon: TrendingUp,    label: "AI Cost (Estimated)",  value: fmtCost(d.totalCostUsd) },
                            { icon: Cpu,           label: "Tokens consumed",       value: fmt(d.totalTokens) },
                        ].map(({ icon: Icon, label, value }, i, arr) => (
                            <div key={label} className={`flex items-center gap-3 px-4 py-2.5 ${i < arr.length - 1 ? "border-b border-white/[0.04]" : ""} hover:bg-white/[0.02] transition-colors`}>
                                <div className="w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                                    <Icon className="w-3 h-3 text-slate-500" />
                                </div>
                                <p className="flex-1 text-sm text-slate-400">{label}</p>
                                <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}

function OverviewSkeleton() {
    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-8 animate-pulse">
            <div className="h-7 w-64 rounded bg-white/[0.06]" />
            <div className="grid grid-cols-12 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="col-span-6 md:col-span-4 xl:col-span-2 h-20 rounded-xl bg-white/[0.03] border border-white/[0.06]" />)}
            </div>
            <div className="grid grid-cols-12 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="col-span-12 md:col-span-6 xl:col-span-4 h-24 rounded-xl bg-white/[0.03] border border-white/[0.06]" />)}
            </div>
        </div>
    );
}

export default function AdminOverviewPage() {
    return (
        <Suspense fallback={<OverviewSkeleton />}>
            <OverviewContent />
        </Suspense>
    );
}
