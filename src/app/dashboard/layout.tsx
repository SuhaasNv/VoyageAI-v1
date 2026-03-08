import React from "react";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthHydrator } from "@/ui/dashboard/AuthHydrator";
import { DashboardTripsProvider } from "@/ui/dashboard/DashboardTripsProvider";
import { DashboardUserProvider } from "@/ui/dashboard/DashboardUserProvider";
import { DashboardSidebar } from "@/ui/dashboard/DashboardSidebar";
import { LogoutOverlay } from "@/ui/dashboard/LogoutOverlay";
import { OnboardingGuard } from "@/ui/dashboard/OnboardingGuard";
import { Logo } from "@/ui/components/Logo";
import { MobileUserMenu } from "@/ui/dashboard/MobileUserMenu";
import { ACCESS_TOKEN_COOKIE } from "@/services/auth/cookies";
import { verifyAccessToken } from "@/services/auth/tokens";
import { prisma } from "@/lib/prisma";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
    const token    = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
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

    const initialTrips: TripDTO[] = dbTrips.map(trip => {
        const rawJson = trip.itineraries[0]?.rawJson;
        return serializeTrip({ ...trip, imageUrl: trip.imageUrl ?? null }, [], rawJson);
    });

    const user = {
        id:          dbUser.id,
        email:       dbUser.email,
        name:        dbUser.name,
        image:       dbUser.image,
        role:        dbUser.role,
        hasOnboarded: dbUser.hasOnboarded ?? false,
        createdAt:   dbUser.createdAt.toISOString(),
    };

    return (
        <div className="flex flex-col md:flex-row h-screen w-full bg-[#0B0F14] text-white font-sans overflow-hidden relative">
            <LogoutOverlay />
            <DashboardUserProvider user={user} />
            <DashboardTripsProvider initialTrips={initialTrips}>
                <AuthHydrator />
                <OnboardingGuard>
                    {/* Mobile header */}
                    <header className="md:hidden flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0B0F14]/80 backdrop-blur-xl sticky top-0 z-30">
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <Logo size="sm" className="shrink-0 text-white" />
                            <span className="text-lg font-bold tracking-tight uppercase">VoyageAI</span>
                        </Link>
                        <MobileUserMenu user={user} />
                    </header>

                    <div className="flex flex-1 w-full h-full relative z-10 overflow-hidden">
                        {/* Collapsible sidebar */}
                        <DashboardSidebar />

                        {/* Main content */}
                        <main className="relative z-10 flex-1 flex flex-col min-h-0 bg-transparent h-full overflow-hidden">
                            <div className="flex-1 flex flex-col min-h-0">
                                {children}
                            </div>
                        </main>
                    </div>
                </OnboardingGuard>
            </DashboardTripsProvider>
        </div>
    );
}
