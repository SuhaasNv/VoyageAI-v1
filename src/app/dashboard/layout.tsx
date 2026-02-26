import { Home, Settings } from "lucide-react";
import Link from "next/link";
import React from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardSidebarFooter } from "@/components/dashboard/DashboardSidebarFooter";
import { AuthHydrator } from "@/components/dashboard/AuthHydrator";
import { DashboardTripsProvider } from "@/components/dashboard/DashboardTripsProvider";
import { DashboardUserProvider } from "@/components/dashboard/DashboardUserProvider";
import { LogoutOverlay } from "@/components/dashboard/LogoutOverlay";
import { OnboardingGuard } from "@/components/dashboard/OnboardingGuard";
import { Logo } from "@/components/Logo";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const pathname = headersList.get("x-pathname") ?? "/dashboard";
    if (!token) redirect(`/login?from=${encodeURIComponent(pathname)}`);
    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch {
        redirect(`/login?from=${encodeURIComponent(pathname)}`);
    }

    const [dbUser, dbTrips] = await Promise.all([
        prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true, image: true, role: true, hasOnboarded: true, createdAt: true },
        }),
        prisma.trip.findMany({
            where: { userId: payload.sub },
            include: { itineraries: { orderBy: { createdAt: "desc" }, take: 1 } },
            orderBy: { startDate: "asc" },
        }),
    ]);
    if (!dbUser) redirect(`/login?from=${encodeURIComponent(pathname)}`);

    const initialTrips: TripDTO[] = dbTrips.map((trip) => {
        const rawJson = trip.itineraries[0]?.rawJson;
        return serializeTrip({ ...trip, imageUrl: trip.imageUrl ?? null }, [], rawJson);
    });

    const user = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        role: dbUser.role,
        hasOnboarded: dbUser.hasOnboarded ?? false,
        createdAt: dbUser.createdAt.toISOString(),
    };

    return (
        <div className="flex h-screen w-full bg-[#0B0F14] text-white font-sans overflow-hidden relative">
            <LogoutOverlay />
            <DashboardUserProvider user={user} />
            <DashboardTripsProvider initialTrips={initialTrips}>
            <AuthHydrator />
            <OnboardingGuard>
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
            </OnboardingGuard>
            </DashboardTripsProvider>
        </div>
    );
}

function SidebarLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ease-out text-sm font-medium border ${active
                ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
                }`}
        >
            {icon}
            {label}
        </Link>
    );
}
