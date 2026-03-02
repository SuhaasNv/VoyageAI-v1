/**
 * /admin/users — User management
 *
 * Server component — auth handled by parent layout.
 * Fetches users with trip counts, passes to interactive client table.
 */

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { UserTable } from "./_table";
import { Users, ShieldCheck, Activity, MapPin } from "lucide-react";

// ─── Data layer ───────────────────────────────────────────────────────────────

async function getUsers() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [usersRaw, activeCount, noTripsCount] = await Promise.all([
        prisma.user.findMany({
            select: {
                id:          true,
                email:       true,
                name:        true,
                role:        true,
                createdAt:   true,
                lastLoginAt: true,
                isActive:    true,
                _count: { select: { trips: true } },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { trips: { none: {} } } }),
    ]);

    const users = usersRaw.map((u) => ({
        id:          u.id,
        email:       u.email,
        name:        u.name,
        role:        u.role as "USER" | "ADMIN" | "MODERATOR",
        createdAt:   u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        isActive:    u.isActive,
        tripCount:   u._count.trips,
    }));

    const adminCount = users.filter((u) => u.role === "ADMIN").length;
    const modCount   = users.filter((u) => u.role === "MODERATOR").length;

    return { users, stats: { total: users.length, adminCount, modCount, activeCount, noTripsCount } };
}

// ─── Stat strip ───────────────────────────────────────────────────────────────

function StripCard({ icon: Icon, label, value }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
}) {
    return (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-slate-400" />
            </div>
            <div>
                <p className="text-xl font-black text-white tabular-nums">{value.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UsersPage() {
    // Get current user id so the table can prevent self-deletion / self-demote.
    // Layout already verified admin status, so this call is fast (cookie already read).
    const caller = await requireAdmin();

    const { users, stats } = await getUsers();

    return (
        <div className="px-8 py-8 space-y-8 max-w-6xl">
            {/* Page title */}
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Users</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Manage accounts, roles, and access
                </p>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StripCard icon={Users}       label="Total users"   value={stats.total}       />
                <StripCard icon={ShieldCheck} label="Admins"        value={stats.adminCount}   />
                <StripCard icon={Activity}    label="Active (7d)"   value={stats.activeCount}  />
                <StripCard icon={MapPin}      label="No trips yet"  value={stats.noTripsCount} />
            </div>

            {/* Interactive table */}
            <UserTable users={users} currentUserId={caller.sub} />
        </div>
    );
}
