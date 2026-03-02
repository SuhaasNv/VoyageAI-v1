"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    BarChart2,
    ArrowLeft,
    Shield,
} from "lucide-react";

const NAV_LINKS = [
    { href: "/admin",             icon: LayoutDashboard, label: "Overview"   },
    { href: "/admin/users",       icon: Users,           label: "Users"      },
    { href: "/admin/ai-metrics",  icon: BarChart2,       label: "AI Metrics" },
];

interface AdminNavProps {
    email: string;
}

export default function AdminNav({ email }: AdminNavProps) {
    const pathname = usePathname();

    return (
        <aside className="w-52 shrink-0 flex flex-col border-r border-white/[0.06] bg-[#060A0F]">
            {/* Brand */}
            <div className="px-5 pt-6 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-md bg-[#10B981]/20 flex items-center justify-center">
                        <Shield className="w-3.5 h-3.5 text-[#10B981]" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#10B981]">
                        Admin Panel
                    </span>
                </div>
                <p className="text-[10px] text-slate-600 font-mono truncate">{email}</p>
            </div>

            {/* Nav */}
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
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                    ? "bg-[#10B981]/10 text-[#10B981]"
                                    : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {label}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="px-4 pb-6 pt-3 border-t border-white/[0.06]">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Dashboard
                </Link>
            </div>
        </aside>
    );
}
