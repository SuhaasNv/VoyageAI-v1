"use client";

import { useEffect, useState } from "react";
import { getUpcomingTrips, type Trip } from "@/lib/api";
import { useDashboardTrips } from "@/ui/dashboard/DashboardTripsProvider";

/**
 * Dashboard layout seeds trips from the server once. That snapshot does not update on
 * client-side navigations (layout stays mounted), so we always re-fetch when this hook
 * mounts when the provider is present — e.g. returning from /dashboard/trip/[id] after
 * creating a trip.
 */
export function useTrips() {
    const ctx = useDashboardTrips();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const syncIntoProvider = ctx?.setTrips;

        if (syncIntoProvider) {
            getUpcomingTrips()
                .then(syncIntoProvider)
                .catch((err) => {
                    console.error("[useTrips] Failed to refresh trips", err);
                });
            return;
        }

        setIsLoading(true);
        getUpcomingTrips()
            .then(setTrips)
            .catch((err) => {
                console.error("[useTrips] Failed to fetch trips", err);
            })
            .finally(() => setIsLoading(false));
    }, [ctx?.setTrips]);

    if (ctx) {
        return { trips: ctx.trips, isLoading: false, setTrips: ctx.setTrips };
    }
    return { trips, isLoading, setTrips };
}
