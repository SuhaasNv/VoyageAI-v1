import { Home, Compass, Map, MessageSquare, Settings } from "lucide-react";
import Link from "next/link";
import React from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardBackground } from "@/components/dashboard/DashboardBackground";
import { DashboardSidebarFooter } from "@/components/dashboard/DashboardSidebarFooter";
import { AuthHydrator } from "@/components/dashboard/AuthHydrator";
import { Logo } from "@/components/Logo";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
    if (!token) redirect(`/login?from=${encodeURIComponent(pathname)}`);
    try {
        verifyAccessToken(token);
    } catch {
        redirect(`/login?from=${encodeURIComponent(pathname)}`);
    }

    return (
        <div className="flex h-screen w-full bg-[#0B0F14] text-white font-sans overflow-hidden relative">
            <AuthHydrator />

            <div className="flex w-full h-full relative z-10">
                {/* Sidebar Navigation */}
                <aside className="relative z-20 w-64 bg-[#0B0F14] flex flex-col justify-between p-6 border-r border-white/5 shadow-2xl">
                    <div>
                        <Link href="/dashboard" className="flex items-center gap-2 mb-10 text-white hover:opacity-90 transition-opacity duration-200">
                            <Logo size="md" className="shrink-0 text-white" />
                            <span className="text-xl font-bold tracking-tight uppercase">VoyageAI</span>
                        </Link>

                        <nav className="space-y-1.5">
                            <SidebarLink href="/dashboard" icon={<Home className="w-4 h-4" />} label="Dashboard" active />
                            <SidebarLink href="/dashboard/explore" icon={<Compass className="w-4 h-4" />} label="Explore" />
                            <SidebarLink href="/dashboard/trips" icon={<Map className="w-4 h-4" />} label="My Trips" />
                            <SidebarLink href="/dashboard/messages" icon={<MessageSquare className="w-4 h-4" />} label="Messages" badge="3" />
                        </nav>
                    </div>

                    <div className="space-y-1.5">
                        <SidebarLink href="/dashboard/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
                        <DashboardSidebarFooter />
                    </div>
                </aside>

                {/* Main Content */}
                <main className="relative z-10 flex-1 overflow-y-auto bg-transparent">
                    {children}
                </main>
            </div>
        </div>
    );
}

function SidebarLink({ href, icon, label, active, badge }: { href: string; icon: React.ReactNode; label: string; active?: boolean; badge?: string }) {
    return (
        <Link
            href={href}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 ease-out text-sm font-medium border ${active
                ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
                }`}
        >
            <div className="flex items-center gap-3">
                {icon}
                {label}
            </div>
            {badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center border ${active ? "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30" : "bg-white/5 text-zinc-400 border-white/10"}`}>
                    {badge}
                </span>
            )}
        </Link>
    );
}
