"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getUpcomingTrips } from "@/lib/api";
import { useDashboardTrips } from "@/ui/dashboard/DashboardTripsProvider";

/**
 * Trip list state lives in the dashboard layout provider. That state is only seeded from
 * the server on the first layout render; client navigations do not re-run the RSC layout.
 * This component stays mounted for all /dashboard/* routes, so when the user navigates
 * back to `/dashboard` (e.g. from `/dashboard/trip/[id]`), we always pull fresh trips from
 * the API — fixing empty grids until hard refresh.
 */
export function DashboardTripsRefreshOnVisit() {
    const pathname = usePathname();
    const ctx = useDashboardTrips();

    useEffect(() => {
        const setTrips = ctx?.setTrips;
        if (!setTrips) return;

        const isDashboardHome =
            pathname === "/dashboard" || pathname === "/dashboard/";

        if (!isDashboardHome) return;

        let cancelled = false;
        getUpcomingTrips()
            .then((trips) => {
                if (!cancelled) setTrips(trips);
            })
            .catch((err) => {
                console.error("[DashboardTripsRefreshOnVisit] Failed to refresh trips", err);
            });

        return () => {
            cancelled = true;
        };
    }, [pathname, ctx?.setTrips]);

    return null;
}
