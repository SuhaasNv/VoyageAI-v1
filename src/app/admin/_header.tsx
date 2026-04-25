"use client";

import React from "react";
import { Bell, Search, ChevronDown, Settings, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "next/navigation";

interface AdminHeaderProps {
    email: string;
    notificationCount?: number;
}

export default function AdminHeader({ email, notificationCount = 0 }: AdminHeaderProps) {
    const { logout } = useAuthStore();
    const router = useRouter();
    const [dropdownOpen, setDropdownOpen] = React.useState(false);
    const [searchFocused, setSearchFocused] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    React.useEffect(() => {
        function handle(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, []);

    const handleSignOut = () => {
        logout();
        window.location.href = "/";
    };

    const initials = email.slice(0, 2).toUpperCase();
    const hue = email.charCodeAt(0) * 15 % 360;

    const NAV_SEARCH = [
        { label: "Overview",   href: "/admin" },
        { label: "Users",      href: "/admin/users" },
        { label: "AI Metrics", href: "/admin/ai-metrics" },
        { label: "Agents",     href: "/admin/agents" },
        { label: "Logs",       href: "/admin/logs" },
        { label: "Cache",      href: "/admin/cache" },
    ];

    const searchResults = searchQuery
        ? NAV_SEARCH.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : [];

    return (
        <header className="h-12 shrink-0 flex items-center justify-between gap-4 px-6 xl:px-10 border-b border-white/[0.06] bg-[#060A0F]/80 backdrop-blur-xl">
            {/* Search — expands to fill available space */}
            <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search admin pages…"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#10B981]/30 transition-colors"
                />
                {searchFocused && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 w-64 rounded-lg bg-[#0F1722] border border-white/[0.1] shadow-xl z-50 overflow-hidden">
                        {searchResults.map((r) => (
                            <button
                                key={r.href}
                                onMouseDown={() => { router.push(r.href); setSearchQuery(""); }}
                                className="flex items-center w-full px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05] text-left"
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Data provenance badge — visible on every admin page */}
            <span
                title="Every metric is read from the live database (Prisma). No simulated or hardcoded values."
                className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#10B981]/[0.08] border border-[#10B981]/20 text-[10px] font-medium text-[#10B981]/70 shrink-0 select-none"
            >
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block" />
                Live DB data
            </span>

            {/* Right-side actions */}
            <div className="flex items-center gap-2 shrink-0">

            {/* Notification bell */}
            <button
                type="button"
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
            >
                <Bell className="w-4 h-4" />
                {notificationCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#10B981]" />
                )}
            </button>

            {/* Admin avatar + dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                    <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: `hsl(${hue} 30% 20%)`, color: `hsl(${hue} 60% 70%)` }}
                    >
                        {initials}
                    </div>
                    <span className="text-xs text-slate-400 max-w-[120px] truncate hidden sm:block">{email}</span>
                    <ChevronDown className="w-3 h-3 text-slate-600" />
                </button>

                {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[#0F1722] border border-white/[0.1] shadow-xl z-50 overflow-hidden py-1">
                        <button
                            onClick={() => { router.push("/admin"); setDropdownOpen(false); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Admin settings
                        </button>
                        <div className="h-px bg-white/[0.06] mx-2 my-1" />
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign out
                        </button>
                    </div>
                )}
            </div>
            </div>
        </header>
    );
}
