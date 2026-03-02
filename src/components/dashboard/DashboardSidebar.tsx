"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Settings, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuthStore } from "@/stores/authStore";

const STORAGE_KEY = "sidebar-collapsed";

function displayName(name: string | null | undefined, email: string): string {
    if (name?.trim()) return name.trim();
    const local = email.split("@")[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : "User";
}

interface SidebarLinkProps {
    href: string;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    collapsed: boolean;
}

function SidebarLink({ href, icon, label, active, collapsed }: SidebarLinkProps) {
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-200 ease-out text-sm font-medium border ${
                active
                    ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 shadow-[0_0_12px_rgba(16,185,129,0.08)]"
                    : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
            } ${collapsed ? "justify-center" : ""}`}
        >
            <span className="shrink-0">{icon}</span>
            {!collapsed && <span className="truncate">{label}</span>}
        </Link>
    );
}

export function DashboardSidebar() {
    const pathname  = usePathname();
    const { user, logout } = useAuthStore();
    const [collapsed, setCollapsed]     = useState(false);
    const [hydrated,  setHydrated]      = useState(false);
    const [loggingOut, setLoggingOut]   = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (stored === "true") setCollapsed(true);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHydrated(true);
    }, []);

    const toggle = () => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    };

    const handleLogout = () => {
        setLoggingOut(true);
        logout();
        window.location.href = "/login";
    };

    const userName = user ? displayName(user.name, user.email) : "User";
    const initial  = userName.charAt(0).toUpperCase();

    if (!hydrated) {
        return (
            <aside className="hidden md:flex relative z-20 w-64 bg-[#0B0F14] flex-col p-6 border-r border-white/5 shadow-2xl" />
        );
    }

    return (
        <aside
            className={`hidden md:flex relative z-20 ${
                collapsed ? "w-[68px]" : "w-64"
            } bg-[#0B0F14] flex-col justify-between border-r border-white/5 shadow-2xl transition-[width] duration-200 ease-out overflow-visible`}
        >
            {/* Collapse toggle — floats on the right edge */}
            <button
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="absolute -right-3 top-7 z-30 w-6 h-6 rounded-full bg-[#131920] border border-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-white hover:border-white/20 transition-all shadow-md"
            >
                {collapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronLeft  className="w-3 h-3" />
                }
            </button>

            {/* Top section */}
            <div className={`flex flex-col ${collapsed ? "p-3 pt-5" : "p-6"}`}>
                <Link
                    href="/dashboard"
                    className={`flex items-center gap-2 mb-8 text-white hover:opacity-90 transition-opacity ${collapsed ? "justify-center" : ""}`}
                >
                    <Logo size="md" className="shrink-0 text-white" />
                    {!collapsed && (
                        <span className="text-xl font-bold tracking-tight uppercase">VoyageAI</span>
                    )}
                </Link>

                <nav className="space-y-1">
                    <SidebarLink
                        href="/dashboard"
                        icon={<Home className="w-4 h-4" />}
                        label="Dashboard"
                        active={pathname === "/dashboard"}
                        collapsed={collapsed}
                    />
                    <SidebarLink
                        href="/dashboard/settings"
                        icon={<Settings className="w-4 h-4" />}
                        label="Settings"
                        active={pathname?.startsWith("/dashboard/settings") ?? false}
                        collapsed={collapsed}
                    />
                </nav>
            </div>

            {/* Bottom section */}
            <div className={`${collapsed ? "p-3 pb-5 flex flex-col items-center gap-3" : "p-6 space-y-1.5"}`}>
                {collapsed ? (
                    <>
                        {/* Logout icon */}
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            title="Logout"
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
                        >
                            {loggingOut
                                ? <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                : <LogOut className="w-4 h-4" />
                            }
                        </button>

                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden border border-white/10 shrink-0">
                            {user?.image
                                ? <Image src={user.image} alt={userName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                                : initial
                            }
                        </div>
                    </>
                ) : (
                    <>
                        {/* Logout row */}
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium"
                        >
                            {loggingOut
                                ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                : <LogOut className="w-4 h-4" />
                            }
                            {loggingOut ? "Logging out…" : "Logout"}
                        </button>

                        {/* User card */}
                        <div className="mt-5 flex items-center gap-3 pt-5 border-t border-white/[0.06]">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden border border-white/10 shrink-0">
                                {user?.image
                                    ? <Image src={user.image} alt={userName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                                    : initial
                                }
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-zinc-200 truncate">{userName}</span>
                                <span className="text-xs text-slate-500">Free Plan</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}
