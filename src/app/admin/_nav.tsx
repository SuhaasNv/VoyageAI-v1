"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    BarChart2,
    LogOut,
    Shield,
    Bot,
    HardDrive,
    ScrollText,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

const NAV_LINKS = [
    { href: "/admin",            icon: LayoutDashboard, label: "Overview"   },
    { href: "/admin/users",      icon: Users,           label: "Users"      },
    { href: "/admin/ai-metrics", icon: BarChart2,       label: "AI Metrics" },
    { href: "/admin/agents",     icon: Bot,             label: "Agents"     },
    { href: "/admin/logs",       icon: ScrollText,      label: "Logs"       },
    { href: "/admin/cache",      icon: HardDrive,       label: "Cache"      },
];

interface AdminNavProps { email: string }

export default function AdminNav({ email }: AdminNavProps) {
    const pathname  = usePathname();
    const { logout } = useAuthStore();
    const [collapsed, setCollapsed] = React.useState(false);
    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

    // Persist collapse state across sessions
    React.useEffect(() => {
        const saved = localStorage.getItem("admin-nav-collapsed");
        if (saved === "true") setCollapsed(true);
    }, []);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem("admin-nav-collapsed", String(next));
    };

    const handleSignOut = () => {
        setIsLoggingOut(true);
        logout();
        window.location.href = "/login";
    };

    return (
        <aside
            className={`relative shrink-0 flex flex-col border-r border-white/[0.06] bg-[#060A0F] transition-all duration-300 ease-in-out ${
                collapsed ? "w-[58px]" : "w-52"
            }`}
        >
            {/* Brand */}
            <div className={`px-4 pt-5 pb-4 border-b border-white/[0.06] flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
                <div className="w-6 h-6 rounded-md bg-[#10B981]/20 flex items-center justify-center shrink-0">
                    <Shield className="w-3.5 h-3.5 text-[#10B981]" />
                </div>
                {!collapsed && (
                    <div className="min-w-0 flex-1 overflow-hidden">
                        <span className="block text-[11px] font-bold uppercase tracking-widest text-[#10B981] truncate">
                            Admin Panel
                        </span>
                        <p className="text-[10px] text-slate-600 font-mono truncate">{email}</p>
                    </div>
                )}
            </div>

            {/* Nav links */}
            <nav className="flex-1 py-3 px-2 space-y-0.5">
                {NAV_LINKS.map(({ href, icon: Icon, label }) => {
                    const isActive =
                        href === "/admin"
                            ? pathname === "/admin"
                            : (pathname?.startsWith(href) ?? false);

                    return (
                        <Link
                            key={href}
                            href={href}
                            title={collapsed ? label : undefined}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                                collapsed ? "justify-center" : ""
                            } ${
                                isActive
                                    ? "bg-[#10B981]/10 text-[#10B981]"
                                    : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {!collapsed && <span>{label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer: sign out */}
            <div className={`px-3 pb-4 pt-3 border-t border-white/[0.06] ${collapsed ? "flex justify-center" : ""}`}>
                <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isLoggingOut}
                    title={collapsed ? "Sign out" : undefined}
                    className={`flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                        collapsed ? "justify-center" : "w-full text-left"
                    }`}
                >
                    {isLoggingOut ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-500/30 border-t-slate-400 rounded-full animate-spin" />
                    ) : (
                        <LogOut className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {!collapsed && (isLoggingOut ? "Signing out…" : "Sign out")}
                </button>
            </div>

            {/* Collapse toggle — pinned to right edge */}
            <button
                type="button"
                onClick={toggle}
                className="absolute -right-3 top-[72px] z-10 w-6 h-6 rounded-full bg-[#0F1722] border border-white/[0.1] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors shadow-lg"
            >
                {collapsed ? (
                    <ChevronRight className="w-3 h-3" />
                ) : (
                    <ChevronLeft className="w-3 h-3" />
                )}
            </button>
        </aside>
    );
}
