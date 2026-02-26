"use client";

import { createContext, useContext, useState } from "react";
import type { Trip } from "@/lib/api";

interface DashboardTripsContextValue {
    trips: Trip[];
    setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
    isLoading: boolean;
}

const DashboardTripsContext = createContext<DashboardTripsContextValue | null>(null);

export function DashboardTripsProvider({
    initialTrips,
    children,
}: {
    initialTrips: Trip[];
    children: React.ReactNode;
}) {
    const [trips, setTrips] = useState<Trip[]>(initialTrips);
    const value: DashboardTripsContextValue = {
        trips,
        setTrips,
        isLoading: false,
    };
    return (
        <DashboardTripsContext.Provider value={value}>
            {children}
        </DashboardTripsContext.Provider>
    );
}

export function useDashboardTrips() {
    const ctx = useContext(DashboardTripsContext);
    return ctx;
}
