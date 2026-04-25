/**
 * Business-level Prometheus metrics for the AI Planner.
 *
 * Tracks itinerary generation, user activity, trip CRUD, and
 * user engagement signals (plan regeneration = AI dissatisfaction).
 */

import { getOrCreateCounter, getOrCreateHistogram, getOrCreateGauge } from "./registry";

// ── Itinerary generation ──────────────────────────────────────────────────────

export const plannerItineraryGeneratedTotal = getOrCreateCounter({
    name: "planner_itinerary_generated_total",
    help: "Total itinerary generation attempts",
    labelNames: ["status", "source"] as const,
});

export const plannerItineraryDurationSeconds = getOrCreateHistogram({
    name: "planner_itinerary_duration_seconds",
    help: "End-to-end time for a full itinerary generation",
    labelNames: ["source", "status"] as const,
    buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180],
});

// ── Trip CRUD ──────────────────────────────────────────────────────────────────

export const plannerTripCreatedTotal = getOrCreateCounter({
    name: "planner_trip_created_total",
    help: "Number of trips created",
    labelNames: [] as const,
});

export const plannerTripUpdatedTotal = getOrCreateCounter({
    name: "planner_trip_updated_total",
    help: "Number of trips updated",
    labelNames: [] as const,
});

export const plannerTripDeletedTotal = getOrCreateCounter({
    name: "planner_trip_deleted_total",
    help: "Number of trips deleted",
    labelNames: [] as const,
});

// ── User sessions / activity ───────────────────────────────────────────────────

export const plannerActiveUsers = getOrCreateGauge({
    name: "planner_active_users",
    help: "Number of users with an active session in the last 5 minutes",
    labelNames: [] as const,
});

export const plannerAuthTotal = getOrCreateCounter({
    name: "planner_auth_total",
    help: "Authentication events",
    labelNames: ["event", "method"] as const,
});

// ── AI dissatisfaction proxy ───────────────────────────────────────────────────

export const plannerRegeneratedTotal = getOrCreateCounter({
    name: "planner_regenerated_total",
    help: "Number of times a user regenerated an AI plan (dissatisfaction proxy)",
    labelNames: [] as const,
});

// ── LangGraph workflow business metrics ───────────────────────────────────────

export const langgraphExecutionsTotal = getOrCreateCounter({
    name: "langgraph_executions_total",
    help: "Total LangGraph graph executions",
    labelNames: ["status", "outcome"] as const,
});

export const langgraphExecutionDurationSeconds = getOrCreateHistogram({
    name: "langgraph_execution_duration_seconds",
    help: "Total LangGraph graph execution time in seconds",
    labelNames: ["outcome"] as const,
    buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180],
});

export const langgraphRepairIterationsTotal = getOrCreateCounter({
    name: "langgraph_repair_iterations_total",
    help: "Number of budget/density repair loop iterations triggered",
    labelNames: ["action"] as const,
});

export const plannerChatMessagesTotal = getOrCreateCounter({
    name: "planner_chat_messages_total",
    help: "Total AI chat messages exchanged",
    labelNames: ["direction"] as const,
});
