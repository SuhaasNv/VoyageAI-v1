"use client";

import { useEffect, useState } from "react";
import { getUpcomingTrips, type Trip } from "@/lib/api";
import { useDashboardTrips } from "@/ui/dashboard/DashboardTripsProvider";

export function useTrips() {
    const ctx = useDashboardTrips();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (ctx) return;
        getUpcomingTrips()
            .then(setTrips)
            .catch((err) => {
                console.error("[useTrips] Failed to fetch trips", err);
            })
            .finally(() => setIsLoading(false));
    }, [!!ctx]);

    if (ctx) {
        return { trips: ctx.trips, isLoading: false, setTrips: ctx.setTrips };
    }
    return { trips, isLoading, setTrips };
}
