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
    Lightbulb,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

const NAV_LINKS = [
    { href: "/admin",            icon: LayoutDashboard, label: "Overview"   },
    { href: "/admin/users",      icon: Users,           label: "Users"      },
    { href: "/admin/ai-metrics", icon: BarChart2,       label: "AI Metrics" },
    { href: "/admin/agents",     icon: Bot,             label: "Agents"     },
    { href: "/admin/logs",         icon: ScrollText,  label: "Logs"          },
    { href: "/admin/explanations", icon: Lightbulb,   label: "Explainability"},
    { href: "/admin/cache",        icon: HardDrive,   label: "Cache"         },
];

interface AdminNavProps { email: string }

export default function AdminNav({ email }: AdminNavProps) {
    const pathname  = usePathname();
    const { logout } = useAuthStore();
    const [collapsed, setCollapsed] = React.useState(false);
    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

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
            className={`shrink-0 flex flex-col border-r border-white/[0.06] bg-[#060A0F] transition-[width] duration-300 ease-in-out ${
                collapsed ? "w-[58px]" : "w-52"
            }`}
        >
            {/* Brand + collapse (header row) */}
            <div
                className={
                    collapsed
                        ? "flex flex-col items-center gap-2 px-2 pt-4 pb-3 border-b border-white/[0.06] shrink-0"
                        : "flex items-center justify-between gap-2 pl-3 pr-2 pt-4 pb-3 border-b border-white/[0.06] shrink-0"
                }
            >
                <div className={`flex items-center gap-2 min-w-0 ${collapsed ? "" : "flex-1"}`}>
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

                <button
                    type="button"
                    onClick={toggle}
                    aria-label="Toggle sidebar"
                    aria-expanded={!collapsed}
                    className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060A0F]"
                >
                    <ChevronLeft
                        className={`w-4 h-4 transition-transform duration-300 ease-in-out ${collapsed ? "rotate-180" : ""}`}
                        aria-hidden
                    />
                </button>
            </div>

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
        </aside>
    );
}
