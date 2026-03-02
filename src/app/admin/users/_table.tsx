"use client";

import { useState, useTransition, useMemo } from "react";
import { Trash2, ChevronDown, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import { deleteUser, updateUserRole } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRow = {
    id: string;
    email: string;
    name: string | null;
    role: "USER" | "ADMIN" | "MODERATOR";
    createdAt: string;       // ISO
    lastLoginAt: string | null; // ISO
    isActive: boolean;
    tripCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string | null): string {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ROLE_STYLES: Record<string, string> = {
    ADMIN:     "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25",
    MODERATOR: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    USER:      "bg-white/[0.05] text-slate-400 border border-white/[0.08]",
};

const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin",
    MODERATOR: "Mod",
    USER: "User",
};

function RoleBadge({ role }: { role: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${ROLE_STYLES[role] ?? ROLE_STYLES.USER}`}>
            {ROLE_LABELS[role] ?? role}
        </span>
    );
}

function Avatar({ name, email }: { name: string | null; email: string }) {
    const initials = (name ?? email).slice(0, 2).toUpperCase();
    const hue = email.charCodeAt(0) * 15 % 360;
    return (
        <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: `hsl(${hue} 30% 20%)`, color: `hsl(${hue} 60% 70%)` }}
        >
            {initials}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UserTable({ users: initialUsers, currentUserId }: { users: UserRow[]; currentUserId: string }) {
    const [users, setUsers] = useState(initialUsers);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<"ALL" | "USER" | "ADMIN" | "MODERATOR">("ALL");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return users.filter((u) => {
            const matchSearch = !q || u.email.toLowerCase().includes(q) || (u.name?.toLowerCase().includes(q) ?? false);
            const matchRole = roleFilter === "ALL" || u.role === roleFilter;
            return matchSearch && matchRole;
        });
    }, [users, search, roleFilter]);

    function clearError() { setErrorMsg(null); }

    function handleDelete(userId: string) {
        if (confirmDeleteId !== userId) {
            setConfirmDeleteId(userId);
            return;
        }
        setPendingId(userId);
        startTransition(async () => {
            const result = await deleteUser(userId);
            if (result.ok) {
                setUsers((prev) => prev.filter((u) => u.id !== userId));
                setConfirmDeleteId(null);
            } else {
                setErrorMsg(result.error ?? "Delete failed.");
            }
            setPendingId(null);
        });
    }

    function handleRoleChange(userId: string, role: "USER" | "ADMIN" | "MODERATOR") {
        setPendingId(userId);
        startTransition(async () => {
            const result = await updateUserRole(userId, role);
            if (result.ok) {
                setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
            } else {
                setErrorMsg(result.error ?? "Role update failed.");
            }
            setPendingId(null);
        });
    }

    return (
        <div className="space-y-4">
            {/* Error banner */}
            {errorMsg && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{errorMsg}</span>
                    <button onClick={clearError}><X className="w-4 h-4 hover:text-red-300" /></button>
                </div>
            )}

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or email…"
                        className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#10B981]/40 transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
                <div className="relative">
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                        className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 focus:outline-none focus:border-[#10B981]/40 cursor-pointer transition-colors"
                    >
                        <option value="ALL">All roles</option>
                        <option value="USER">User</option>
                        <option value="MODERATOR">Moderator</option>
                        <option value="ADMIN">Admin</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-xs text-slate-600 ml-auto">
                    {filtered.length} of {users.length} users
                </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">User</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">Role</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">Trips</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 hidden md:table-cell">Joined</th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 hidden lg:table-cell">Last seen</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-600">
                                    No users match your filters.
                                </td>
                            </tr>
                        )}
                        {filtered.map((user) => {
                            const isLoading = isPending && pendingId === user.id;
                            const isConfirming = confirmDeleteId === user.id;
                            const isSelf = user.id === currentUserId;

                            return (
                                <tr
                                    key={user.id}
                                    className={`border-b border-white/[0.04] last:border-0 transition-colors ${
                                        isConfirming ? "bg-red-500/5" : "hover:bg-white/[0.015]"
                                    } ${isLoading ? "opacity-50" : ""}`}
                                >
                                    {/* User identity */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={user.name} email={user.email} />
                                            <div className="min-w-0">
                                                <p className="text-sm text-white font-medium truncate max-w-[160px]">
                                                    {user.name ?? <span className="text-slate-500">—</span>}
                                                    {isSelf && <span className="ml-1.5 text-[10px] text-[#10B981] font-bold">(you)</span>}
                                                </p>
                                                <p className="text-xs text-slate-500 truncate max-w-[200px]">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Role */}
                                    <td className="px-4 py-3">
                                        {isConfirming ? (
                                            <RoleBadge role={user.role} />
                                        ) : (
                                            <div className="relative inline-block">
                                                <select
                                                    value={user.role}
                                                    disabled={isLoading || isSelf}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value as "USER" | "ADMIN" | "MODERATOR")}
                                                    className={`appearance-none text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border pr-6 cursor-pointer focus:outline-none transition-colors ${
                                                        ROLE_STYLES[user.role] ?? ROLE_STYLES.USER
                                                    } ${isSelf ? "cursor-not-allowed opacity-50" : "hover:opacity-80"} bg-transparent`}
                                                >
                                                    <option value="USER">User</option>
                                                    <option value="MODERATOR">Moderator</option>
                                                    <option value="ADMIN">Admin</option>
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 opacity-60" />
                                            </div>
                                        )}
                                    </td>

                                    {/* Trips */}
                                    <td className="px-4 py-3 text-right">
                                        <span className="text-sm text-slate-300 tabular-nums font-medium">
                                            {user.tripCount}
                                        </span>
                                    </td>

                                    {/* Joined */}
                                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                                        {relativeDate(user.createdAt)}
                                    </td>

                                    {/* Last seen */}
                                    <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                                        {relativeDate(user.lastLoginAt)}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            {isLoading ? (
                                                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                                            ) : isConfirming ? (
                                                <>
                                                    <button
                                                        onClick={() => handleDelete(user.id)}
                                                        className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    disabled={isSelf}
                                                    title={isSelf ? "Cannot delete your own account" : "Delete user"}
                                                    className={`p-1.5 rounded-lg transition-colors ${
                                                        isSelf
                                                            ? "text-slate-700 cursor-not-allowed"
                                                            : "text-slate-600 hover:text-red-400 hover:bg-red-500/10"
                                                    }`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
