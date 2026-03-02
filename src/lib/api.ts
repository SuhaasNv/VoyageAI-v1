/**
 * lib/api.ts
 *
 * Client-side API wrapper.
 * All fetch logic lives here; UI components import only from this file.
 */

const CSRF_TOKEN_COOKIE = "voyageai_csrf";
import type { TripDTO } from "@/lib/services/trips";

// Re-export Trip so components can keep their existing import path.
export type Trip = TripDTO;

// ─── CSRF ─────────────────────────────────────────────────────────────────────

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`${CSRF_TOKEN_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

// ─── Fetch options ────────────────────────────────────────────────────────────

async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (!token) {
    if (typeof window !== "undefined") {
      await fetch("/api/auth/csrf", { credentials: "include" });
      token = getCsrfToken();
    }
  }
  return token;
}

async function mutatingFetchOptions(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: string
): Promise<RequestInit> {
  return {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": await ensureCsrfToken(),
    },
    ...(body !== undefined && { body }),
  };
}

function readFetchOptions(): RequestInit {
  return {
    method: "GET",
    credentials: "include",
  };
}

// ─── Response unwrapper ───────────────────────────────────────────────────────

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!json?.success) {
    throw new Error(json?.error?.message ?? "Request failed");
  }
  return json.data as T;
}

// ─── Trips ────────────────────────────────────────────────────────────────────

export interface CreateTripInput {
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  style?: "relaxed" | "creative" | "exciting" | "luxury" | "budget";
  budgetTotal?: number;
}

export async function getUpcomingTrips(): Promise<Trip[]> {
  const res = await fetch("/api/trips", readFetchOptions());
  return unwrap<Trip[]>(res);
}

export async function getTripById(id: string): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`, readFetchOptions());
  return unwrap<Trip>(res);
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const options = await mutatingFetchOptions("POST", JSON.stringify(input));
  const res = await fetch("/api/trips", options);
  return unwrap<Trip>(res);
}

export interface UpdateTripInput {
  destination?: string;
  startDate?: string;
  endDate?: string;
  refreshImage?: boolean;
}

export async function updateTrip(id: string, input: UpdateTripInput): Promise<Trip> {
  const options = await mutatingFetchOptions("PATCH", JSON.stringify(input));
  const res = await fetch(`/api/trips/${id}`, options);
  return unwrap<Trip>(res);
}

export async function deleteTrip(id: string): Promise<void> {
  const options = await mutatingFetchOptions("DELETE");
  const res = await fetch(`/api/trips/${id}`, options);
  await unwrap(res);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface OnboardPreferences {
  travelStyles?: string[];
  pacePreference?: "slow" | "moderate" | "fast";
  budgetTier?: "budget" | "mid-range" | "luxury";
  interests?: string[];
}

export async function completeOnboarding(preferences: OnboardPreferences): Promise<void> {
  const options = await mutatingFetchOptions("POST", JSON.stringify(preferences));
  const res = await fetch("/api/auth/onboard", options);
  await unwrap(res);
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface ReoptimizeTripPayload {
  tripId: string;
  currentItinerary: unknown;
  reoptimizationReasons: string[];
  remainingBudget: number;
}

export async function reoptimizeTrip(payload: ReoptimizeTripPayload) {
  const options = await mutatingFetchOptions("POST", JSON.stringify(payload));
  const res = await fetch("/api/ai/reoptimize", options);

  if (!res.ok) {
    throw new Error("Failed to reoptimize trip");
  }

  const json = await res.json();

  if (!json?.success) {
    throw new Error(json?.error?.message ?? "Failed to reoptimize trip");
  }

  return json.data;
}
