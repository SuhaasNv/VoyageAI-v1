/**
 * Business-level Prometheus metrics for the AI Planner.
 *
 * Tracks itinerary generation, user activity, trip CRUD, and
 * user engagement signals (plan regeneration = AI dissatisfaction).
 */

import { Counter, Histogram, Gauge } from "prom-client";
import { registry } from "./registry";

// ── Itinerary generation ──────────────────────────────────────────────────────

export const plannerItineraryGeneratedTotal = new Counter({
    name: "planner_itinerary_generated_total",
    help: "Total itinerary generation attempts",
    labelNames: ["status", "source"] as const, // source: langgraph | direct_llm
    registers: [registry],
});

export const plannerItineraryDurationSeconds = new Histogram({
    name: "planner_itinerary_duration_seconds",
    help: "End-to-end time for a full itinerary generation",
    labelNames: ["source", "status"] as const,
    buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180],
    registers: [registry],
});

// ── Trip CRUD ──────────────────────────────────────────────────────────────────

export const plannerTripCreatedTotal = new Counter({
    name: "planner_trip_created_total",
    help: "Number of trips created",
    registers: [registry],
});

export const plannerTripUpdatedTotal = new Counter({
    name: "planner_trip_updated_total",
    help: "Number of trips updated",
    registers: [registry],
});

export const plannerTripDeletedTotal = new Counter({
    name: "planner_trip_deleted_total",
    help: "Number of trips deleted",
    registers: [registry],
});

// ── User sessions / activity ───────────────────────────────────────────────────

export const plannerActiveUsers = new Gauge({
    name: "planner_active_users",
    help: "Number of users with an active session in the last 5 minutes",
    registers: [registry],
});

export const plannerAuthTotal = new Counter({
    name: "planner_auth_total",
    help: "Authentication events",
    labelNames: ["event", "method"] as const, // event: login|logout|register|refresh, method: google|email
    registers: [registry],
});

// ── AI dissatisfaction proxy ───────────────────────────────────────────────────
// A user regenerating a plan is a signal of dissatisfaction with the first result.

export const plannerRegeneratedTotal = new Counter({
    name: "planner_regenerated_total",
    help: "Number of times a user regenerated an AI plan (dissatisfaction proxy)",
    registers: [registry],
});

// ── LangGraph workflow business metrics ───────────────────────────────────────

export const langgraphExecutionsTotal = new Counter({
    name: "langgraph_executions_total",
    help: "Total LangGraph graph executions",
    labelNames: ["status", "outcome"] as const,
    // outcome: ok | requires_human | error
    registers: [registry],
});

export const langgraphExecutionDurationSeconds = new Histogram({
    name: "langgraph_execution_duration_seconds",
    help: "Total LangGraph graph execution time in seconds",
    labelNames: ["outcome"] as const,
    buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180],
    registers: [registry],
});

export const langgraphRepairIterationsTotal = new Counter({
    name: "langgraph_repair_iterations_total",
    help: "Number of budget/density repair loop iterations triggered",
    labelNames: ["action"] as const, // reoptimize_budget | rerun_logistics | ask_user
    registers: [registry],
});

export const plannerChatMessagesTotal = new Counter({
    name: "planner_chat_messages_total",
    help: "Total AI chat messages exchanged",
    labelNames: ["direction"] as const, // user | assistant
    registers: [registry],
});
