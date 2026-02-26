import { upcomingTripsData, tokyoTripData } from "@/data/mock-trip";
import { CSRF_TOKEN_COOKIE } from "@/lib/auth/cookies";

export type Trip = (typeof upcomingTripsData)[number];

export function getCsrfToken(): string {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(new RegExp(`${CSRF_TOKEN_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : "";
}

function mutatingFetchOptions(method: "POST" | "PUT" | "PATCH" | "DELETE", body?: string): RequestInit {
    return {
        method,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
        },
        ...(body !== undefined && { body }),
    };
}

export interface CreateTripInput {
  title: string;
  destination: string;
  dates: string;
  budgetTotal?: number;
  currency?: string;
}

export interface ReoptimizeTripPayload {
  tripId: string;
  currentItinerary: unknown;
  reoptimizationReasons: string[];
  remainingBudget: number;
}

export async function getUpcomingTrips(): Promise<Trip[]> {
  return upcomingTripsData;
}

export async function getTripById(id: string): Promise<Trip> {
  const trips = await getUpcomingTrips();
  return trips.find((trip) => trip.id === id) ?? tokyoTripData;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const base = upcomingTripsData[0] ?? tokyoTripData;

  return {
    ...base,
    id: `temp-${Date.now()}`,
    title: input.title,
    destination: input.destination,
    dates: input.dates,
    status: "planning",
    budget: {
      ...base.budget,
      total: input.budgetTotal ?? base.budget.total,
      spent: 0,
      currency: input.currency ?? base.budget.currency,
    },
    itinerary: [],
  };
}

export async function reoptimizeTrip(payload: ReoptimizeTripPayload) {
  const res = await fetch("/api/ai/reoptimize", {
    ...mutatingFetchOptions("POST", JSON.stringify(payload)),
  });

  if (!res.ok) {
    throw new Error("Failed to reoptimize trip");
  }

  const json = await res.json();

  if (!json?.success) {
    throw new Error(json?.error?.message ?? "Failed to reoptimize trip");
  }

  return json.data;
}

