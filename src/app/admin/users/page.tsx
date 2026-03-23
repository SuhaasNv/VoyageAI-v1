/**
 * /admin/users — User management
 *
 * Server component — auth handled by parent layout.
 * Fetches users with trip counts, passes to interactive client table.
 * Always server-rendered on demand.
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { UserTable } from "./_table";
import { Users, ShieldCheck, Activity, MapPin } from "lucide-react";
import { SkeletonTable } from "../_skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawPrismaUser = {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
    lastLoginAt: Date | null;
    isActive: boolean;
    _count: { trips: number };
};

type AdminUser = {
    id: string;
    email: string;
    name: string | null;
    role: "USER" | "ADMIN" | "MODERATOR";
    createdAt: string;
    lastLoginAt: string | null;
    isActive: boolean;
    tripCount: number;
};

type GetUsersResult = {
    users: AdminUser[];
    stats: {
        total: number;
        adminCount: number;
        modCount: number;
        activeCount: number;
        noTripsCount: number;
    };
};

// ─── Data layer ───────────────────────────────────────────────────────────────

async function getUsers(): Promise<GetUsersResult> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [usersRaw, activeCount, noTripsCount] = await Promise.all([
        prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                lastLoginAt: true,
                isActive: true,
                _count: { select: { trips: true } },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { trips: { none: {} } } }),
    ]);

    const users: AdminUser[] = usersRaw.map((u: RawPrismaUser): AdminUser => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as "USER" | "ADMIN" | "MODERATOR",
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        isActive: u.isActive,
        tripCount: u._count.trips,
    }));

    const adminCount = users.filter((u) => u.role === "ADMIN").length;
    const modCount = users.filter((u) => u.role === "MODERATOR").length;

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

async function UsersContent() {
    const caller = await requireAdmin();
    const { users, stats } = await getUsers();

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-6">
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Users</h1>
                <p className="text-sm text-slate-500 mt-0.5">Manage accounts, roles, and access</p>
            </div>

            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6 sm:col-span-3"><StripCard icon={Users}       label="Total users"  value={stats.total} /></div>
                <div className="col-span-6 sm:col-span-3"><StripCard icon={ShieldCheck} label="Admins"       value={stats.adminCount} /></div>
                <div className="col-span-6 sm:col-span-3"><StripCard icon={Activity}    label="Active (7d)"  value={stats.activeCount} /></div>
                <div className="col-span-6 sm:col-span-3"><StripCard icon={MapPin}      label="No trips yet" value={stats.noTripsCount} /></div>
            </div>

            <UserTable users={users} currentUserId={caller.sub} />
        </div>
    );
}

export default function UsersPage() {
    return (
        <Suspense fallback={
            <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-6">
                <div className="h-7 w-32 rounded bg-white/[0.06] animate-pulse" />
                <div className="grid grid-cols-12 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="col-span-6 sm:col-span-3 h-20 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />)}
                </div>
                <SkeletonTable rows={8} />
            </div>
        }>
            <UsersContent />
        </Suspense>
    );
}
