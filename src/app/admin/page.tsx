/**
 * /admin — Overview dashboard
 *
 * Server component — auth handled by layout.
 * Queries the DB directly for aggregate stats.
 */

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, Activity, UserPlus, MapPin, Zap, DollarSign, MessageSquare, Layers } from "lucide-react";

// ─── Data layer ───────────────────────────────────────────────────────────────

async function getOverview() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        activeUsers7d,
        newUsers7d,
        usersByRole,
        totalTrips,
        topDestinations,
        recentUsers,
        aiAggregate,
        aiLast7d,
        totalChats,
        totalItineraries,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
        prisma.trip.count(),
        prisma.trip.groupBy({
            by: ["destination"],
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 8,
        }),
        prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            take: 7,
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        }),
        prisma.aiUsageLog.aggregate({
            _count: { id: true },
            _sum: { costEstimateUsd: true, totalTokens: true },
        }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.chatMessage.count(),
        prisma.itinerary.count(),
    ]);

    const roleCounts: Record<string, number> = {};
    for (const r of usersByRole) roleCounts[r.role] = r._count.id;

    return {
        totalUsers,
        activeUsers7d,
        newUsers7d,
        roleCounts,
        totalTrips,
        topDestinations: topDestinations.map((d) => ({
            destination: d.destination,
            count: d._count.id,
        })),
        recentUsers: recentUsers.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            createdAt: u.createdAt.toISOString(),
        })),
        totalAiCalls: aiAggregate._count.id,
        aiLast7d,
        totalTokens: aiAggregate._sum.totalTokens ?? 0,
        totalCostUsd: aiAggregate._sum.costEstimateUsd ?? 0,
        totalChats,
        totalItineraries,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("en-US"); }
function fmtCost(n: number) { return `$${n.toFixed(4)}`; }

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

function StatCard({
    label,
    value,
    sub,
    icon: Icon,
    accent = false,
}: {
    label: string;
    value: string;
    sub?: string;
    icon: React.ComponentType<{ className?: string }>;
    accent?: boolean;
}) {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    {label}
                </p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent ? "bg-[#10B981]/15" : "bg-white/[0.05]"}`}>
                    <Icon className={`w-3.5 h-3.5 ${accent ? "text-[#10B981]" : "text-slate-400"}`} />
                </div>
            </div>
            <p className={`text-3xl font-black tracking-tight ${accent ? "text-[#10B981]" : "text-white"}`}>
                {value}
            </p>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
    const d = await getOverview();

    return (
        <div className="px-8 py-8 space-y-10 max-w-6xl">
            {/* Page title */}
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Overview</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Live snapshot — {new Date().toUTCString()}
                </p>
            </div>

            {/* ── Stat grid ── */}
            <section>
                <SectionHeader title="Key Metrics" />
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard label="Total Users"    value={fmt(d.totalUsers)}       sub={`${fmt(d.newUsers7d)} new this week`}       icon={Users}          />
                    <StatCard label="Active (7d)"    value={fmt(d.activeUsers7d)}    sub="users who logged in"                        icon={Activity}       />
                    <StatCard label="New (7d)"       value={fmt(d.newUsers7d)}       sub="registered this week"                       icon={UserPlus}       />
                    <StatCard label="Total Trips"    value={fmt(d.totalTrips)}       sub={`avg ${d.totalUsers ? (d.totalTrips / d.totalUsers).toFixed(1) : "0"} per user`} icon={MapPin} />
                    <StatCard label="AI Calls"       value={fmt(d.totalAiCalls)}     sub={`${fmt(d.aiLast7d)} this week`}             icon={Zap}    accent />
                    <StatCard label="AI Cost"        value={fmtCost(d.totalCostUsd)} sub={`${fmt(d.totalTokens)} total tokens`}       icon={DollarSign} accent />
                </div>
            </section>

            {/* ── Two-column: recent users + top destinations ── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Signups */}
                <div>
                    <SectionHeader title="Recent Signups" href="/admin/users" linkLabel="Manage users →" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {d.recentUsers.map((u, i) => (
                            <div
                                key={u.id}
                                className={`flex items-center gap-3 px-4 py-3 ${i < d.recentUsers.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                            >
                                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">
                                    {(u.name ?? u.email)[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-medium truncate">{u.name ?? u.email.split("@")[0]}</p>
                                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <RoleBadge role={u.role} />
                                    <span className="text-[10px] text-slate-600">{relativeDate(u.createdAt)}</span>
                                </div>
                            </div>
                        ))}
                        {d.recentUsers.length === 0 && (
                            <p className="px-4 py-6 text-xs text-slate-600 text-center">No users yet.</p>
                        )}
                    </div>
                </div>

                {/* Top Destinations */}
                <div>
                    <SectionHeader title="Top Destinations" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {d.topDestinations.map((dest, i) => (
                            <div
                                key={dest.destination}
                                className={`flex items-center gap-3 px-4 py-3 ${i < d.topDestinations.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                            >
                                <span className="text-[11px] font-bold text-slate-600 w-5 text-right">#{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{dest.destination}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div
                                        className="h-1.5 rounded-full bg-[#10B981]/60"
                                        style={{ width: `${Math.max(24, (dest.count / (d.topDestinations[0]?.count ?? 1)) * 80)}px` }}
                                    />
                                    <span className="text-xs text-slate-400 tabular-nums w-6 text-right">{dest.count}</span>
                                </div>
                            </div>
                        ))}
                        {d.topDestinations.length === 0 && (
                            <p className="px-4 py-6 text-xs text-slate-600 text-center">No trips yet.</p>
                        )}
                    </div>
                </div>
            </section>

            {/* ── Two-column: role breakdown + system stats ── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                {/* Users by role */}
                <div>
                    <SectionHeader title="Users by Role" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {(["USER", "MODERATOR", "ADMIN"] as const).map((role, i, arr) => (
                            <div
                                key={role}
                                className={`flex items-center gap-3 px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                            >
                                <RoleBadge role={role} />
                                <div className="flex-1">
                                    <div
                                        className="h-1 rounded-full bg-white/[0.06]"
                                    >
                                        <div
                                            className="h-1 rounded-full bg-[#10B981]/50 transition-all"
                                            style={{ width: `${d.totalUsers > 0 ? ((d.roleCounts[role] ?? 0) / d.totalUsers) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                                <span className="text-sm tabular-nums text-white font-medium w-8 text-right">
                                    {fmt(d.roleCounts[role] ?? 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System stats */}
                <div>
                    <SectionHeader title="System at a Glance" />
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                        {[
                            { icon: MessageSquare, label: "Chat messages",         value: fmt(d.totalChats)        },
                            { icon: Layers,        label: "Itineraries generated", value: fmt(d.totalItineraries)  },
                            { icon: Zap,           label: "AI calls (all-time)",   value: fmt(d.totalAiCalls)      },
                            { icon: MapPin,        label: "Trips created",         value: fmt(d.totalTrips)        },
                        ].map(({ icon: Icon, label, value }, i, arr) => (
                            <div
                                key={label}
                                className={`flex items-center gap-3 px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                            >
                                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                                    <Icon className="w-3.5 h-3.5 text-slate-500" />
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
